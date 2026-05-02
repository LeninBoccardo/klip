import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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

export function MigrateRootButton({ currentRootPath }: MigrateRootButtonProps): React.ReactElement {
  const { t } = useTranslation('settings')
  const { t: tc } = useTranslation('common')
  const isBlocking = useAppStore((s) => s.blockingOperation !== null)
  const { mutation, selectFolder } = useMigrateRoot()

  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showResult, setShowResult] = useState(false)

  const handleClick = async (): Promise<void> => {
    const folder = await selectFolder()
    if (folder) {
      setSelectedFolder(folder)
      setShowConfirm(true)
    }
  }

  const handleConfirm = (): void => {
    setShowConfirm(false)
    if (selectedFolder) {
      mutation.mutate(selectedFolder, {
        onSettled: () => {
          setShowResult(true)
        }
      })
    }
  }

  const handleRetry = (): void => {
    setShowResult(false)
    if (selectedFolder) {
      mutation.mutate(selectedFolder, {
        onSettled: () => {
          setShowResult(true)
        }
      })
    }
  }

  const handleDismissResult = (): void => {
    setShowResult(false)
    setSelectedFolder(null)
  }

  const result = mutation.data
  const isSuccess = result?.success === true
  const isError = mutation.isError || (result && !result.success)
  const errorMessage = mutation.error?.message ?? result?.error ?? t('storage.result.unknownError')

  return (
    <>
      <Button variant="outline" onClick={handleClick} disabled={isBlocking || mutation.isPending}>
        <FolderSync className="mr-2 size-4" />
        {t('storage.changeButton')}
      </Button>

      {/* Confirmation AlertDialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('storage.confirm.title')}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">{t('storage.confirm.body')}</span>
              <span className="block text-xs">
                <strong>{t('storage.confirm.from')}</strong>{' '}
                <code className="rounded bg-muted px-1 py-0.5">
                  {currentRootPath ?? t('storage.confirm.unknown')}
                </code>
              </span>
              <span className="block text-xs">
                <strong>{t('storage.confirm.to')}</strong>{' '}
                <code className="rounded bg-muted px-1 py-0.5">{selectedFolder}</code>
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {t('storage.confirm.action')}
            </AlertDialogAction>
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
                  <CheckCircle2 className="size-5 text-success" />
                  {t('storage.result.successTitle')}
                </DialogTitle>
                <DialogDescription>
                  {t('storage.result.successDescription', { count: result?.movedCount ?? 0 })}
                </DialogDescription>
              </>
            ) : isError ? (
              <>
                <DialogTitle className="flex items-center gap-2">
                  <XCircle className="size-5 text-destructive" />
                  {t('storage.result.errorTitle')}
                </DialogTitle>
                <DialogDescription>{errorMessage}</DialogDescription>
              </>
            ) : null}
          </DialogHeader>
          <DialogFooter>
            {isError && (
              <Button variant="outline" onClick={handleRetry}>
                {tc('actions.retry')}
              </Button>
            )}
            <Button onClick={handleDismissResult}>
              {isSuccess ? tc('actions.ok') : tc('actions.dismiss')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
