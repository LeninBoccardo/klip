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
 * Result returned by `fetch-video-comments` / `get-cached-video-comments`.
 *
 * Comments are cached to the OS temp directory after a fresh fetch (see
 * `CommentsCache` in main) with a 7-day TTL, so re-opening the Comments
 * tab on the same video surfaces them instantly without another yt-dlp
 * round-trip.
 *
 *  - `fetchedAt`  : ISO timestamp when these comments were originally
 *                   pulled from YouTube. Lets the UI label cached data
 *                   ("loaded from cache · 2h ago") and lets us decide
 *                   when to expire.
 *  - `fromCache`  : true when this payload was returned from disk
 *                   without a network round-trip. Renderer can use this
 *                   to offer a "Refresh" affordance.
 */
export interface VideoCommentsResult {
  videoId: string
  comments: VideoComment[]
  totalFetched: number
  wasTruncated: boolean
  fetchedAt: string
  fromCache: boolean
}
