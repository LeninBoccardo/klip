import { useMemo, useState } from 'react'
import { useFetchVideoComments } from '@/hooks/use-videos'
import { Button } from '@ui/button'
import { Badge } from '@ui/badge'
import { ScrollArea } from '@ui/scroll-area'
import { Avatar, AvatarFallback } from '@ui/avatar'
import { Item, ItemMedia, ItemContent } from '@ui/item'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@ui/empty'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@ui/collapsible'
import { ChevronRight, Copy, Loader2, MessageSquare, Pin, RefreshCw, ThumbsUp } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
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

function formatRelative(timestamp: number | null): string {
  if (!timestamp) return ''
  try {
    return formatDistanceToNow(new Date(timestamp * 1000), { addSuffix: true })
  } catch {
    return ''
  }
}

export function CommentsTab({ videoId, knownCount }: CommentsTabProps): React.ReactElement | null {
  const fetchComments = useFetchVideoComments()
  const data: VideoCommentsResult | undefined = fetchComments.data

  const threads = useMemo(() => (data ? groupThreads(data.comments) : []), [data])
  const replyCount = useMemo(() => threads.reduce((sum, t) => sum + t.replies.length, 0), [threads])

  const handleLoad = (): void => {
    fetchComments.mutate({ videoId })
  }

  const handleCopyAll = async (): Promise<void> => {
    if (!data) return
    try {
      await navigator.clipboard.writeText(buildClipboardText(threads))
      toast.success('Comments copied to clipboard')
    } catch {
      toast.error('Failed to copy comments')
    }
  }

  // ── Idle ──
  if (!fetchComments.isPending && !data && !fetchComments.isError) {
    return (
      <Empty className="min-h-[300px]">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageSquare className="size-6" />
          </EmptyMedia>
          <EmptyTitle>No comments loaded</EmptyTitle>
          <EmptyDescription>
            {knownCount != null
              ? `This video has ${formatCount(knownCount)} comments. Click below to fetch them — may take 30–60s for popular videos.`
              : 'Click below to fetch comments from YouTube. May take 30–60s for popular videos.'}
          </EmptyDescription>
        </EmptyHeader>
        <Button onClick={handleLoad} className="mt-4">
          <MessageSquare className="mr-2 size-4" />
          Load Comments
        </Button>
      </Empty>
    )
  }

  // ── Loading ──
  if (fetchComments.isPending) {
    return (
      <Empty className="min-h-[300px]">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Loader2 className="size-6 animate-spin" />
          </EmptyMedia>
          <EmptyTitle>Fetching comments from YouTube…</EmptyTitle>
          <EmptyDescription>This may take 30–60 seconds for popular videos.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  // ── Error ──
  if (fetchComments.isError) {
    return (
      <Empty className="min-h-[300px]">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageSquare className="size-6 text-destructive" />
          </EmptyMedia>
          <EmptyTitle>Failed to fetch comments</EmptyTitle>
          <EmptyDescription>{fetchComments.error.message}</EmptyDescription>
        </EmptyHeader>
        <Button onClick={handleLoad} variant="outline" className="mt-4">
          <RefreshCw className="mr-2 size-4" />
          Retry
        </Button>
      </Empty>
    )
  }

  // ── Loaded ──
  if (!data) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="size-4" />
          <span>
            <span className="font-medium text-foreground">{formatCount(data.totalFetched)}</span>{' '}
            comments
            {replyCount > 0 && (
              <>
                {' · '}
                <span className="font-medium text-foreground">{formatCount(replyCount)}</span>{' '}
                replies
              </>
            )}
          </span>
          {data.wasTruncated && (
            <Badge variant="secondary" className="ml-1">
              First 500 only
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyAll}>
            <Copy className="mr-2 size-4" />
            Copy All
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLoad}>
            <RefreshCw className="mr-2 size-4" />
            Reload
          </Button>
        </div>
      </div>

      {threads.length === 0 ? (
        <Empty className="min-h-[200px]">
          <EmptyHeader>
            <EmptyTitle>No comments on this video</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ScrollArea className="max-h-[600px] rounded border">
          <div className="divide-y">
            {threads.map((thread) => (
              <CommentRow key={thread.top.id} thread={thread} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

// ── Comment row ──

function CommentRow({ thread }: { thread: ThreadGroup }): React.ReactElement {
  const [open, setOpen] = useState(false)
  const { top, replies } = thread

  return (
    <div className="px-3 py-3">
      <Item variant="default" className="border-transparent p-0 items-start gap-3">
        <ItemMedia variant="image" className="size-9 rounded-full">
          <Avatar>
            <AvatarFallback>{authorInitials(top.author)}</AvatarFallback>
          </Avatar>
        </ItemMedia>
        <ItemContent>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="font-medium">{top.author}</span>
            {top.isPinned && (
              <Badge variant="secondary" className="gap-1">
                <Pin className="size-3" />
                Pinned
              </Badge>
            )}
            {top.timestamp && (
              <span className="text-xs text-muted-foreground">
                · {formatRelative(top.timestamp)}
              </span>
            )}
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
              <ThumbsUp className="size-3" />
              {formatCount(top.likeCount)}
            </span>
          </div>
          <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap break-words">{top.text}</p>

          {replies.length > 0 && (
            <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
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
                  {open ? `Hide ${replies.length} replies` : `View ${replies.length} replies`}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 ml-2 border-l border-border pl-4 space-y-3">
                {replies.map((reply) => (
                  <ReplyRow key={reply.id} comment={reply} />
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

function ReplyRow({ comment }: { comment: VideoComment }): React.ReactElement {
  return (
    <Item variant="default" className="border-transparent p-0 items-start gap-2">
      <ItemMedia variant="image" className="size-7 rounded-full">
        <Avatar size="sm">
          <AvatarFallback>{authorInitials(comment.author)}</AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="font-medium">{comment.author}</span>
          {comment.timestamp && (
            <span className="text-xs text-muted-foreground">
              · {formatRelative(comment.timestamp)}
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ThumbsUp className="size-3" />
            {formatCount(comment.likeCount)}
          </span>
        </div>
        <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap break-words">
          {comment.text}
        </p>
      </ItemContent>
    </Item>
  )
}
