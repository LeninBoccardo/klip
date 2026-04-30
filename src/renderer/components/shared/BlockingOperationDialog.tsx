import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/hooks/use-app-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'

const KNOWN_PHASES = new Set(['moving', 'updating_db', 'reconciling'])

/**
 * Non-dismissable dialog shown during long-running blocking operations.
 * Driven by `useAppStore().blockingOperation`. Renders nothing when idle.
 *
 * Mount once near the root layout.
 */
export function BlockingOperationDialog(): React.ReactElement | null {
  const { t } = useTranslation('common')
  const blockingOperation = useAppStore((s) => s.blockingOperation)

  if (!blockingOperation) return null

  const { title, description, progress } = blockingOperation
  const percentage =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : undefined

  return (
    <Dialog open modal>
      <DialogContent
        className="sm:max-w-md [&>button]:hidden"
        onInteractOutside={(e: Event) => e.preventDefault()}
        onEscapeKeyDown={(e: KeyboardEvent) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {progress && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {KNOWN_PHASES.has(progress.phase)
                  ? t(
                      `operations.phases.${progress.phase as 'moving' | 'updating_db' | 'reconciling'}`
                    )
                  : progress.phase}
              </span>
              {progress.total > 0 && (
                <Badge variant="secondary">
                  {progress.current}/{progress.total}
                </Badge>
              )}
            </div>

            {percentage !== undefined && <Progress value={percentage} className="h-2" />}

            {progress.currentFolder && (
              <p className="truncate text-xs text-muted-foreground">{progress.currentFolder}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
