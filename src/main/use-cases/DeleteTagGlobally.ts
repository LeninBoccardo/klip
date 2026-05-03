import type { IVideoRepository, ICutRepository } from '@domain/repositories'
import type { ITransactionScope, INotifier } from '@domain/ports'
import type { DeleteTagGloballyResult, DbUpdateScope } from '@shared/types'
import type { Video, Cut } from '@domain/entities'
import type { IDeleteTagGlobally } from './IDeleteTagGlobally'
import { EmptyOldTagError } from './errors/TagErrors'

export class DeleteTagGlobally implements IDeleteTagGlobally {
  constructor(
    private readonly videoRepo: IVideoRepository,
    private readonly cutRepo: ICutRepository,
    private readonly transaction: ITransactionScope,
    private readonly notifier: INotifier
  ) {}

  execute(tag: string): DeleteTagGloballyResult {
    if (!tag) throw new EmptyOldTagError()

    let videosUpdated = 0
    let cutsUpdated = 0

    this.transaction.run(() => {
      for (const video of this.videoRepo.findByTags([tag])) {
        const next = removeTag(video.tags, tag)
        if (next === null) continue
        const updated: Video = { ...video, tags: next, updatedAt: new Date().toISOString() }
        this.videoRepo.upsertWithPrevious(updated, video)
        videosUpdated++
      }

      for (const cut of this.cutRepo.findByTags([tag])) {
        const next = removeTag(cut.tags, tag)
        if (next === null) continue
        const updated: Cut = { ...cut, tags: next, updatedAt: new Date().toISOString() }
        this.cutRepo.upsertWithPrevious(updated, cut)
        cutsUpdated++
      }
    })

    if (videosUpdated > 0 || cutsUpdated > 0) {
      const scope: DbUpdateScope[] = []
      if (videosUpdated > 0) scope.push('videos')
      if (cutsUpdated > 0) scope.push('cuts')
      this.notifier.notify('db-updated', { scope })
    }

    return { videosUpdated, cutsUpdated }
  }
}

/** Returns a new tag list with `tag` removed, or `null` if it wasn't present. */
function removeTag(current: string[], tag: string): string[] | null {
  if (!current.includes(tag)) return null
  return current.filter((t) => t !== tag)
}
