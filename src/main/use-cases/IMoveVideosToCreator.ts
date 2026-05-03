import type { MoveVideosToCreatorRequest, MoveVideosToCreatorResult } from '@shared/types'

/**
 * Reassigns one or more videos to a different creator.
 *
 * For each video this:
 *   1. Moves its on-disk directory from `<root>/<oldCreator>/downloads/<videoId>`
 *      to `<root>/<targetCreator>/downloads/<videoId>` (cross-drive safe).
 *   2. Rewrites `creator_id`, `filePath`, `thumbnailPath`, and `transcriptPath`
 *      on the Video row, audited as a regular update by the audited
 *      repository decorator.
 *
 * Per-video failures are isolated — a missing source directory or a
 * permission error on one video does not roll back others. Emits a single
 * `db-updated` push at the end if any videos were actually moved.
 */
export interface IMoveVideosToCreator {
  execute(request: MoveVideosToCreatorRequest): Promise<MoveVideosToCreatorResult>
}
