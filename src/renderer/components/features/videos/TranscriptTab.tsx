import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@ui/card'
import { Button } from '@ui/button'
import { Input } from '@ui/input'
import { Skeleton } from '@ui/skeleton'
import { ScrollArea } from '@ui/scroll-area'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@ui/empty'
import { useTranscript, useTranscriptSegments } from '@/hooks/use-videos'
import { usePlayerStore } from '@/hooks/use-player-store'

interface TranscriptTabProps {
  videoId: string
  hasTranscript: boolean
  everEnriched: boolean
  /**
   * Total video duration in seconds. Drives the timestamp format:
   * `HH:MM:SS` for ≥ 1h videos (so every row reads consistently, including
   * the first one at 00:00), `MM:SS` otherwise. Null falls back to
   * inferring per-row from the largest segment endMs.
   */
  durationSeconds: number | null
}

interface SearchMatch {
  segmentIndex: number
  start: number
  end: number
}

/**
 * Format `ms` as `MM:SS` or `HH:MM:SS` depending on `includeHours`. The caller
 * picks the mode once for the whole transcript so every row uses the same
 * width — otherwise long videos would mix `00:42` and `1:23:45` cells.
 */
function formatTimestamp(ms: number, includeHours: boolean): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  if (!includeHours) return `${mm}:${ss}`
  const hh = String(hours).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

export function TranscriptTab({
  videoId,
  hasTranscript,
  everEnriched,
  durationSeconds
}: TranscriptTabProps): React.ReactElement {
  const { t } = useTranslation('videos')
  const transcriptText = useTranscript(videoId)
  const transcriptSegments = useTranscriptSegments(videoId)
  const requestSeek = usePlayerStore((s) => s.requestSeek)

  const segments = transcriptSegments.data ?? null
  const plainText = transcriptText.data ?? null

  const isLoading = transcriptText.isLoading || transcriptSegments.isLoading

  const [query, setQuery] = useState('')
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)

  // Virtualize the segment list: a captioned 1-2h video can have thousands of
  // segments, and mounting every <li> dropped scroll/search performance (the
  // same problem VirtualAuditList exists to avoid). Only visible rows mount.
  const scrollParentRef = useRef<HTMLDivElement>(null)
  const segmentCount = segments?.length ?? 0
  const virtualizer = useVirtualizer({
    count: segmentCount,
    getScrollElement: () => scrollParentRef.current,
    // Measured baseline for a one-line caption; wrapped rows are corrected via
    // measureElement.
    estimateSize: () => 44,
    overscan: 12
  })

  // Use HH:MM:SS once the underlying video is ≥ 1h, so the first row
  // (which starts at 00:00) lines up with later rows that pass the hour
  // mark. If `durationSeconds` is unavailable, fall back to inspecting the
  // largest segment endMs.
  const includeHours = useMemo(() => {
    if (durationSeconds !== null) return durationSeconds >= 3600
    if (!segments || segments.length === 0) return false
    return segments[segments.length - 1].endMs >= 3_600_000
  }, [durationSeconds, segments])

  const copyText = useMemo(() => {
    if (segments && segments.length > 0) {
      return segments
        .map((s) => `[${formatTimestamp(s.startMs, includeHours)}] ${s.text}`)
        .join('\n')
    }
    return plainText ?? ''
  }, [segments, plainText, includeHours])

  const matches = useMemo<SearchMatch[]>(() => {
    if (!query || !segments) return []
    const needle = query.toLowerCase()
    const result: SearchMatch[] = []
    segments.forEach((seg, segIdx) => {
      const hay = seg.text.toLowerCase()
      let from = 0
      while (true) {
        const found = hay.indexOf(needle, from)
        if (found === -1) break
        result.push({ segmentIndex: segIdx, start: found, end: found + needle.length })
        from = found + needle.length
      }
    })
    return result
  }, [query, segments])

  const matchesBySegment = useMemo(() => {
    const grouped = new Map<number, SearchMatch[]>()
    for (const m of matches) {
      const arr = grouped.get(m.segmentIndex)
      if (arr) arr.push(m)
      else grouped.set(m.segmentIndex, [m])
    }
    return grouped
  }, [matches])

  useEffect(() => {
    setCurrentMatchIndex(0)
  }, [matches])

  useEffect(() => {
    if (matches.length === 0) return
    const target = matches[currentMatchIndex]
    if (!target) return
    // Scroll the virtualizer to the matched segment by index — the target row
    // may not be mounted (windowed), so a ref-based scrollIntoView can't be
    // used. scrollToIndex mounts and centers it.
    virtualizer.scrollToIndex(target.segmentIndex, { align: 'center' })
  }, [currentMatchIndex, matches, virtualizer])

  const goToNext = (): void => {
    if (matches.length === 0) return
    setCurrentMatchIndex((i) => (i + 1) % matches.length)
  }

  const goToPrev = (): void => {
    if (matches.length === 0) return
    setCurrentMatchIndex((i) => (i - 1 + matches.length) % matches.length)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) goToPrev()
      else goToNext()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setQuery('')
    }
  }

  const handleCopy = (): void => {
    if (!copyText) return
    navigator.clipboard.writeText(copyText)
    toast.success(t('detail.transcriptCopied'))
  }

  const handleSeek = (startMs: number): void => {
    requestSeek(startMs / 1000)
  }

  const hasContent = (segments && segments.length > 0) || (plainText !== null && plainText !== '')
  const currentMatch = matches[currentMatchIndex]

  const renderSegmentText = (text: string, segIdx: number): React.ReactNode => {
    const segMatches = matchesBySegment.get(segIdx)
    if (!segMatches || segMatches.length === 0) return text
    const nodes: React.ReactNode[] = []
    let pos = 0
    segMatches.forEach((m, i) => {
      if (pos < m.start) nodes.push(text.substring(pos, m.start))
      const isCurrent = m === currentMatch
      nodes.push(
        <mark
          key={`${m.start}-${m.end}-${i}`}
          className={
            isCurrent
              ? 'rounded-sm bg-yellow-400/80 px-0.5 text-foreground dark:bg-yellow-500/80'
              : 'rounded-sm bg-yellow-300/40 px-0.5 text-foreground dark:bg-yellow-500/30'
          }
        >
          {text.substring(m.start, m.end)}
        </mark>
      )
      pos = m.end
    })
    if (pos < text.length) nodes.push(text.substring(pos))
    return nodes
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="text-base">{t('detail.transcript.title')}</CardTitle>
          <CardDescription>
            {hasTranscript
              ? t('detail.transcript.fromCaptions')
              : t('detail.transcript.notFetched')}
          </CardDescription>
        </div>
        {hasContent && (
          <Button size="sm" variant="outline" onClick={handleCopy} className="shrink-0">
            <Copy className="mr-2 size-4" />
            {t('actions.copy', { ns: 'common' })}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : segments && segments.length > 0 ? (
          <>
            <div className="flex items-center gap-2">
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={t('detail.transcript.searchPlaceholder')}
                aria-label={t('detail.transcript.searchPlaceholder')}
                className="flex-1"
              />
              {query.length > 0 && (
                <>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {matches.length === 0
                      ? t('detail.transcript.searchNoMatches')
                      : t('detail.transcript.searchMatchCount', {
                          current: currentMatchIndex + 1,
                          total: matches.length
                        })}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={matches.length === 0}
                    onClick={goToPrev}
                    aria-label={t('detail.transcript.searchPrev')}
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={matches.length === 0}
                    onClick={goToNext}
                    aria-label={t('detail.transcript.searchNext')}
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                </>
              )}
            </div>
            <div ref={scrollParentRef} className="h-125 overflow-y-auto rounded border">
              <ul className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const segIdx = virtualRow.index
                  const seg = segments[segIdx]
                  return (
                    <li
                      key={`${seg.startMs}-${seg.endMs}`}
                      data-index={segIdx}
                      ref={virtualizer.measureElement}
                      className="border-border/60 absolute left-0 top-0 w-full min-w-0 border-b"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSeek(seg.startMs)}
                        aria-label={t('detail.transcript.seekAria', {
                          time: formatTimestamp(seg.startMs, includeHours)
                        })}
                        className="hover:bg-muted/40 focus-visible:bg-muted/60 flex w-full items-start gap-3 rounded px-3 py-2 text-left transition-colors focus-visible:outline-none"
                      >
                        <span
                          className={`text-muted-foreground shrink-0 pt-0.5 font-mono text-xs tabular-nums ${
                            includeHours ? 'w-18' : 'w-14'
                          }`}
                        >
                          {formatTimestamp(seg.startMs, includeHours)}
                        </span>
                        <span className="wrap-break-word min-w-0 text-sm leading-relaxed">
                          {renderSegmentText(seg.text, segIdx)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </>
        ) : plainText ? (
          // Fallback for transcripts that exist as plain text in the DB but
          // whose VTT file is missing (older library entries pre-segment-IPC).
          <ScrollArea className="h-125 rounded border">
            <pre className="text-xs leading-relaxed wrap-break-word whitespace-pre-wrap p-4 font-mono">
              {plainText}
            </pre>
          </ScrollArea>
        ) : (
          <Empty className="min-h-50">
            <EmptyHeader>
              <EmptyTitle>{t('detail.transcript.noneTitle')}</EmptyTitle>
              <EmptyDescription>
                {everEnriched
                  ? t('detail.transcript.noneDescriptionEnriched')
                  : t('detail.transcript.noneDescriptionNotEnriched')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}
