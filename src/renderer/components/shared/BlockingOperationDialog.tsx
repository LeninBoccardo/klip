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

const phaseLabels: Record<string, string> = {
  moving: 'Moving files…',
  updating_db: 'Updating database…',
  reconciling: 'Reconciling…'
}

/**
 * Non-dismissable dialog shown during long-running blocking operations.
 * Driven by `useAppStore().blockingOperation`. Renders nothing when idle.
 *
 * Mount once near the root layout.
 */
export function BlockingOperationDialog() {
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
                {phaseLabels[progress.phase] ?? progress.phase}
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
