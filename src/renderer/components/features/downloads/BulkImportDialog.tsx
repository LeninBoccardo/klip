import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ui/select'
import { Textarea } from '@ui/textarea'
import { Button } from '@ui/button'
import { Checkbox } from '@ui/checkbox'
import { Badge } from '@ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ui/table'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useFetchVideoInfo, useDownloadVideo } from '@/hooks/use-downloads'
import { useCreatorsPaginated } from '@/hooks/use-creators'
import { extractFirstUrl, isHttpUrl } from '@/lib/youtube-url'
import { mapWithConcurrency } from '@/lib/concurrency'
import type { VideoInfo } from '@shared/types'

interface BulkImportDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
}

type RowStatus = 'pending' | 'ready' | 'duplicate' | 'error'

interface PreviewRow {
  url: string
  status: RowStatus
  info?: VideoInfo
  error?: string
  creatorOverride: string
  include: boolean
}

const MAX_URLS = 100
const FETCH_CONCURRENCY = 4
const AUTO_CREATOR = '__auto__'

export function BulkImportDialog({
  open,
  onOpenChange
}: BulkImportDialogProps): React.ReactElement {
  const { t } = useTranslation('downloads')
  const { t: tc } = useTranslation('common')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<PreviewRow[] | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const fetchInfo = useFetchVideoInfo()
  const downloadVideo = useDownloadVideo()
  const { data: creators } = useCreatorsPaginated({ page: 1, pageSize: 500 })

  const handleClose = (): void => {
    if (submitting || previewing) return
    onOpenChange(false)
    setText('')
    setRows(null)
  }

  const handlePreview = async (): Promise<void> => {
    const lines = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      // Accept either a bare URL or a `text/uri-list`-style line.
      .map((line) => extractFirstUrl(line) ?? (isHttpUrl(line) ? line : null))
      .filter((u): u is string => u !== null)

    if (lines.length === 0) {
      toast.error(t('bulkImport.noUrls'))
      return
    }
    if (lines.length > MAX_URLS) {
      toast.error(t('bulkImport.tooMany', { count: lines.length }))
      return
    }

    setPreviewing(true)
    try {
      const results = await mapWithConcurrency(lines, FETCH_CONCURRENCY, async (url) => {
        try {
          const info = await fetchInfo.mutateAsync(url)
          // Dedupe: existing video would have id === youtube videoId.
          const existing = await window.api.getVideoById(info.videoId)
          const status: RowStatus = existing ? 'duplicate' : 'ready'
          return {
            url,
            status,
            info,
            creatorOverride: AUTO_CREATOR,
            include: status === 'ready'
          } satisfies PreviewRow
        } catch (err) {
          return {
            url,
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
            creatorOverride: AUTO_CREATOR,
            include: false
          } satisfies PreviewRow
        }
      })
      setRows(results)
    } finally {
      setPreviewing(false)
    }
  }

  const updateRow = (idx: number, patch: Partial<PreviewRow>): void => {
    setRows((prev) => {
      if (!prev) return prev
      const next = prev.slice()
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }

  const includedRows = rows?.filter((r) => r.include && r.status === 'ready') ?? []

  const handleSubmit = async (): Promise<void> => {
    if (includedRows.length === 0) return
    setSubmitting(true)
    let queued = 0
    let failed = 0
    for (const row of includedRows) {
      const channel = row.info?.channel ?? null
      const creatorName =
        row.creatorOverride === AUTO_CREATOR
          ? channel ?? row.info?.videoId ?? 'unknown'
          : creators?.data.find((c) => c.id === row.creatorOverride)?.name ??
            row.creatorOverride
      try {
        await downloadVideo.mutateAsync({ url: row.url, creatorName })
        queued++
      } catch {
        failed++
      }
    }
    setSubmitting(false)

    const description =
      failed > 0 ? t('bulkImport.queuedFailedNote', { count: failed }) : undefined
    toast.success(t('bulkImport.queuedToast', { count: queued }), { description })
    onOpenChange(false)
    setText('')
    setRows(null)
  }

  const statusBadgeVariant = (status: RowStatus): 'default' | 'secondary' | 'destructive' => {
    if (status === 'ready') return 'default'
    if (status === 'error') return 'destructive'
    return 'secondary'
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : handleClose())}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('bulkImport.title')}</DialogTitle>
          <DialogDescription>{t('bulkImport.description')}</DialogDescription>
        </DialogHeader>

        {!rows && (
          <div className="space-y-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('bulkImport.textareaPlaceholder')}
              className="min-h-[180px] font-mono text-xs"
              disabled={previewing}
            />
          </div>
        )}

        {rows && (
          <div className="max-h-[50vh] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">{t('bulkImport.table.include')}</TableHead>
                  <TableHead className="max-w-xs">{t('bulkImport.table.title')}</TableHead>
                  <TableHead>{t('bulkImport.table.creator')}</TableHead>
                  <TableHead>{t('bulkImport.table.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => {
                  const channel = row.info?.channel
                  const autoLabel = channel
                    ? t('bulkImport.creatorAuto', { name: channel })
                    : '—'
                  return (
                    <TableRow key={`${row.url}-${idx}`}>
                      <TableCell>
                        <Checkbox
                          checked={row.include}
                          disabled={row.status !== 'ready'}
                          onCheckedChange={(v) => updateRow(idx, { include: !!v })}
                        />
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="truncate font-medium">{row.info?.title ?? row.url}</p>
                        <p className="truncate text-xs text-muted-foreground">{row.url}</p>
                        {row.error && (
                          <p className="text-xs text-destructive">{row.error}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.creatorOverride}
                          onValueChange={(v) => updateRow(idx, { creatorOverride: v })}
                          disabled={row.status !== 'ready'}
                        >
                          <SelectTrigger className="w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={AUTO_CREATOR}>{autoLabel}</SelectItem>
                            {creators?.data.map((creator) => (
                              <SelectItem key={creator.id} value={creator.id}>
                                {creator.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(row.status)}>
                          {t(`bulkImport.status.${row.status}` as const)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting || previewing}>
            {tc('actions.cancel')}
          </Button>
          {!rows ? (
            <Button onClick={handlePreview} disabled={previewing || text.trim().length === 0}>
              {previewing ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 size-4" />
              )}
              {previewing ? t('bulkImport.previewing') : t('bulkImport.previewButton')}
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting || includedRows.length === 0}>
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t('bulkImport.submitButton', { count: includedRows.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
