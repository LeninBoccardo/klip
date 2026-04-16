/**
 * Format seconds into mm:ss or hh:mm:ss
 */
export function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/**
 * Format bytes into human-readable size
 */
export function formatFileSize(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/**
 * Convert an absolute file path to a klip-media:// protocol URL for rendering thumbnails.
 * Returns undefined if the path is null.
 */
export function toMediaSrc(filePath: string | null): string | undefined {
  if (!filePath) return undefined
  // Encode the path for URL safety; the custom protocol handler decodes it
  return `klip-media://${encodeURIComponent(filePath)}`
}
