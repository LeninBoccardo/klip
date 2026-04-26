import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useEnrichAllVideos } from '@/hooks/use-videos'
import { toast } from 'sonner'
import type { EnrichVideosResult } from '@shared/types'
import { useState } from 'react'
import { Sparkles } from 'lucide-react'

export function EnrichVideosButton({ disabled }: { disabled?: boolean }) {
  const enrich = useEnrichAllVideos()
  const [result, setResult] = useState<EnrichVideosResult | null>(null)

  const handle = (): void => {
    setResult(null)
    enrich.mutate(undefined, {
      onSuccess: (res) => {
        setResult(res)
        toast.success(`Enriched ${res.enriched} of ${res.total} videos`)
      },
      onError: (err) => toast.error(`Enrichment failed: ${err.message}`)
    })
  }

  return (
    <div className="space-y-3">
      <Button onClick={handle} disabled={disabled || enrich.isPending}>
        {enrich.isPending ? (
          <Spinner className="mr-2 size-4" />
        ) : (
          <Sparkles className="mr-2 size-4" />
        )}
        Enrich All Videos
      </Button>
      <p className="text-xs text-muted-foreground">
        Fetches likes, comments, transcripts, and other metadata from yt-dlp for every video that
        hasn&apos;t been enriched yet. Runs one at a time to avoid rate-limit issues.
      </p>

      {result && (
        <Card size="sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Last Run</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Stat label="Total" value={result.total} />
              <Stat label="Enriched" value={result.enriched} />
              <Stat label="Failed" value={result.failed} />
              <Stat label="Skipped" value={result.skipped} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}
