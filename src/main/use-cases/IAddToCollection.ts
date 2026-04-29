import type { AddToCollectionRequest, AddToCollectionResult } from '@shared/types'

/**
 * Append a video or cut to a collection. The new position is the next
 * integer above the current max across both join tables (the unified-
 * position invariant). Idempotent in the sense that re-adding an item
 * already in the collection returns its existing position without writing.
 */
export interface IAddToCollection {
  execute(request: AddToCollectionRequest): AddToCollectionResult
}
