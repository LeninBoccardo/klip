import type { IVideoRepository, ICutRepository } from '@domain/repositories'
import type { ITransactionScope, INotifier } from '@domain/ports'
import type { RenameTagGloballyResult, DbUpdateScope } from '@shared/types'
import type { Video, Cut } from '@domain/entities'
import type { IRenameTagGlobally } from './IRenameTagGlobally'
import { EmptyOldTagError, EmptyNewTagError } from './errors/TagErrors'

export class RenameTagGlobally implements IRenameTagGlobally {
  constructor(
    private readonly videoRepo: IVideoRepository,
    private readonly cutRepo: ICutRepository,
    private readonly transaction: ITransactionScope,
    private readonly notifier: INotifier
  ) {}

  execute(oldTag: string, newTag: string): RenameTagGloballyResult {
    if (!oldTag) throw new EmptyOldTagError()
    if (!newTag) throw new EmptyNewTagError()
    if (oldTag === newTag) return { videosUpdated: 0, cutsUpdated: 0 }

    let videosUpdated = 0
    let cutsUpdated = 0

    this.transaction.run(() => {
      for (const video of this.videoRepo.findByTags([oldTag])) {
        const next = renameTag(video.tags, oldTag, newTag)
        if (next === null) continue
        const updated: Video = { ...video, tags: next, updatedAt: new Date().toISOString() }
        this.videoRepo.upsertWithPrevious(updated, video)
        videosUpdated++
      }

      for (const cut of this.cutRepo.findByTags([oldTag])) {
        const next = renameTag(cut.tags, oldTag, newTag)
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

/**
 * Returns a new tag list with `oldTag` replaced by `newTag` (deduplicated and
 * preserving insertion order), or `null` if the rewrite would be a no-op
 * (oldTag wasn't in the list, or both are present so the result equals the
 * existing dedupe of currentTags).
 */
function renameTag(current: string[], oldTag: string, newTag: string): string[] | null {
  if (!current.includes(oldTag)) return null

  const out: string[] = []
  const seen = new Set<string>()
  for (const t of current) {
    const replaced = t === oldTag ? newTag : t
    if (seen.has(replaced)) continue
    seen.add(replaced)
    out.push(replaced)
  }
  return out
}
