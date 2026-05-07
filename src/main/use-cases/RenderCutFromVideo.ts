import { z } from 'zod'
import type { ICreatorRepository, ICutRepository, IOperationRepository } from '@domain/repositories'
import type { IVideoRepository } from '@domain/repositories'
import type {
  IRenderBackend,
  IRenderQueue,
  IEditorSessionStore,
  IFileSystemReader,
  IFileSystemWriter,
  IPathResolver,
  IIdGenerator,
  INotifier,
  RootPathRef
} from '@domain/ports'
import { RenderCancelledError } from '@domain/ports'
import type { Cut, Operation } from '@domain/entities'
import type { EditRecipe, RenderCutRequest, RenderCutResponse, RenderProgress } from '@shared/types'
import { renderCutRequestSchema } from '@shared/types'
import { redactError } from '@domain/types/redact'
import type { IRenderCutFromVideo } from './IRenderCutFromVideo'

/**
 * The only path that creates a `Cut` row from in-app editing. Mirrors
 * the structure of `DownloadVideo` (returns immediately with a tracking
 * id; runs the long-running work inside a queue task that emits push
 * events). The render lifecycle is:
 *
 *   1. Validate the request (Zod) and pick a backend (`canRender`).
 *   2. Resolve source video + creator; refuse if either is missing or
 *      the source file isn't on disk.
 *   3. Generate `cutId`, compute `finalPath` and `stagingPath`.
 *   4. Insert the `operations` row (status=pending, payload carries
 *      everything the recovery sweep needs to clean up if we crash
 *      before the queue task runs).
 *   5. Insert the `Cut` row pointing at `finalPath` with probe-pending —
 *      *before* the file lands in the cuts folder. This is the watcher-
 *      race guard from plan §6: when the rename below fires the watcher,
 *      `discoverCuts` sees the row and skips re-inserting.
 *   6. Open the editor session, emit a `queued` progress event, and
 *      enqueue the work.
 *   7. Inside the queue task: ensure staging + final dirs, run the
 *      backend with the abort signal, then on success atomically rename
 *      the staging output into the final path, write `cut-data.json`
 *      sidecar, and mark the operation completed.
 *   8. On `RenderCancelledError`: cleanup staging, delete the Cut row,
 *      mark the operation rolled-back. On any other error: same cleanup
 *      but mark the operation failed.
 *
 * The use case never re-throws from the queue task — terminal state is
 * always communicated via the `render-progress` push event. The .catch
 * at the enqueue site is a residual guard for queue-level rejections
 * (e.g. shutdown drain) so the UI never gets stuck in `queued`.
 */
export class RenderCutFromVideo implements IRenderCutFromVideo {
  constructor(
    private readonly backends: IRenderBackend[],
    private readonly queue: IRenderQueue,
    private readonly sessions: IEditorSessionStore,
    private readonly cutRepo: ICutRepository,
    private readonly creatorRepo: ICreatorRepository,
    private readonly videoRepo: IVideoRepository,
    private readonly operationRepo: IOperationRepository,
    private readonly fsReader: IFileSystemReader,
    private readonly fsWriter: IFileSystemWriter,
    private readonly pathResolver: IPathResolver,
    private readonly idGenerator: IIdGenerator,
    private readonly notifier: INotifier,
    private readonly rootPath: RootPathRef
  ) {}

  async execute(request: RenderCutRequest): Promise<RenderCutResponse> {
    const parsed = renderCutRequestSchema.safeParse(request)
    if (!parsed.success) {
      throw new Error(`Invalid render request: ${parsed.error.message}`)
    }
    const { recipe, title, tags } = parsed.data

    const backend = this.pickBackend(recipe)
    if (!backend) {
      throw new Error('No render backend can handle this recipe (this should not happen in MVP)')
    }

    const sourceVideo = this.videoRepo.findById(recipe.sourceVideoId)
    if (!sourceVideo) {
      throw new Error(`Source video not found: ${recipe.sourceVideoId}`)
    }
    if (!this.fsReader.fileExists(sourceVideo.filePath)) {
      throw new Error(`Source video file is missing on disk: ${sourceVideo.filePath}`)
    }

    const creator = this.creatorRepo.findById(sourceVideo.creatorId)
    if (!creator) {
      throw new Error(`Creator not found for source video: ${sourceVideo.creatorId}`)
    }

    const cutId = this.idGenerator.generate()
    const jobId = this.idGenerator.generate()
    const fileName = `${cutId}.${recipe.output.container}`
    const cutDir = this.pathResolver.join(this.rootPath.value, creator.folderName, 'cuts', cutId)
    const finalPath = this.pathResolver.join(cutDir, fileName)
    const stagingPath = this.pathResolver.join(
      this.rootPath.value,
      '.klip-render',
      `${cutId}.${recipe.output.container}`
    )
    const recipeJson = JSON.stringify(recipe)
    const now = new Date().toISOString()

    // 1. Persist an Operation for crash-recovery before any DB row exists.
    //    If we crash between here and the rename, the recovery sweep finds
    //    the operation row, deletes any partial staging file, and removes
    //    the Cut row inserted in step 2.
    const operation: Operation = {
      id: jobId,
      type: 'render_cut',
      status: 'pending',
      payload: JSON.stringify({
        version: 1,
        cutId,
        finalPath,
        stagingPath,
        cutDir
      } satisfies RenderCutOpPayload),
      error: null,
      startedAt: null,
      completedAt: null,
      createdAt: now
    }
    this.operationRepo.create(operation)

    // 2. Insert the Cut row up front — see §6 of the plan. The file isn't
    //    on disk yet at finalPath; the renderer's klip-media://cut/<id>/file
    //    will 404 during the brief render window, which is acceptable
    //    because the user is in the editor window watching the progress
    //    bar, not browsing the main window's cuts list.
    const trim = recipe.ops[0]
    const startTimestamp = trim.type === 'trim' ? trim.in : null
    const endTimestamp = trim.type === 'trim' ? trim.out : null
    const cut: Cut = {
      id: cutId,
      creatorId: creator.id,
      videoId: sourceVideo.id,
      title,
      tags,
      startTimestamp,
      endTimestamp,
      duration: null,
      resolution: null,
      fileSize: null,
      filePath: finalPath,
      thumbnailPath: null,
      probeStatus: 'pending',
      status: 'active',
      deletedAt: null,
      editRecipeJson: recipeJson,
      createdAt: now,
      updatedAt: now
    }
    this.cutRepo.upsertWithPrevious(cut, null)

    // 3. Open the session before enqueue so a fast cancel
    //    (user clicks before the queue picks up the task) finds the
    //    AbortController and routes correctly.
    const controller = new AbortController()
    this.sessions.open(
      {
        jobId,
        cutId,
        recipe,
        status: 'queued',
        percent: null,
        startedAt: now,
        finishedAt: null,
        errorMessage: null
      },
      controller
    )

    this.emit({
      jobId,
      cutId,
      sourceVideoId: sourceVideo.id,
      status: 'queued',
      percent: null
    })

    this.queue
      .enqueue(() =>
        this.performRender({
          jobId,
          cutId,
          sourceVideoId: sourceVideo.id,
          backend,
          recipe,
          sourcePath: sourceVideo.filePath,
          stagingPath,
          finalPath,
          cutDir,
          title,
          tags
        })
      )
      .catch((err) => {
        // Defence-in-depth: the inner task swallows its own errors. This
        // catches queue-level rejections (e.g. shutdown drain) so the UI
        // doesn't stay stuck in `queued`.
        this.failGracefully(jobId, cutId, sourceVideo.id, stagingPath, err)
      })

    return { jobId, cutId }
  }

  // ── Private ──

  private pickBackend(recipe: EditRecipe): IRenderBackend | null {
    for (const backend of this.backends) {
      if (backend.canRender(recipe).ok) return backend
    }
    return null
  }

  private async performRender(args: {
    jobId: string
    cutId: string
    sourceVideoId: string
    backend: IRenderBackend
    recipe: EditRecipe
    sourcePath: string
    stagingPath: string
    finalPath: string
    cutDir: string
    title: string
    tags: string[]
  }): Promise<void> {
    const {
      jobId,
      cutId,
      sourceVideoId,
      backend,
      recipe,
      sourcePath,
      stagingPath,
      finalPath,
      cutDir,
      title,
      tags
    } = args

    const controller = this.sessions.getAbortController(jobId)
    if (!controller) {
      // Should be unreachable — open() was just called. Belt-and-braces.
      return
    }

    this.operationRepo.updateStatus(jobId, 'in_progress')
    this.sessions.update(jobId, { status: 'rendering', percent: 0 })
    this.emit({ jobId, cutId, sourceVideoId, status: 'rendering', percent: 0 })

    try {
      // Staging dir under the root so it sits on the same filesystem as
      // the final cuts dir (rename is then atomic; cross-device moves
      // would degrade to copy+unlink and lose atomicity).
      const stagingDir = this.pathResolver.dirname(stagingPath)
      this.fsWriter.ensureDirectory(stagingDir)

      await backend.render(
        { recipe, sourcePath, stagingPath },
        {
          signal: controller.signal,
          onProgress: (percent) => {
            this.sessions.update(jobId, { percent })
            this.emit({ jobId, cutId, sourceVideoId, status: 'rendering', percent })
          }
        }
      )

      // Backend resolved successfully → cleanup must NOT delete the
      // staging file from here on; ownership transfers to the rename.
      this.sessions.update(jobId, { status: 'finalizing', percent: 100 })
      this.emit({ jobId, cutId, sourceVideoId, status: 'finalizing', percent: 100 })

      // Final dir + atomic-ish rename. `fsReader.fileExists` lets us
      // surface a friendly error if the backend lied about success.
      this.fsWriter.ensureDirectory(cutDir)
      if (!this.fsReader.fileExists(stagingPath)) {
        throw new Error(`Render backend reported success but no file at ${stagingPath}`)
      }
      this.fsWriter.renameDirectory(stagingPath, finalPath)

      // Sidecar parity with sideloaded cuts (plan §8.Q3). The reconcile
      // path doesn't read `editRecipe` in MVP, but persisting it now
      // makes v2's "re-edit this cut" feature work for every editor-
      // produced cut shipped from day one.
      const sidecarPath = this.pathResolver.join(cutDir, 'cut-data.json')
      const trim = recipe.ops[0]
      const sidecarPayload = {
        title,
        tags,
        startTimestamp: trim.type === 'trim' ? trim.in : undefined,
        endTimestamp: trim.type === 'trim' ? trim.out : undefined,
        editRecipe: recipe
      }
      this.fsWriter.writeFile(sidecarPath, JSON.stringify(sidecarPayload, null, 2))

      this.operationRepo.updateStatus(jobId, 'completed')
      this.sessions.finalize(jobId, 'complete')
      this.emit({ jobId, cutId, sourceVideoId, status: 'complete', percent: 100 })

      // Refresh the cuts list and trigger the existing probe pipeline
      // (probe-status='pending' → EnrichMediaMetadata picks it up on
      // the next reconcile cycle, fills duration/resolution/fileSize).
      this.notifier.notify('db-updated', { scope: ['cuts'] })
    } catch (err) {
      const cancelled = err instanceof RenderCancelledError
      this.cleanupOnFailure(stagingPath, cutId)

      if (cancelled) {
        this.operationRepo.updateStatus(jobId, 'rolled_back', 'Render cancelled by user')
        this.sessions.finalize(jobId, 'cancelled', 'Render cancelled by user')
        this.emit({ jobId, cutId, sourceVideoId, status: 'cancelled', percent: null })
      } else {
        const message = err instanceof Error ? err.message : String(err)
        this.operationRepo.updateStatus(jobId, 'failed', message)
        this.sessions.finalize(jobId, 'error', message)
        this.emit({
          jobId,
          cutId,
          sourceVideoId,
          status: 'error',
          percent: null,
          errorMessage: message
        })
        console.error(`[klip] Render failed (${jobId}):`, redactError(err, this.rootPath.value))
      }

      this.notifier.notify('db-updated', { scope: ['cuts'] })
    }
  }

  /**
   * Best-effort cleanup of artifacts created by a failed/cancelled render.
   * Both deletions are idempotent — the file may not exist (the backend
   * may have crashed before writing anything), and the row may already
   * be gone (a recovery sweep may have beaten us to it).
   */
  private cleanupOnFailure(stagingPath: string, cutId: string): void {
    try {
      this.fsWriter.deleteFile(stagingPath)
    } catch {
      // Cleanup is best-effort. Recovery sweep on next launch covers
      // anything we leak.
    }
    try {
      this.cutRepo.delete(cutId)
    } catch {
      // Same reasoning.
    }
  }

  private failGracefully(
    jobId: string,
    cutId: string,
    sourceVideoId: string,
    stagingPath: string,
    err: unknown
  ): void {
    const message = err instanceof Error ? err.message : String(err)
    this.cleanupOnFailure(stagingPath, cutId)
    try {
      this.operationRepo.updateStatus(jobId, 'failed', message)
    } catch {
      // ignored
    }
    this.sessions.finalize(jobId, 'error', message)
    this.emit({
      jobId,
      cutId,
      sourceVideoId,
      status: 'error',
      percent: null,
      errorMessage: message
    })
    console.error(
      `[klip] Render queue rejection (${jobId}):`,
      redactError(err, this.rootPath.value)
    )
    this.notifier.notify('db-updated', { scope: ['cuts'] })
  }

  private emit(progress: RenderProgress): void {
    this.notifier.notify('render-progress', progress)
  }
}

/**
 * Payload shape persisted in `operations.payload` for `render_cut` rows.
 * Single declaration so the writer (this use-case) and the reader
 * (`RecoverOperations`) cannot drift — adding a field here updates both
 * the runtime parse and the TS shape in one place.
 */
export const renderCutOpPayloadSchema = z
  .object({
    version: z.literal(1),
    cutId: z.string().min(1),
    finalPath: z.string().min(1),
    stagingPath: z.string().min(1),
    cutDir: z.string().min(1)
  })
  .strict()

export type RenderCutOpPayload = z.infer<typeof renderCutOpPayloadSchema>
