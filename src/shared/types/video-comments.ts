/**
 * A single YouTube comment or reply, mapped from yt-dlp's `comments[]` array.
 *
 * yt-dlp's data is naturally 2 levels deep: top-level comments have
 * `parentId === null`; replies have `parentId === <top-level-id>`. YouTube
 * itself flattens "replies to replies" to the same level via @mentions.
 */
export interface VideoComment {
  id: string
  text: string
  author: string
  authorId: string | null
  likeCount: number
  isPinned: boolean
  parentId: string | null
  timestamp: number | null
}

/**
 * Result returned by `fetch-video-comments`. Comments are not persisted —
 * the renderer holds them in mutation state until navigation.
 */
export interface VideoCommentsResult {
  videoId: string
  comments: VideoComment[]
  totalFetched: number
  wasTruncated: boolean
}
