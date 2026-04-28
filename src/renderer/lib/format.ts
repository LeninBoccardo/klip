/**
 * Format seconds into mm:ss or hh:mm:ss
 */
export function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number): string => n.toString().padStart(2, '0')
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

/** Entity kinds that can serve a media asset over `klip-media://`. */
export type MediaKind = 'video' | 'cut' | 'creator'

/** Asset slots a `MediaKind` can serve. Not every (kind, asset) is valid. */
export type MediaAsset = 'file' | 'thumbnail' | 'avatar'

/**
 * Build a `klip-media://<kind>/<id>/<asset>` URL for the entity-keyed protocol.
 *
 * The renderer never constructs raw filesystem paths — it references media by
 * entity id, and the main-process protocol handler resolves the reference via
 * the index, then realpath/prefix-bounds the result against the active root
 * path before serving the file.
 */
export function mediaUrl(kind: MediaKind, id: string, asset: MediaAsset): string {
  return `klip-media://${kind}/${encodeURIComponent(id)}/${asset}`
}

/**
 * Format a number into a compact human-readable count (e.g. 1.2K, 3.4M).
 */
export function formatCount(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1000) return n.toString()
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  return `${(n / 1_000_000_000).toFixed(1)}B`
}
