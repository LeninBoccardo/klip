import type { ICreatorRepository, IVideoRepository } from '@domain/repositories'
import type {
  IFileSystemReader,
  IFileSystemWriter,
  IPathResolver,
  INotifier,
  RootPathRef
} from '@domain/ports'
import type { Video } from '@domain/entities'
import type { MoveVideosToCreatorRequest, MoveVideosToCreatorResult } from '@shared/types'
import type { IMoveVideosToCreator } from './IMoveVideosToCreator'
import {
  EmptyVideoIdsError,
  EmptyTargetCreatorError,
  TargetCreatorNotFoundError
} from './errors/MoveVideosErrors'
import { redactError } from '@domain/types/redact'

export class MoveVideosToCreator implements IMoveVideosToCreator {
  constructor(
    private readonly videoRepo: IVideoRepository,
    private readonly creatorRepo: ICreatorRepository,
    private readonly fsReader: IFileSystemReader,
    private readonly fsWriter: IFileSystemWriter,
    private readonly pathResolver: IPathResolver,
    private readonly notifier: INotifier,
    private readonly rootPath: RootPathRef
  ) {}

  async execute(request: MoveVideosToCreatorRequest): Promise<MoveVideosToCreatorResult> {
    const { videoIds, targetCreatorId } = request
    if (videoIds.length === 0) throw new EmptyVideoIdsError()
    if (!targetCreatorId) throw new EmptyTargetCreatorError()

    const target = this.creatorRepo.findById(targetCreatorId)
    if (!target) throw new TargetCreatorNotFoundError(targetCreatorId)

    const root = this.rootPath.value
    let moved = 0
    let skipped = 0
    const errors: Record<string, string> = {}

    for (const videoId of videoIds) {
      const video = this.videoRepo.findById(videoId)

      // Skip silently for not-found / not-active / already-in-target. These
      // are legitimate UI states (the user multi-selected after a refresh, or
      // double-submitted) — they shouldn't fail the whole batch.
      if (!video || video.status !== 'active' || video.creatorId === targetCreatorId) {
        skipped++
        continue
      }

      // Disk paths are keyed by the creator's folderName (a slug), NOT the
      // entity id (a UUID). Using the id worked only for download-created
      // creators where id happened to equal folderName; for a RegisterCreator'd
      // creator (UUID id) the path didn't exist, the move was silently skipped,
      // and the DB creatorId flipped anyway — leaving the file mis-linked.
      const sourceCreator = this.creatorRepo.findById(video.creatorId)
      if (!sourceCreator) {
        errors[videoId] = `Source creator "${video.creatorId}" not found`
        continue
      }

      const oldDir = this.pathResolver.join(root, sourceCreator.folderName, 'downloads', videoId)
      const newDir = this.pathResolver.join(root, target.folderName, 'downloads', videoId)

      try {
        // Make sure the destination tree exists. moveDirectory itself only
        // moves the leaf; the parent `<root>/<target>/downloads/` may not
        // exist yet if the target creator has never had a download.
        const targetDownloads = this.pathResolver.join(root, target.folderName, 'downloads')
        this.fsWriter.ensureDirectory(targetDownloads)

        if (this.fsReader.directoryExists(oldDir)) {
          this.fsWriter.moveDirectory(oldDir, newDir)
        }
        // If the source dir is missing we still update the DB row so the
        // creator linkage matches the user's intent — reconcile will mark
        // the entity as `missing` if the file is genuinely gone.

        const updated: Video = {
          ...video,
          creatorId: targetCreatorId,
          filePath: rewritePath(video.filePath, oldDir, newDir) ?? video.filePath,
          thumbnailPath: rewritePath(video.thumbnailPath, oldDir, newDir),
          transcriptPath: rewritePath(video.transcriptPath, oldDir, newDir),
          updatedAt: new Date().toISOString()
        }
        this.videoRepo.upsertWithPrevious(updated, video)
        moved++
      } catch (err) {
        errors[videoId] = err instanceof Error ? err.message : String(err)
        console.error(`[MoveVideosToCreator] Failed to move ${videoId}:`, redactError(err, root))
      }
    }

    if (moved > 0) {
      this.notifier.notify('db-updated', { scope: ['videos', 'creators'] })
    }

    return { moved, skipped, errors }
  }
}

function rewritePath(current: string | null, oldDir: string, newDir: string): string | null {
  if (!current) return current
  if (current.startsWith(oldDir)) {
    return newDir + current.slice(oldDir.length)
  }
  return current
}
