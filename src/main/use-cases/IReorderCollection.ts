import type { ReorderCollectionRequest } from '@shared/types'

/**
 * Renumber every item in the collection to match the supplied order.
 *
 * The caller passes the *complete* desired ordering — every item currently
 * in the collection must appear exactly once. The use case rejects partial
 * reorders so a buggy caller can't silently drop entries. Final positions
 * are dense (0..n-1) regardless of any prior sparseness from removals.
 */
export interface IReorderCollection {
  execute(request: ReorderCollectionRequest): { reordered: number }
}
