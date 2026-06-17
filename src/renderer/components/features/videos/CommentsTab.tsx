import { useCallback, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from 'react-i18next'
import { useCachedVideoComments, useFetchVideoComments } from '@/hooks/use-videos'
import { Button } from '@ui/button'
import { Badge } from '@ui/badge'
import { Input } from '@ui/input'
import { Checkbox } from '@ui/checkbox'
import { Avatar, AvatarFallback } from '@ui/avatar'
import { Item, ItemMedia, ItemContent } from '@ui/item'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@ui/empty'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@ui/collapsible'
import {
  ChevronRight,
  Copy,
  Loader2,
  MessageSquare,
  Pin,
  Plus,
  RefreshCw,
  ThumbsUp,
  Zap
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import type { Locale } from 'date-fns/locale'
import { useDateLocale } from '@renderer/i18n/date-locale'
import { formatCount } from '@/lib/format'
import type { VideoComment, VideoCommentsResult } from '@shared/types'

interface CommentsTabProps {
  videoId: string
  /** Comment-count surfaced from `--dump-json` enrichment, shown in idle state. */
  knownCount: number | null
}

interface ThreadGroup {
  top: VideoComment
  replies: VideoComment[]
}

function groupThreads(comments: VideoComment[]): ThreadGroup[] {
  const repliesByParent = new Map<string, VideoComment[]>()
  const topLevel: VideoComment[] = []

  for (const c of comments) {
    if (c.parentId === null) {
      topLevel.push(c)
    } else {
      const list = repliesByParent.get(c.parentId)
      if (list) list.push(c)
      else repliesByParent.set(c.parentId, [c])
    }
  }

  // yt-dlp returns pinned comments first when comment_sort=top; preserve order.
  return topLevel.map((top) => ({ top, replies: repliesByParent.get(top.id) ?? [] }))
}

function buildClipboardText(threads: ThreadGroup[]): string {
  const lines: string[] = []
  for (const { top, replies } of threads) {
    lines.push(`[${top.author}]: ${top.text}`)
    for (const r of replies) {
      lines.push(`  ↳ [${r.author}]: ${r.text}`)
    }
  }
  return lines.join('\n')
}

function authorInitials(author: string): string {
  const cleaned = author.replace(/^@/, '').trim()
  if (!cleaned) return '?'
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return cleaned.slice(0, 2).toUpperCase()
}

function formatRelative(timestamp: number | null, locale: Locale): string {
  if (!timestamp) return ''
  try {
    return formatDistanceToNow(new Date(timestamp * 1000), { addSuffix: true, locale })
  } catch {
    return ''
  }
}

/** Default number of comments yt-dlp is asked to scrape on first load. */
const INITIAL_MAX = 500
/** Step size for "Load more": each click bumps the cap by this many. */
const LOAD_MORE_STEP = 500
/**
 * Hard cap for "Fetch all". Matches the IPC schema's upper bound. yt-dlp's
 * own scraping pace (paired with the dynamic timeout in
 * YtDlpDownloader.fetchComments) keeps individual runs bounded.
 */
const FETCH_ALL_MAX = 50_000

export function CommentsTab({ videoId, knownCount }: CommentsTabProps): React.ReactElement | null {
  const { t } = useTranslation('videos')
  const { t: tc } = useTranslation('common')
  const dateLocale = useDateLocale()
  // Cache query auto-fires on mount. A hit pops cached comments in
  // instantly; useFetchVideoComments is reserved for the user's explicit
  // Load / Reload — and seeds this query on success.
  const cachedComments = useCachedVideoComments(videoId)
  const fetchComments = useFetchVideoComments()
  // Prefer fresh mutation data when present (just-fetched results take
  // precedence over the cache snapshot), otherwise the disk-cached payload.
  const data: VideoCommentsResult | null | undefined = fetchComments.data ?? cachedComments.data

  const threads = useMemo(() => (data ? groupThreads(data.comments) : []), [data])
  const replyCount = useMemo(() => threads.reduce((sum, t) => sum + t.replies.length, 0), [threads])

  // Track the cap that produced the currently-shown payload, so "Load more"
  // can ask for the *next* batch instead of repeatedly re-requesting the
  // same first 500. Falls back to the initial constant for cache hits where
  // we don't know the original request size.
  const [requestedMax, setRequestedMax] = useState<number>(INITIAL_MAX)

  const [usernameFilter, setUsernameFilter] = useState('')
  const [textFilter, setTextFilter] = useState('')
  const [pinnedOnly, setPinnedOnly] = useState(false)

  // Reply-expand state is lifted out of CommentRow into a Set keyed by the
  // top-level comment id. CommentRow is rendered by a virtualizer that recycles
  // DOM nodes as you scroll, so per-row useState would lose its open/closed
  // state on recycle. The Set survives recycling and re-mounts.
  const [openThreads, setOpenThreads] = useState<Set<string>>(() => new Set())
  const setThreadOpen = useCallback((id: string, open: boolean): void => {
    setOpenThreads((prev) => {
      const next = new Set(prev)
      if (open) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const anyFilterActive = usernameFilter !== '' || textFilter !== '' || pinnedOnly

  const filteredThreads = useMemo(() => {
    if (!anyFilterActive) return threads
    const u = usernameFilter.toLowerCase()
    const tx = textFilter.toLowerCase()
    return threads.filter((thread) => {
      if (pinnedOnly && !thread.top.isPinned) return false
      if (u !== '') {
        const inTop = thread.top.author.toLowerCase().includes(u)
        const inReply = thread.replies.some((r) => r.author.toLowerCase().includes(u))
        if (!inTop && !inReply) return false
      }
      if (tx !== '') {
        const inTop = thread.top.text.toLowerCase().includes(tx)
        const inReply = thread.replies.some((r) => r.text.toLowerCase().includes(tx))
        if (!inTop && !inReply) return false
      }
      return true
    })
  }, [threads, anyFilterActive, usernameFilter, textFilter, pinnedOnly])

  const clearFilters = (): void => {
    setUsernameFilter('')
    setTextFilter('')
    setPinnedOnly(false)
  }

  const handleLoad = (): void => {
    setRequestedMax(INITIAL_MAX)
    fetchComments.mutate({ videoId, maxComments: INITIAL_MAX })
  }

  const handleLoadMore = (): void => {
    const next = Math.min(FETCH_ALL_MAX, requestedMax + LOAD_MORE_STEP)
    setRequestedMax(next)
    fetchComments.mutate({ videoId, maxComments: next })
  }

  const handleFetchAll = (): void => {
    setRequestedMax(FETCH_ALL_MAX)
    fetchComments.mutate({ videoId, maxComments: FETCH_ALL_MAX })
  }

  const handleCopyAll = async (): Promise<void> => {
    if (!data) return
    try {
      await navigator.clipboard.writeText(buildClipboardText(threads))
      toast.success(t('comments.copySuccess'))
    } catch {
      toast.error(t('comments.copyError'))
    }
  }

  // ── Cache lookup in progress ──
  // Hide the idle CTA until we know whether there's a cached payload —
  // otherwise the user briefly sees "Load comments" before the cache
  // hit pops in, which feels like the cache didn't work.
  if (cachedComments.isLoading) {
    return (
      <Empty className="min-h-75">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Loader2 className="size-6 animate-spin" />
          </EmptyMedia>
        </EmptyHeader>
      </Empty>
    )
  }

  // ── Idle ──
  if (!fetchComments.isPending && !data && !fetchComments.isError) {
    return (
      <Empty className="min-h-75">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageSquare className="size-6" />
          </EmptyMedia>
          <EmptyTitle>{t('comments.noneLoaded')}</EmptyTitle>
          <EmptyDescription>
            {knownCount != null
              ? t('comments.ctaWithCount', { count: formatCount(knownCount) })
              : t('comments.ctaWithoutCount')}
          </EmptyDescription>
        </EmptyHeader>
        <Button onClick={handleLoad} className="mt-4">
          <MessageSquare className="mr-2 size-4" />
          {t('comments.loadButton')}
        </Button>
      </Empty>
    )
  }

  // ── Loading (no existing data) ──
  // Only swap the whole panel to the loader when there's nothing to show
  // yet. When the user has clicked Load more / Fetch all / Reload, we keep
  // the existing comments visible and surface a small inline indicator
  // further down so they don't lose their scroll position.
  if (fetchComments.isPending && !data) {
    return (
      <Empty className="min-h-75">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Loader2 className="size-6 animate-spin" />
          </EmptyMedia>
          <EmptyTitle>{t('comments.loadingTitle')}</EmptyTitle>
          <EmptyDescription>{t('comments.loadingHint')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  // ── Error ──
  if (fetchComments.isError) {
    return (
      <Empty className="min-h-75">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageSquare className="size-6 text-destructive" />
          </EmptyMedia>
          <EmptyTitle>{t('comments.errorTitle')}</EmptyTitle>
          <EmptyDescription>{fetchComments.error.message}</EmptyDescription>
        </EmptyHeader>
        <Button onClick={handleLoad} variant="outline" className="mt-4">
          <RefreshCw className="mr-2 size-4" />
          {tc('actions.retry')}
        </Button>
      </Empty>
    )
  }

  // ── Loaded ──
  if (!data) return null

  // `wasTruncated` is yt-dlp's heuristic: comments.length >= maxComments.
  // It's an upper-bound signal — "there might be more" — not a guarantee
  // that more exist on YouTube. The user can keep clicking Load more until
  // a non-truncated batch returns or the FETCH_ALL_MAX cap is reached.
  const canLoadMore = data.wasTruncated && requestedMax < FETCH_ALL_MAX && !fetchComments.isPending
  const canFetchAll = data.wasTruncated && requestedMax < FETCH_ALL_MAX && !fetchComments.isPending
  const loadingMore = fetchComments.isPending

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <MessageSquare className="size-4" />
          <span>
            <span className="text-foreground font-medium">{formatCount(data.totalFetched)}</span>{' '}
            {t('comments.summaryComments')}
            {replyCount > 0 && (
              <>
                {' · '}
                <span className="text-foreground font-medium">{formatCount(replyCount)}</span>{' '}
                {t('comments.summaryReplies')}
              </>
            )}
          </span>
          {data.wasTruncated && (
            <Badge variant="secondary" className="ml-1">
              {t('comments.truncatedBadge', { count: data.totalFetched })}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyAll} disabled={loadingMore}>
            <Copy className="mr-2 size-4" />
            {tc('actions.copyAll')}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLoad} disabled={loadingMore}>
            <RefreshCw className="mr-2 size-4" />
            {tc('actions.reload')}
          </Button>
        </div>
      </div>

      {threads.length === 0 ? (
        <Empty className="min-h-50">
          <EmptyHeader>
            <EmptyTitle>{t('comments.noneOnVideo')}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="search"
              value={usernameFilter}
              onChange={(e) => setUsernameFilter(e.target.value)}
              placeholder={t('comments.filterUsernamePlaceholder')}
              aria-label={t('comments.filterUsernamePlaceholder')}
              className="w-44"
            />
            <Input
              type="search"
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              placeholder={t('comments.filterTextPlaceholder')}
              aria-label={t('comments.filterTextPlaceholder')}
              className="w-52"
            />
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
              <Checkbox checked={pinnedOnly} onCheckedChange={(v) => setPinnedOnly(v === true)} />
              <span>{t('comments.filterPinnedOnly')}</span>
            </label>
            {anyFilterActive && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                {t('comments.filterClear')}
              </Button>
            )}
            {anyFilterActive && (
              <span className="text-muted-foreground ml-auto text-xs">
                {t('comments.filterMatchCount', {
                  shown: filteredThreads.length,
                  total: threads.length
                })}
              </span>
            )}
          </div>
          {filteredThreads.length === 0 ? (
            <Empty className="min-h-50">
              <EmptyHeader>
                <EmptyTitle>{t('comments.filterNoMatches')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <VirtualCommentList
              threads={filteredThreads}
              dateLocale={dateLocale}
              openThreads={openThreads}
              onOpenChange={setThreadOpen}
            />
          )}
        </>
      )}

      {(canLoadMore || canFetchAll || loadingMore) && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {loadingMore ? (
            <div className="text-muted-foreground inline-flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              <span>{t('comments.loadingMoreTitle')}</span>
            </div>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                title={t('comments.loadMoreHint')}
              >
                <Plus className="mr-2 size-4" />
                {t('comments.loadMore')}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleFetchAll}
                title={t('comments.fetchAllHint')}
              >
                <Zap className="mr-2 size-4" />
                {t('comments.fetchAll')}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Virtualized thread list ──

/**
 * Windows the comment threads with @tanstack/react-virtual (same pattern as
 * VirtualAuditList). "Fetch all" can pull up to 50,000 comments; rendering them
 * all unwindowed froze the renderer for seconds and re-rendered every survivor
 * on each filter keystroke. Only the visible rows mount here.
 *
 * Rows are NOT uniform height (long text, expandable replies), so estimateSize
 * is a single-line baseline and `measureElement` re-measures actual heights —
 * including when a thread's replies expand (its ResizeObserver fires).
 */
function VirtualCommentList({
  threads,
  dateLocale,
  openThreads,
  onOpenChange
}: {
  threads: ThreadGroup[]
  dateLocale: Locale
  openThreads: Set<string>
  onOpenChange: (id: string, open: boolean) => void
}): React.ReactElement {
  const scrollParentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => scrollParentRef.current,
    // Measured baseline for a single-line top-level comment; taller rows
    // (wrapped text, expanded replies) are corrected via measureElement.
    estimateSize: () => 96,
    overscan: 6
  })

  const items = virtualizer.getVirtualItems()

  return (
    <div ref={scrollParentRef} className="h-150 overflow-y-auto rounded border">
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {items.map((virtualRow) => {
          const thread = threads[virtualRow.index]
          return (
            <div
              key={thread.top.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="border-border/60 absolute left-0 top-0 w-full border-b"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <CommentRow
                thread={thread}
                dateLocale={dateLocale}
                open={openThreads.has(thread.top.id)}
                onOpenChange={(v) => onOpenChange(thread.top.id, v)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Comment row ──

function CommentRow({
  thread,
  dateLocale,
  open,
  onOpenChange
}: {
  thread: ThreadGroup
  dateLocale: Locale
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.ReactElement {
  const { t } = useTranslation('videos')
  const { top, replies } = thread

  return (
    <div className="px-3 py-3">
      <Item variant="default" className="border-transparent p-0 items-start gap-3">
        <ItemMedia variant="image" className="size-9 rounded-full">
          <Avatar>
            <AvatarFallback>{authorInitials(top.author)}</AvatarFallback>
          </Avatar>
        </ItemMedia>
        {/* min-w-0: required for flex-1 children. Without it, the default
            `min-width: auto` keeps the column at its intrinsic min-content
            width, which is set by the LONGEST content inside — including
            replies. A reply card or single unbreakable token then pushes
            ItemContent wider than its flex allotment and the whole row
            overflows past the parent. */}
        <ItemContent className="min-w-0">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="font-medium">{top.author}</span>
            {top.isPinned && (
              <Badge variant="secondary" className="gap-1">
                <Pin className="size-3" />
                {t('comments.pinnedBadge')}
              </Badge>
            )}
            {top.timestamp && (
              <span className="text-xs text-muted-foreground">
                · {formatRelative(top.timestamp, dateLocale)}
              </span>
            )}
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
              <ThumbsUp className="size-3" />
              {formatCount(top.likeCount)}
            </span>
          </div>
          <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">
            {top.text}
          </p>

          {replies.length > 0 && (
            <Collapsible open={open} onOpenChange={onOpenChange} className="mt-2">
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 gap-1 text-primary hover:text-primary"
                >
                  <ChevronRight
                    className="size-4 transition-transform data-[state=open]:rotate-90"
                    data-state={open ? 'open' : 'closed'}
                  />
                  {open
                    ? t('comments.hideReplies', { count: replies.length })
                    : t('comments.viewReplies', { count: replies.length })}
                </Button>
              </CollapsibleTrigger>
              {/*
                Replies live inside a distinctly-styled rail:
                  - `border-l-2 border-muted-foreground/30` — visibly
                    thicker tree-branch indicator (the 1px `border-border`
                    used here previously was nearly invisible in dark
                    mode, so users couldn't tell a reply from a top-level
                    comment).
                  - `bg-muted/30 rounded-md py-2 pr-2` — subtle background
                    + corner rounding so the reply group reads as a
                    grouped affordance rather than an undifferentiated
                    inline continuation of the parent.
              */}
              <CollapsibleContent className="mt-2 ml-2 space-y-2 rounded-md border-l-2 border-muted-foreground/30 bg-muted/30 py-2 pl-4 pr-2">
                {replies.map((reply) => (
                  <ReplyRow key={reply.id} comment={reply} dateLocale={dateLocale} />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </ItemContent>
      </Item>
    </div>
  )
}

// ── Reply row ──

function ReplyRow({
  comment,
  dateLocale
}: {
  comment: VideoComment
  dateLocale: Locale
}): React.ReactElement {
  return (
    <Item variant="default" className="border-transparent p-0 items-start gap-2">
      <ItemMedia variant="image" className="size-7 rounded-full">
        <Avatar size="sm">
          <AvatarFallback>{authorInitials(comment.author)}</AvatarFallback>
        </Avatar>
      </ItemMedia>
      {/* See CommentRow's ItemContent for the min-w-0 rationale. */}
      <ItemContent className="min-w-0">
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="font-medium">{comment.author}</span>
          {comment.timestamp && (
            <span className="text-xs text-muted-foreground">
              · {formatRelative(comment.timestamp, dateLocale)}
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ThumbsUp className="size-3" />
            {formatCount(comment.likeCount)}
          </span>
        </div>
        <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">
          {comment.text}
        </p>
      </ItemContent>
    </Item>
  )
}
