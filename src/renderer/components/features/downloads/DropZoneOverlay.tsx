import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DropZoneOverlayProps {
  active: boolean
}

export function DropZoneOverlay({ active }: DropZoneOverlayProps): React.ReactElement | null {
  const { t } = useTranslation('downloads')
  if (!active) return null
  return (
    <div
      data-testid="drop-zone-overlay"
      className={cn(
        'pointer-events-none fixed inset-0 z-50 flex items-center justify-center',
        'bg-background/80 backdrop-blur-sm'
      )}
    >
      <div className="m-8 flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-primary/60 bg-card/90 px-12 py-16 text-center shadow-xl">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Download className="size-8" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-semibold">{t('dropZone.title')}</p>
          <p className="text-sm text-muted-foreground">{t('dropZone.description')}</p>
        </div>
      </div>
    </div>
  )
}
