import type { ICreatorRepository, IVideoRepository, ICutRepository } from '@domain/repositories'
import type { IFileSystemReader, IPathResolver, ITransactionScope } from '@domain/ports'
import type { Creator, Video, Cut } from '@domain/entities'
import { editRecipeSchema } from '@shared/types'
import type { IReconcileDirectory, ReconcileResult } from './IReconcileDirectory'

/** Metadata shape expected inside `meta.json` (video downloads) */
interface MetaJson {
  url?: string
  title?: string
  duration?: number
  downloadDate?: string
}

/** Metadata shape expected inside `cut-data.json` */
interface CutDataJson {
  title?: string
  tags?: string[]
  startTimestamp?: number
  endTimestamp?: number
  // Editor-produced sidecars carry the recipe so v2's "re-edit this cut"
  // can rehydrate the timeline state. Typed as `unknown` because the JSON
  // is read from disk and may be missing/malformed; `upsertCutFromDisk`
  // runs `editRecipeSchema.safeParse` before persisting.
  editRecipe?: unknown
}

/** Metadata shape expected inside `creator.json` */
interface CreatorJson {
  name?: string
  profileImagePath?: string
  // Remote channel avatar URL (YouTube hosts these on yt3.ggpht.com /
  // googleusercontent.com — CSP allows both). When present in the
  // sidecar, reconciliation persists it so a DB wipe + library survival
  // reconstructs the avatar without an extra yt-dlp call.
  avatarUrl?: string
  youtubeChannelId?: string
  youtubeChannelUrl?: string
}

function emptyResult(): ReconcileResult {
  return {
    creatorsAdded: 0,
    creatorsMarkedMissing: 0,
    creatorsRecovered: 0,
    videosAdded: 0,
    videosMarkedMissing: 0,
    videosRecovered: 0,
    cutsAdded: 0,
    cutsMarkedMissing: 0,
    cutsRecovered: 0
  }
}

function mergeResults(a: ReconcileResult, b: ReconcileResult): ReconcileResult {
  return {
    creatorsAdded: a.creatorsAdded + b.creatorsAdded,
    creatorsMarkedMissing: a.creatorsMarkedMissing + b.creatorsMarkedMissing,
    creatorsRecovered: a.creatorsRecovered + b.creatorsRecovered,
    videosAdded: a.videosAdded + b.videosAdded,
    videosMarkedMissing: a.videosMarkedMissing + b.videosMarkedMissing,
    videosRecovered: a.videosRecovered + b.videosRecovered,
    cutsAdded: a.cutsAdded + b.cutsAdded,
    cutsMarkedMissing: a.cutsMarkedMissing + b.cutsMarkedMissing,
    cutsRecovered: a.cutsRecovered + b.cutsRecovered
  }
}

/**
 * Reconciles the SQLite index with the physical file system.
 *
 * Pipeline: snapshot FS → snapshot DB → compute diff → apply changes in batch.
 * Never hard-deletes. Marks missing entities with status = 'missing'.
 * Entities with status = 'deleted' are never touched (user-confirmed).
 *
 * All mutations run inside a single DB transaction for atomicity.
 */
export class ReconcileDirectory implements IReconcileDirectory {
  constructor(
    private creatorRepo: ICreatorRepository,
    private videoRepo: IVideoRepository,
    private cutRepo: ICutRepository,
    private fs: IFileSystemReader,
    private path: IPathResolver,
    private transaction: ITransactionScope
  ) {}

  execute(rootPath: string): ReconcileResult {
    return this.transaction.run(() => this.executeInternal(rootPath))
  }

  executeForCreator(rootPath: string, creatorName: string): ReconcileResult {
    return this.transaction.run(() => this.executeForCreatorInternal(rootPath, creatorName))
  }

  executeForCreatorBatch(rootPath: string, creatorNames: string[]): ReconcileResult {
    if (creatorNames.length === 0) return emptyResult()
    return this.transaction.run(() => {
      let combined = emptyResult()
      for (const name of creatorNames) {
        const r = this.executeForCreatorInternal(rootPath, name)
        combined = mergeResults(combined, r)
      }
      return combined
    })
  }

  // ── Internal (called inside transaction) ──

  private executeInternal(rootPath: string): ReconcileResult {
    const result = emptyResult()

    // ── 1. Snapshot (single bulk read of each table — avoids per-creator N+1) ──
    const dbCreators = this.creatorRepo.findAll()
    const diskCreatorNames = new Set(this.fs.listDirectories(rootPath))

    // Map keyed by folderName, not id — disk folders are matched against
    // folderName everywhere (step 2 already iterates by creator.folderName),
    // and the previous id-keyed lookup misclassified any creator whose
    // `id` differs from its `folderName` (e.g. RegisterCreator assigns a
    // random UUID id with a separate folderName) as a brand-new
    // discovery, triggering a UNIQUE constraint on creators.folder_name
    // when the discover-new INSERT below ran for an already-present
    // folder.
    const dbCreatorMap = new Map(dbCreators.map((c) => [c.folderName, c]))
    const videosByCreator = this.groupByCreator(this.videoRepo.findAll())
    const cutsByCreator = this.groupByCreator(this.cutRepo.findAll())

    // ── 2. Reconcile existing DB creators against disk ──
    for (const creator of dbCreators) {
      if (creator.status === 'deleted') continue // respect user deletion

      if (diskCreatorNames.has(creator.folderName)) {
        // Creator folder exists
        if (creator.status === 'missing') {
          this.creatorRepo.updateStatus(creator.id, 'active', null)
          result.creatorsRecovered++
        }
        this.reconcileVideos(rootPath, creator, videosByCreator.get(creator.id) ?? [], result)
        this.reconcileCuts(rootPath, creator, cutsByCreator.get(creator.id) ?? [], result)
      } else {
        // Creator folder missing from disk
        if (creator.status !== 'missing') {
          this.creatorRepo.updateStatus(creator.id, 'missing', null)
          result.creatorsMarkedMissing++
          this.markChildrenMissing(
            videosByCreator.get(creator.id) ?? [],
            cutsByCreator.get(creator.id) ?? [],
            result
          )
        }
      }
    }

    // ── 3. Discover new creators from disk ──
    for (const dirName of diskCreatorNames) {
      if (dbCreatorMap.has(dirName)) continue // already processed

      const creatorDir = this.path.join(rootPath, dirName)
      const creatorJson = this.fs.readJsonFile<CreatorJson>(
        this.path.join(creatorDir, 'creator.json')
      )

      const now = new Date().toISOString()
      const newCreator: Creator = {
        id: dirName,
        folderName: dirName,
        name: creatorJson?.name ?? dirName,
        profileImagePath: creatorJson?.profileImagePath ?? null,
        youtubeChannelId: creatorJson?.youtubeChannelId ?? null,
        youtubeChannelUrl: creatorJson?.youtubeChannelUrl ?? null,
        subscriberCount: null,
        // Reconciliation runs inside a sync DB transaction, so we can't
        // await an extra yt-dlp call here to fetch a fresh avatar. Honour
        // whatever the on-disk sidecar carries; creators auto-created via
        // DownloadVideo populate avatarUrl directly on the DB row, not
        // through this path.
        avatarUrl: creatorJson?.avatarUrl ?? null,
        notes: null,
        tags: [],
        status: 'active',
        deletedAt: null,
        createdAt: now,
        updatedAt: now
      }
      // Disk-discovered creators have no prior DB state by construction.
      this.creatorRepo.upsertWithPrevious(newCreator, null)
      result.creatorsAdded++

      // Scan downloads + cuts for the new creator
      this.discoverVideos(rootPath, newCreator, result)
      this.discoverCuts(rootPath, newCreator, result)
    }

    return result
  }

  /** Group a flat list of entities by `creatorId` into a Map for O(1) per-creator lookup. */
  private groupByCreator<T extends { creatorId: string }>(entities: T[]): Map<string, T[]> {
    const map = new Map<string, T[]>()
    for (const e of entities) {
      const list = map.get(e.creatorId)
      if (list) list.push(e)
      else map.set(e.creatorId, [e])
    }
    return map
  }

  private executeForCreatorInternal(rootPath: string, creatorName: string): ReconcileResult {
    const result = emptyResult()

    // `creatorName` is a folderName — it's extracted from a file-event
    // path's first segment by ProcessFileNotifications.processGranular.
    // The previous `findById(creatorName)` only matched when id ===
    // folderName, which is true for DownloadVideo-created creators but
    // false for RegisterCreator-created ones (those carry a UUID id).
    // Same bug class as the one fixed in executeInternal's map keying.
    const existing = this.creatorRepo.findByFolderName(creatorName)
    const creatorDir = this.path.join(rootPath, creatorName)
    const folderExists = this.fs.directoryExists(creatorDir)

    if (existing) {
      if (existing.status === 'deleted') return result // respect user deletion

      if (folderExists) {
        // Creator folder exists — recover if missing
        if (existing.status === 'missing') {
          this.creatorRepo.updateStatus(existing.id, 'active', null)
          result.creatorsRecovered++
        }
        // Single-creator path: targeted query is fine (no N+1 fan-out)
        this.reconcileVideos(
          rootPath,
          existing,
          this.videoRepo.findByCreatorId(existing.id),
          result
        )
        this.reconcileCuts(rootPath, existing, this.cutRepo.findByCreatorId(existing.id), result)
      } else {
        // Creator folder gone
        if (existing.status !== 'missing') {
          this.creatorRepo.updateStatus(existing.id, 'missing', null)
          result.creatorsMarkedMissing++
          this.markChildrenMissing(
            this.videoRepo.findByCreatorId(existing.id),
            this.cutRepo.findByCreatorId(existing.id),
            result
          )
        }
      }
    } else if (folderExists) {
      // New creator discovered
      const creatorJson = this.fs.readJsonFile<CreatorJson>(
        this.path.join(creatorDir, 'creator.json')
      )
      const now = new Date().toISOString()
      const newCreator: Creator = {
        id: creatorName,
        folderName: creatorName,
        name: creatorJson?.name ?? creatorName,
        profileImagePath: creatorJson?.profileImagePath ?? null,
        youtubeChannelId: creatorJson?.youtubeChannelId ?? null,
        youtubeChannelUrl: creatorJson?.youtubeChannelUrl ?? null,
        subscriberCount: null,
        // See note in executeInternal: reconciliation persists whatever
        // avatarUrl the sidecar carries; live channel fetches happen in
        // DownloadVideo, not here.
        avatarUrl: creatorJson?.avatarUrl ?? null,
        notes: null,
        tags: [],
        status: 'active',
        deletedAt: null,
        createdAt: now,
        updatedAt: now
      }
      // Disk-discovered creators have no prior DB state by construction.
      this.creatorRepo.upsertWithPrevious(newCreator, null)
      result.creatorsAdded++

      this.discoverVideos(rootPath, newCreator, result)
      this.discoverCuts(rootPath, newCreator, result)
    }

    return result
  }

  // ── Video reconciliation ──

  /**
   * @param dbVideos pre-fetched list of this creator's videos from the DB.
   *                 Caller (full-sweep) has these grouped from a single
   *                 `findAll()`; single-creator path queries on demand.
   */
  private reconcileVideos(
    rootPath: string,
    creator: Creator,
    dbVideos: Video[],
    result: ReconcileResult
  ): void {
    const downloadsDir = this.path.join(rootPath, creator.folderName, 'downloads')
    const diskVideoIds = new Set(this.fs.listDirectories(downloadsDir))

    for (const video of dbVideos) {
      if (video.status === 'deleted') continue

      if (diskVideoIds.has(video.id)) {
        if (video.status === 'missing') {
          this.videoRepo.updateStatus(video.id, 'active', null)
          result.videosRecovered++
        }
        diskVideoIds.delete(video.id) // mark as processed
      } else {
        if (video.status !== 'missing') {
          this.videoRepo.updateStatus(video.id, 'missing', null)
          result.videosMarkedMissing++
        }
      }
    }

    // Discover genuinely new videos only
    for (const videoId of diskVideoIds) {
      this.upsertVideoFromDisk(rootPath, creator, videoId, null, result)
    }
  }

  private discoverVideos(rootPath: string, creator: Creator, result: ReconcileResult): void {
    const downloadsDir = this.path.join(rootPath, creator.folderName, 'downloads')
    const videoIds = this.fs.listDirectories(downloadsDir)

    for (const videoId of videoIds) {
      // Guard: only insert truly new entities — don't overwrite existing DB data.
      // (Possible if the same yt-dlp video ID was downloaded under a different
      // creator folder previously.)
      const existing = this.videoRepo.findById(videoId)
      if (existing) {
        if (existing.creatorId !== creator.id) {
          // Same video id now lives under a different creator folder on disk.
          // Re-point creatorId/filePath to the current location (preserving
          // metadata) rather than leaving a stale pointer into the old folder. (F23)
          this.repointVideo(rootPath, creator, videoId, existing, result)
        } else if (existing.status === 'missing') {
          this.videoRepo.updateStatus(videoId, 'active', null)
          result.videosRecovered++
        }
        continue
      }
      this.upsertVideoFromDisk(rootPath, creator, videoId, null, result)
    }
  }

  private upsertVideoFromDisk(
    rootPath: string,
    creator: Creator,
    videoId: string,
    previous: Video | null,
    result: ReconcileResult
  ): void {
    const videoDir = this.path.join(rootPath, creator.folderName, 'downloads', videoId)
    const metaJson = this.fs.readJsonFile<MetaJson>(this.path.join(videoDir, 'meta.json'))
    const { mediaFile, thumbFile } = this.resolveVideoFiles(videoDir, videoId)

    // No media file yet — almost always a mid-download race (yt-dlp wrote the
    // `.info.json` / `.part` first, the file watcher fired before the final
    // `.mp4` landed). Refuse to catalogue the directory itself as a video:
    // that's the bug class that produced the "codec can't play" symptom.
    // DownloadVideo.execute will write the correct row when yt-dlp finishes;
    // a later watcher event will trigger reconcile again with the real media
    // file present.
    if (!mediaFile) return

    const now = new Date().toISOString()
    const newVideo: Video = {
      id: videoId,
      creatorId: creator.id,
      title: metaJson?.title ?? videoId,
      url: metaJson?.url ?? null,
      duration: metaJson?.duration ?? null,
      resolution: null,
      fileSize: null,
      // Populated later by EnrichMediaMetadata's ffprobe pass (probeStatus: pending).
      frameRate: null,
      filePath: this.path.join(videoDir, mediaFile),
      thumbnailPath: thumbFile ? this.path.join(videoDir, thumbFile) : null,
      downloadDate: metaJson?.downloadDate ?? null,
      probeStatus: 'pending',
      viewCount: null,
      likeCount: null,
      dislikeCount: null,
      commentCount: null,
      category: null,
      tags: [],
      uploadDate: null,
      description: null,
      isShort: false,
      transcriptPath: null,
      transcriptText: null,
      detailFetchedAt: null,
      status: 'active',
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    }
    this.videoRepo.upsertWithPrevious(newVideo, previous)
    result.videosAdded++
  }

  /**
   * Find the final muxed media file and a thumbnail in a video dir.
   *
   * Match ONLY the final muxed file — `<videoId>.<media-ext>` exactly. yt-dlp's
   * HLS/DASH flows produce transient `<videoId>.fNNN.<ext>` intermediates before
   * the merge; a prefix match would catalogue one and then yt-dlp deletes it,
   * leaving a vanished path (the generic "can't play this codec" symptom). The
   * exact-match anchor excludes anything with a dot between id and extension
   * (and `.part`).
   */
  private resolveVideoFiles(
    videoDir: string,
    videoId: string
  ): { mediaFile: string | null; thumbFile: string | null } {
    const files = this.fs.listFiles(videoDir)
    const escapedVideoId = videoId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const FINAL_FILE_RE = new RegExp(
      `^${escapedVideoId}\\.(mp4|mkv|webm|m4a|mp3|mov|avi|flv|m4v|ts|opus|ogg|ogv|wmv|3gp|aac|wav)$`,
      'i'
    )
    return {
      mediaFile: files.find((f) => FINAL_FILE_RE.test(f)) ?? null,
      // `thumbnail.<ext>` (sideload convention) or any image that isn't yt-dlp's
      // `.info.json` sidecar (e.g. `<videoId>.jpg`).
      thumbFile:
        files.find((f) => /\.(jpg|jpeg|png|webp)$/i.test(f) && !f.includes('.info.')) ?? null
    }
  }

  /**
   * Recover an existing video that now lives under a DIFFERENT creator folder
   * on disk (e.g. the user moved its download dir across creators outside the
   * app). Re-derive creatorId/filePath/thumbnailPath from the current location
   * while PRESERVING all enriched metadata (tags, view counts, transcript,
   * probe status) — unlike upsertVideoFromDisk which rebuilds a fresh row. Only
   * re-points when the media file is actually present here. (F23)
   */
  private repointVideo(
    rootPath: string,
    creator: Creator,
    videoId: string,
    existing: Video,
    result: ReconcileResult
  ): void {
    const videoDir = this.path.join(rootPath, creator.folderName, 'downloads', videoId)
    const { mediaFile, thumbFile } = this.resolveVideoFiles(videoDir, videoId)
    if (!mediaFile) return // not actually here yet — leave for a later pass
    this.videoRepo.upsertWithPrevious(
      {
        ...existing,
        creatorId: creator.id,
        filePath: this.path.join(videoDir, mediaFile),
        thumbnailPath: thumbFile ? this.path.join(videoDir, thumbFile) : existing.thumbnailPath,
        status: 'active',
        deletedAt: null,
        updatedAt: new Date().toISOString()
      },
      existing
    )
    result.videosRecovered++
  }

  // ── Cut reconciliation ──

  private reconcileCuts(
    rootPath: string,
    creator: Creator,
    dbCuts: Cut[],
    result: ReconcileResult
  ): void {
    const cutsDir = this.path.join(rootPath, creator.folderName, 'cuts')
    const diskCutIds = new Set(this.fs.listDirectories(cutsDir))

    for (const cut of dbCuts) {
      if (cut.status === 'deleted') continue

      if (diskCutIds.has(cut.id)) {
        if (cut.status === 'missing') {
          this.cutRepo.updateStatus(cut.id, 'active', null)
          result.cutsRecovered++
        }
        diskCutIds.delete(cut.id)
      } else {
        if (cut.status !== 'missing') {
          this.cutRepo.updateStatus(cut.id, 'missing', null)
          result.cutsMarkedMissing++
        }
      }
    }

    for (const cutId of diskCutIds) {
      this.upsertCutFromDisk(rootPath, creator, cutId, null, result)
    }
  }

  private discoverCuts(rootPath: string, creator: Creator, result: ReconcileResult): void {
    const cutsDir = this.path.join(rootPath, creator.folderName, 'cuts')
    const cutIds = this.fs.listDirectories(cutsDir)

    for (const cutId of cutIds) {
      // Guard: only insert truly new entities — don't overwrite existing DB data
      const existing = this.cutRepo.findById(cutId)
      if (existing) {
        if (existing.status === 'missing') {
          this.cutRepo.updateStatus(cutId, 'active', null)
          result.cutsRecovered++
        }
        continue
      }
      this.upsertCutFromDisk(rootPath, creator, cutId, null, result)
    }
  }

  private upsertCutFromDisk(
    rootPath: string,
    creator: Creator,
    cutId: string,
    previous: Cut | null,
    result: ReconcileResult
  ): void {
    const cutDir = this.path.join(rootPath, creator.folderName, 'cuts', cutId)
    const cutData = this.fs.readJsonFile<CutDataJson>(this.path.join(cutDir, 'cut-data.json'))
    const files = this.fs.listFiles(cutDir)

    const mediaFile = files.find((f) => /\.(mp4|mkv|webm)$/i.test(f)) ?? null
    // No media file yet (mid-sideload-copy, or a folder with only cut-data.json).
    // Mirror upsertVideoFromDisk's guard: refuse to catalogue the cut DIRECTORY
    // as its filePath — ffprobe against a directory fails and pins
    // probeStatus='failed' forever, and no later pass re-points it. Leave it for
    // a reconcile pass once the rendered file lands. (F69)
    if (!mediaFile) return
    // Accept either the literal `thumbnail.<ext>` (manual sideload convention) or
    // any image alongside the media file as long as it isn't yt-dlp's `.info.json`
    // sidecar (e.g. `<videoId>.jpg` written by `--write-thumbnail --convert-thumbnails jpg`).
    const thumbFile =
      files.find((f) => /\.(jpg|jpeg|png|webp)$/i.test(f) && !f.includes('.info.')) ?? null

    const now = new Date().toISOString()
    // HP-9: parse the sidecar's editRecipe through the canonical schema so
    // a sideloaded folder produced by an older klip (or hand-edited) can
    // round-trip the recipe into the DB. Malformed payloads → null, never
    // throw, never persist garbage.
    const recipeParse = editRecipeSchema.safeParse(cutData?.editRecipe)
    const editRecipeJson = recipeParse.success ? JSON.stringify(recipeParse.data) : null

    const newCut: Cut = {
      id: cutId,
      creatorId: creator.id,
      videoId: null,
      title: cutData?.title ?? cutId,
      tags: cutData?.tags ?? [],
      startTimestamp: cutData?.startTimestamp ?? null,
      endTimestamp: cutData?.endTimestamp ?? null,
      duration: null,
      resolution: null,
      fileSize: null,
      filePath: this.path.join(cutDir, mediaFile),
      thumbnailPath: thumbFile ? this.path.join(cutDir, thumbFile) : null,
      probeStatus: 'pending',
      status: 'active',
      deletedAt: null,
      editRecipeJson,
      createdAt: now,
      updatedAt: now
    }
    this.cutRepo.upsertWithPrevious(newCut, previous)
    result.cutsAdded++
  }

  // ── Helpers ──

  private markChildrenMissing(videos: Video[], cuts: Cut[], result: ReconcileResult): void {
    for (const video of videos) {
      if (video.status === 'deleted' || video.status === 'missing') continue
      this.videoRepo.updateStatus(video.id, 'missing', null)
      result.videosMarkedMissing++
    }

    for (const cut of cuts) {
      if (cut.status === 'deleted' || cut.status === 'missing') continue
      this.cutRepo.updateStatus(cut.id, 'missing', null)
      result.cutsMarkedMissing++
    }
  }
}
