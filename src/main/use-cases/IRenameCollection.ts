import type { Collection } from '@domain/entities'
import type { RenameCollectionRequest } from '@shared/types'

/**
 * Rename / re-describe an existing collection. Throws if the id does not
 * resolve. Audited via the decorator; emits a `db-updated` push with
 * `scope: ['collections']`.
 */
export interface IRenameCollection {
  execute(request: RenameCollectionRequest): Collection
}
