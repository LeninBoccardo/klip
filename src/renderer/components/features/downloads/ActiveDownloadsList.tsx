import { useAppStore } from '@/hooks/use-app-store'
import { useCancelDownload } from '@/hooks/use-downloads'
import { DownloadProgressCard } from './DownloadProgressCard'
import { ItemGroup } from '@/components/ui/item'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@ui/empty'
import { Download } from 'lucide-react'

export function ActiveDownloadsList() {
  const activeDownloads = useAppStore((s) => s.activeDownloads)
  const cancelDownload = useCancelDownload()
  const entries = Object.values(activeDownloads)

  if (entries.length === 0) {
    return (
      <Empty className="min-h-[120px]">
        <EmptyHeader>
          <EmptyMedia>
            <Download className="size-6 text-muted-foreground" />
          </EmptyMedia>
          <EmptyTitle>No active downloads</EmptyTitle>
          <EmptyDescription>Downloads will appear here in real time.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ItemGroup>
      {entries.map((dl) => (
        <DownloadProgressCard
          key={dl.downloadId}
          progress={dl}
          onCancel={(id) => cancelDownload.mutate(id)}
        />
      ))}
    </ItemGroup>
  )
}
