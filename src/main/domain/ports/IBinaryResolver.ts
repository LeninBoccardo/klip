/**
 * Resolves the absolute file path to a bundled external binary.
 * Handles the dev vs packaged (asar) path difference.
 */
export interface IBinaryResolver {
  /** Returns the absolute path to the named binary */
  resolve(name: 'yt-dlp' | 'ffprobe'): string
}
