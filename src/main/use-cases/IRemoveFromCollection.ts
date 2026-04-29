import type { RemoveFromCollectionRequest } from '@shared/types'

/**
 * Remove an item from a collection. Idempotent: removing an item that
 * isn't there is a no-op without an audit entry.
 */
export interface IRemoveFromCollection {
  execute(request: RemoveFromCollectionRequest): { removed: boolean }
}
