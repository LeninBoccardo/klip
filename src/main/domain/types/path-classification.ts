/**
 * Classifies a file-system path relative to the klip root directory
 * into the entity type and identifiers it belongs to.
 *
 * Folder structure:
 *   [root]/{creator}/creator.json
 *   [root]/{creator}/downloads/{videoId}/{file}
 *   [root]/{creator}/cuts/{cutId}/{file}
 */

/** Discriminated union for classified file paths */
export type PathClassification =
  | { kind: 'creator'; creatorName: string }
  | { kind: 'video'; creatorName: string; videoId: string }
  | { kind: 'cut'; creatorName: string; cutId: string }
  | { kind: 'unknown' }

/**
 * Classify a file path relative to the klip root directory.
 *
 * @param rootPath  Absolute path to the klip root directory
 * @param filePath  Absolute path to the changed file/directory
 * @returns Classification with extracted identifiers
 */
export function classifyPath(rootPath: string, filePath: string): PathClassification {
  // Normalise separators to forward slash for consistent matching
  const normRoot = rootPath.replace(/\\/g, '/')
  const normFile = filePath.replace(/\\/g, '/')

  // Get relative path, stripping leading slash
  const relative = normFile.slice(normRoot.length).replace(/^\/+/, '')

  if (relative.length === 0) return { kind: 'unknown' }

  const segments = relative.split('/').filter((s) => s.length > 0)

  if (segments.length === 0) return { kind: 'unknown' }

  const creatorName = segments[0]

  // 1 segment: creator directory itself
  if (segments.length === 1) {
    return { kind: 'creator', creatorName }
  }

  // 2 segments: creator.json or downloads/cuts directory (creator-level)
  if (segments.length === 2) {
    if (segments[1] === 'creator.json') {
      return { kind: 'creator', creatorName }
    }
    // "downloads" or "cuts" directory itself → creator-level change
    if (segments[1] === 'downloads' || segments[1] === 'cuts') {
      return { kind: 'creator', creatorName }
    }
    return { kind: 'unknown' }
  }

  // 3+ segments: entity-level
  const category = segments[1] // 'downloads' or 'cuts'
  const entityId = segments[2]

  if (category === 'downloads') {
    return { kind: 'video', creatorName, videoId: entityId }
  }

  if (category === 'cuts') {
    return { kind: 'cut', creatorName, cutId: entityId }
  }

  return { kind: 'unknown' }
}
