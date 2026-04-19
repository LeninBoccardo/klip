import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useAppStore } from '@/hooks/use-app-store'
import { useMigrateRoot } from '@/hooks/use-migrate-root'
import { FolderSync, CheckCircle2, XCircle } from 'lucide-react'

interface MigrateRootButtonProps {
  currentRootPath: string | null | undefined
}

export function MigrateRootButton({ currentRootPath }: MigrateRootButtonProps) {
  const isBlocking = useAppStore((s) => s.blockingOperation !== null)
  const { mutation, selectFolder } = useMigrateRoot()

  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showResult, setShowResult] = useState(false)

  const handleClick = async () => {
    const folder = await selectFolder()
    if (folder) {
      setSelectedFolder(folder)
      setShowConfirm(true)
    }
  }

  const handleConfirm = () => {
    setShowConfirm(false)
    if (selectedFolder) {
      mutation.mutate(selectedFolder, {
        onSettled: () => {
          setShowResult(true)
        }
      })
    }
  }

  const handleRetry = () => {
    setShowResult(false)
    if (selectedFolder) {
      mutation.mutate(selectedFolder, {
        onSettled: () => {
          setShowResult(true)
        }
      })
    }
  }

  const handleDismissResult = () => {
    setShowResult(false)
    setSelectedFolder(null)
  }

  const result = mutation.data
  const isSuccess = result?.success === true
  const isError = mutation.isError || (result && !result.success)
  const errorMessage = mutation.error?.message ?? result?.error ?? 'An unknown error occurred'

  return (
    <>
      <Button variant="outline" onClick={handleClick} disabled={isBlocking || mutation.isPending}>
        <FolderSync className="mr-2 size-4" />
        Change Root Folder
      </Button>

      {/* Confirmation AlertDialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move all files to a new location?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                This will move all creator folders from the current root to the selected
                destination. The target folder must be empty.
              </span>
              <span className="block text-xs">
                <strong>From:</strong>{' '}
                <code className="rounded bg-muted px-1 py-0.5">{currentRootPath ?? 'Unknown'}</code>
              </span>
              <span className="block text-xs">
                <strong>To:</strong>{' '}
                <code className="rounded bg-muted px-1 py-0.5">{selectedFolder}</code>
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Move Files</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Result Dialog */}
      <Dialog open={showResult} onOpenChange={handleDismissResult}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            {isSuccess ? (
              <>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-green-500" />
                  Migration Complete
                </DialogTitle>
                <DialogDescription>
                  Successfully moved {result?.movedCount ?? 0} folder
                  {result?.movedCount === 1 ? '' : 's'} to the new location.
                </DialogDescription>
              </>
            ) : isError ? (
              <>
                <DialogTitle className="flex items-center gap-2">
                  <XCircle className="size-5 text-destructive" />
                  Migration Failed
                </DialogTitle>
                <DialogDescription>{errorMessage}</DialogDescription>
              </>
            ) : null}
          </DialogHeader>
          <DialogFooter>
            {isError && (
              <Button variant="outline" onClick={handleRetry}>
                Retry
              </Button>
            )}
            <Button onClick={handleDismissResult}>{isSuccess ? 'OK' : 'Dismiss'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
