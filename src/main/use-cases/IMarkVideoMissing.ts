import type { YoutubeErrorKind } from '@domain/types/youtube-error'

/**
 * Marks a video as `'missing'` because YouTube returned a permanent error
 * (404 / 403 / private / removed). Records a `status_changed` audit entry
 * via the audited repository decorator and emits a `db-updated` push so
 * the renderer refreshes.
 *
 * Idempotent: if the video is already missing, this is a no-op.
 */
export interface IMarkVideoMissing {
  execute(videoId: string, reason: Extract<YoutubeErrorKind, 'unavailable' | 'unauthorized'>): void
}
