import type { IVideoRepository, ICutRepository } from '@domain/repositories'
import type { ITransactionScope, INotifier } from '@domain/ports'
import type { BulkUpdateTagsRequest, BulkUpdateTagsResult, TagEntityKind } from '@shared/types'
import type { Video, Cut } from '@domain/entities'
import type { IBulkUpdateTags } from './IBulkUpdateTags'
import { EmptyTagOperationsError } from './errors/TagErrors'

export class BulkUpdateTags implements IBulkUpdateTags {
  constructor(
    private readonly videoRepo: IVideoRepository,
    private readonly cutRepo: ICutRepository,
    private readonly transaction: ITransactionScope,
    private readonly notifier: INotifier
  ) {}

  execute(request: BulkUpdateTagsRequest): BulkUpdateTagsResult {
    const { entityKind, ids, addTags = [], removeTags = [] } = request

    if (ids.length === 0) return { updated: 0, skipped: 0 }
    if (addTags.length === 0 && removeTags.length === 0) {
      throw new EmptyTagOperationsError()
    }

    const removeSet = new Set(removeTags)
    let updated = 0
    let skipped = 0

    this.transaction.run(() => {
      for (const id of ids) {
        const next =
          entityKind === 'video'
            ? this.applyToVideo(id, addTags, removeSet)
            : this.applyToCut(id, addTags, removeSet)
        if (next === 'updated') updated++
        else skipped++
      }
    })

    if (updated > 0) {
      this.notifier.notify('db-updated', { scope: [scopeFor(entityKind)] })
    }

    return { updated, skipped }
  }

  private applyToVideo(
    id: string,
    addTags: string[],
    removeSet: Set<string>
  ): 'updated' | 'skipped' {
    const video = this.videoRepo.findById(id)
    if (!video) return 'skipped'

    const nextTags = mergeTags(video.tags, addTags, removeSet)
    if (sameTagSet(video.tags, nextTags)) return 'skipped'

    const updated: Video = { ...video, tags: nextTags, updatedAt: new Date().toISOString() }
    this.videoRepo.upsertWithPrevious(updated, video)
    return 'updated'
  }

  private applyToCut(id: string, addTags: string[], removeSet: Set<string>): 'updated' | 'skipped' {
    const cut = this.cutRepo.findById(id)
    if (!cut) return 'skipped'

    const nextTags = mergeTags(cut.tags, addTags, removeSet)
    if (sameTagSet(cut.tags, nextTags)) return 'skipped'

    const updated: Cut = { ...cut, tags: nextTags, updatedAt: new Date().toISOString() }
    this.cutRepo.upsertWithPrevious(updated, cut)
    return 'updated'
  }
}

/** Compute (current ∪ addTags) \ removeTags, deduplicated, preserving insertion order. */
function mergeTags(current: string[], addTags: string[], removeSet: Set<string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of current) {
    if (removeSet.has(t) || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  for (const t of addTags) {
    if (removeSet.has(t) || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

function sameTagSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function scopeFor(kind: TagEntityKind): 'videos' | 'cuts' {
  return kind === 'video' ? 'videos' : 'cuts'
}
