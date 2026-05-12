import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@ui/card'
import { Button } from '@ui/button'
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

  const handleCopy = (): void => {
    if (!copyText) return
    navigator.clipboard.writeText(copyText)
    toast.success(t('detail.transcriptCopied'))
  }

  const handleSeek = (startMs: number): void => {
    requestSeek(startMs / 1000)
  }

  const hasContent = (segments && segments.length > 0) || (plainText !== null && plainText !== '')

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
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : segments && segments.length > 0 ? (
          <ScrollArea className="h-125 rounded border">
            <ul className="divide-border divide-y p-1">
              {segments.map((seg) => (
                <li key={`${seg.startMs}-${seg.endMs}`} className="min-w-0">
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
                      {seg.text}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
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
