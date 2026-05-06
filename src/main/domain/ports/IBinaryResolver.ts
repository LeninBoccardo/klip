/**
 * Resolves the absolute file path to a bundled external binary.
 * Handles the dev vs packaged (asar) path difference.
 */
export type ExternalBinary = 'yt-dlp' | 'ffprobe' | 'ffmpeg'

export interface IBinaryResolver {
  /** Returns the absolute path to the named binary */
  resolve(name: ExternalBinary): string
}
