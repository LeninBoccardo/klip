import type { IGetAllDistinctTags } from '@use-cases/IGetAllDistinctTags'
import type { IBulkUpdateTags } from '@use-cases/IBulkUpdateTags'
import type { IRenameTagGlobally } from '@use-cases/IRenameTagGlobally'
import type { IDeleteTagGlobally } from '@use-cases/IDeleteTagGlobally'
import { createTypedHandler } from './create-typed-handler'

/**
 * IPC controller for tag aggregation, bulk add/remove, global rename, and
 * global delete.
 *
 * Registers:
 *   - `get-all-distinct-tags` → distinct tags + per-table counts (videos vs cuts)
 *   - `bulk-update-tags`      → add/remove tags on a batch of entities (transactional)
 *   - `rename-tag-globally`   → rewrite a tag everywhere it appears (transactional)
 *   - `delete-tag-globally`   → remove a tag from every entity that carries it
 */
export function registerTagController(
  getAllDistinctTags: IGetAllDistinctTags,
  bulkUpdateTags: IBulkUpdateTags,
  renameTagGlobally: IRenameTagGlobally,
  deleteTagGlobally: IDeleteTagGlobally
): void {
  createTypedHandler('get-all-distinct-tags', async () => {
    return getAllDistinctTags.execute()
  })

  createTypedHandler('bulk-update-tags', async (_event, request) => {
    return bulkUpdateTags.execute(request)
  })

  createTypedHandler('rename-tag-globally', async (_event, oldTag, newTag) => {
    return renameTagGlobally.execute(oldTag, newTag)
  })

  createTypedHandler('delete-tag-globally', async (_event, tag) => {
    return deleteTagGlobally.execute(tag)
  })
}
