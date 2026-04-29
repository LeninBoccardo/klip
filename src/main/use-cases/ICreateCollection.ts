import type { Collection } from '@domain/entities'
import type { CreateCollectionRequest } from '@shared/types'

/**
 * Creates a new manual collection with a fresh id (`IIdGenerator`). Audited
 * via the decorator; emits a `db-updated` push with `scope: ['collections']`.
 */
export interface ICreateCollection {
  execute(request: CreateCollectionRequest): Collection
}
