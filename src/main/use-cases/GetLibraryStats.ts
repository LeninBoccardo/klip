import type {
  ICreatorRepository,
  ICutRepository,
  IVideoRepository
} from '@domain/repositories'
import type { LibraryStats } from '@shared/types'
import type { IGetLibraryStats } from './IGetLibraryStats'
import type { IGetStorageStats } from './IGetStorageStats'

const TOP_CREATORS_LIMIT = 10
const DOWNLOAD_HISTORY_DAYS = 30

export class GetLibraryStats implements IGetLibraryStats {
  constructor(
    private creatorRepo: ICreatorRepository,
    private videoRepo: IVideoRepository,
    private cutRepo: ICutRepository,
    private getStorageStats: IGetStorageStats
  ) {}

  execute(): LibraryStats {
    const topCreatorRows = this.videoRepo.findTopCreators(TOP_CREATORS_LIMIT)
    const creatorIds = topCreatorRows.map((r) => r.creatorId)
    const namesById = this.creatorRepo.findNamesByIds(creatorIds)

    return {
      creators: {
        total: this.creatorRepo.count(),
        byStatus: this.creatorRepo.countByStatus()
      },
      videos: {
        total: this.videoRepo.count(),
        byStatus: this.videoRepo.countByStatus(),
        transcribed: this.videoRepo.countTranscribed(),
        totalDuration: this.videoRepo.sumDuration(),
        totalSize: this.videoRepo.sumFileSize()
      },
      cuts: {
        total: this.cutRepo.count(),
        totalDuration: this.cutRepo.sumDuration(),
        totalSize: this.cutRepo.sumFileSize()
      },
      downloadsByDay: this.videoRepo.findDownloadCountsByDay(DOWNLOAD_HISTORY_DAYS),
      topCreators: topCreatorRows.map((row) => ({
        creatorId: row.creatorId,
        // Fall back to the id when the creator's name has been deleted but
        // FK CASCADE hasn't fired yet (e.g. status='missing'); ensures the
        // dashboard still shows something meaningful.
        name: namesById.get(row.creatorId) ?? row.creatorId,
        videoCount: row.videoCount
      })),
      storage: this.getStorageStats.execute()
    }
  }
}
