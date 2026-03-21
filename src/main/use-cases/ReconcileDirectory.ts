import type { ICreatorRepository, IVideoRepository, ICutRepository } from '@domain/repositories'
import type { IFileSystemReader, IPathResolver, ITransactionScope } from '@domain/ports'
import type { Creator, Video, Cut } from '@domain/entities'
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
}

/** Metadata shape expected inside `creator.json` */
interface CreatorJson {
  name?: string
  profileImagePath?: string
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

  // ── Internal (called inside transaction) ──

  private executeInternal(rootPath: string): ReconcileResult {
    const result = emptyResult()

    // ── 1. Snapshot ──
    const dbCreators = this.creatorRepo.findAll()
    const diskCreatorNames = new Set(this.fs.listDirectories(rootPath))

    const dbCreatorMap = new Map(dbCreators.map((c) => [c.id, c]))

    // ── 2. Reconcile existing DB creators against disk ──
    for (const creator of dbCreators) {
      if (creator.status === 'deleted') continue // respect user deletion

      if (diskCreatorNames.has(creator.folderName)) {
        // Creator folder exists
        if (creator.status === 'missing') {
          this.creatorRepo.updateStatus(creator.id, 'active', null)
          result.creatorsRecovered++
        }
        this.reconcileVideos(rootPath, creator, result)
        this.reconcileCuts(rootPath, creator, result)
      } else {
        // Creator folder missing from disk
        if (creator.status !== 'missing') {
          this.creatorRepo.updateStatus(creator.id, 'missing', null)
          result.creatorsMarkedMissing++
          this.markChildrenMissing(creator.id, result)
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
        status: 'active',
        deletedAt: null,
        createdAt: now,
        updatedAt: now
      }
      this.creatorRepo.upsert(newCreator)
      result.creatorsAdded++

      // Scan downloads + cuts for the new creator
      this.discoverVideos(rootPath, newCreator, result)
      this.discoverCuts(rootPath, newCreator, result)
    }

    return result
  }

  private executeForCreatorInternal(rootPath: string, creatorName: string): ReconcileResult {
    const result = emptyResult()

    const existing = this.creatorRepo.findById(creatorName)
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
        this.reconcileVideos(rootPath, existing, result)
        this.reconcileCuts(rootPath, existing, result)
      } else {
        // Creator folder gone
        if (existing.status !== 'missing') {
          this.creatorRepo.updateStatus(existing.id, 'missing', null)
          result.creatorsMarkedMissing++
          this.markChildrenMissing(existing.id, result)
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
        status: 'active',
        deletedAt: null,
        createdAt: now,
        updatedAt: now
      }
      this.creatorRepo.upsert(newCreator)
      result.creatorsAdded++

      this.discoverVideos(rootPath, newCreator, result)
      this.discoverCuts(rootPath, newCreator, result)
    }

    return result
  }

  // ── Video reconciliation ──

  private reconcileVideos(rootPath: string, creator: Creator, result: ReconcileResult): void {
    const downloadsDir = this.path.join(rootPath, creator.folderName, 'downloads')
    const diskVideoIds = new Set(this.fs.listDirectories(downloadsDir))

    // Use targeted query instead of findAll() + in-memory filter
    const dbVideos = this.videoRepo.findByCreatorId(creator.id)

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
      this.upsertVideoFromDisk(rootPath, creator, videoId, result)
    }
  }

  private discoverVideos(rootPath: string, creator: Creator, result: ReconcileResult): void {
    const downloadsDir = this.path.join(rootPath, creator.folderName, 'downloads')
    const videoIds = this.fs.listDirectories(downloadsDir)

    for (const videoId of videoIds) {
      // Guard: only insert truly new entities — don't overwrite existing DB data
      const existing = this.videoRepo.findById(videoId)
      if (existing) {
        if (existing.status === 'missing') {
          this.videoRepo.updateStatus(videoId, 'active', null)
          result.videosRecovered++
        }
        continue
      }
      this.upsertVideoFromDisk(rootPath, creator, videoId, result)
    }
  }

  private upsertVideoFromDisk(
    rootPath: string,
    creator: Creator,
    videoId: string,
    result: ReconcileResult
  ): void {
    const videoDir = this.path.join(rootPath, creator.folderName, 'downloads', videoId)
    const metaJson = this.fs.readJsonFile<MetaJson>(this.path.join(videoDir, 'meta.json'))
    const files = this.fs.listFiles(videoDir)

    const mediaFile = files.find((f) => /\.(mp4|mkv|webm)$/i.test(f)) ?? null
    const thumbFile = files.find((f) => /^thumbnail\.(jpg|jpeg|png|webp)$/i.test(f)) ?? null

    const now = new Date().toISOString()
    const newVideo: Video = {
      id: videoId,
      creatorId: creator.id,
      title: metaJson?.title ?? videoId,
      url: metaJson?.url ?? null,
      duration: metaJson?.duration ?? null,
      resolution: null,
      fileSize: null,
      filePath: mediaFile ? this.path.join(videoDir, mediaFile) : videoDir,
      thumbnailPath: thumbFile ? this.path.join(videoDir, thumbFile) : null,
      downloadDate: metaJson?.downloadDate ?? null,
      probeStatus: 'pending',
      status: 'active',
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    }
    this.videoRepo.upsert(newVideo)
    result.videosAdded++
  }

  // ── Cut reconciliation ──

  private reconcileCuts(rootPath: string, creator: Creator, result: ReconcileResult): void {
    const cutsDir = this.path.join(rootPath, creator.folderName, 'cuts')
    const diskCutIds = new Set(this.fs.listDirectories(cutsDir))

    // Use targeted query instead of findAll() + in-memory filter
    const dbCuts = this.cutRepo.findByCreatorId(creator.id)

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
      this.upsertCutFromDisk(rootPath, creator, cutId, result)
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
      this.upsertCutFromDisk(rootPath, creator, cutId, result)
    }
  }

  private upsertCutFromDisk(
    rootPath: string,
    creator: Creator,
    cutId: string,
    result: ReconcileResult
  ): void {
    const cutDir = this.path.join(rootPath, creator.folderName, 'cuts', cutId)
    const cutData = this.fs.readJsonFile<CutDataJson>(this.path.join(cutDir, 'cut-data.json'))
    const files = this.fs.listFiles(cutDir)

    const mediaFile = files.find((f) => /\.(mp4|mkv|webm)$/i.test(f)) ?? null
    const thumbFile = files.find((f) => /^thumbnail\.(jpg|jpeg|png|webp)$/i.test(f)) ?? null

    const now = new Date().toISOString()
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
      filePath: mediaFile ? this.path.join(cutDir, mediaFile) : cutDir,
      thumbnailPath: thumbFile ? this.path.join(cutDir, thumbFile) : null,
      probeStatus: 'pending',
      status: 'active',
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    }
    this.cutRepo.upsert(newCut)
    result.cutsAdded++
  }

  // ── Helpers ──

  private markChildrenMissing(creatorId: string, result: ReconcileResult): void {
    const videos = this.videoRepo.findByCreatorId(creatorId)
    for (const video of videos) {
      if (video.status === 'deleted' || video.status === 'missing') continue
      this.videoRepo.updateStatus(video.id, 'missing', null)
      result.videosMarkedMissing++
    }

    const cuts = this.cutRepo.findByCreatorId(creatorId)
    for (const cut of cuts) {
      if (cut.status === 'deleted' || cut.status === 'missing') continue
      this.cutRepo.updateStatus(cut.id, 'missing', null)
      result.cutsMarkedMissing++
    }
  }
}
