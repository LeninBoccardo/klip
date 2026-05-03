import type { FileEventType } from '@domain/types'

/**
 * Pure path-relevance filter for ChokidarWatcher. Extracted so the regex
 * rules can be unit-tested without spinning up chokidar (which is timing-
 * sensitive and OS-dependent).
 *
 * Accepted path shapes (relative to root):
 *   {creator}/creator.json
 *   {creator}/downloads/{videoId}/{file}
 *   {creator}/cuts/{cutId}/{file}
 *   {creator}/                          (dir events)
 *   {creator}/downloads/{videoId}/      (dir events)
 *   {creator}/cuts/{cutId}/             (dir events)
 *
 * Anything outside this structure (e.g. random `.txt` in root) is rejected.
 */
export const RELEVANT_PATH_RE = /[\\/][^\\/]+[\\/](?:creator\.json$|(?:downloads|cuts)[\\/])/i

/**
 * Combined regex: path must be inside the folder structure AND have a
 * relevant extension. Used for file events only.
 */
export const RELEVANT_FILE_COMBINED_RE =
  /[\\/][^\\/]+[\\/](?:downloads|cuts)[\\/].*(?:\.(?:mp4|mkv|webm|jpg|jpeg|png|webp)|(?:meta|cut-data|creator)\.json)$/i

/**
 * Decide whether a chokidar event should be forwarded to the use case. The
 * caller passes the absolute `filePath`, the watcher root, and the event
 * type; we strip the root prefix and apply the rules above.
 */
export function isRelevantPath(
  filePath: string,
  rootPath: string,
  eventType: FileEventType
): boolean {
  const relative = filePath.slice(rootPath.length)

  if (eventType === 'addDir' || eventType === 'unlinkDir') {
    return RELEVANT_PATH_RE.test(relative + '/') || isCreatorDir(relative)
  }

  return RELEVANT_FILE_COMBINED_RE.test(relative) || RELEVANT_PATH_RE.test(relative)
}

/** True iff the relative path looks like a top-level creator directory (one segment). */
export function isCreatorDir(relative: string): boolean {
  const trimmed = relative.replace(/^[/\\]+/, '').replace(/[/\\]+$/, '')
  return trimmed.length > 0 && !trimmed.includes('/') && !trimmed.includes('\\')
}
