import type { IGetAllDistinctTags } from '@use-cases/IGetAllDistinctTags'
import type { IBulkUpdateTags } from '@use-cases/IBulkUpdateTags'
import type { IRenameTagGlobally } from '@use-cases/IRenameTagGlobally'
import { createTypedHandler } from './create-typed-handler'

/**
 * IPC controller for tag aggregation, bulk add/remove, and global rename.
 *
 * Registers:
 *   - `get-all-distinct-tags` → distinct tags + per-table counts (videos vs cuts)
 *   - `bulk-update-tags`      → add/remove tags on a batch of entities (transactional)
 *   - `rename-tag-globally`   → rewrite a tag everywhere it appears (transactional)
 */
export function registerTagController(
  getAllDistinctTags: IGetAllDistinctTags,
  bulkUpdateTags: IBulkUpdateTags,
  renameTagGlobally: IRenameTagGlobally
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
}
