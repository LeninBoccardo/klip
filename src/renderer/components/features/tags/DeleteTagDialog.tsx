import { useTranslation } from 'react-i18next'
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
import { toast } from 'sonner'
import { useDeleteTagGlobally } from '@/hooks/use-tags'
import type { TagAggregation } from '@shared/types'

interface DeleteTagDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  tag: TagAggregation | null
}

export function DeleteTagDialog({
  open,
  onOpenChange,
  tag
}: DeleteTagDialogProps): React.ReactElement {
  const { t } = useTranslation('tags')
  const { t: tc } = useTranslation('common')
  const del = useDeleteTagGlobally()

  const handleConfirm = (): void => {
    if (!tag) return
    del.mutate(tag.tag, {
      onSuccess: (result) => {
        toast.success(
          t('manage.toasts.deleted', {
            name: tag.tag,
            videos: result.videosUpdated,
            cuts: result.cutsUpdated
          })
        )
        onOpenChange(false)
      },
      onError: (err) => toast.error(t('manage.toasts.deleteFailed', { message: err.message }))
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('manage.delete.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('manage.delete.description', {
              name: tag?.tag ?? '',
              videoCount: tag?.videoCount ?? 0,
              cutCount: tag?.cutCount ?? 0
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>{tc('actions.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleConfirm()
            }}
            disabled={del.isPending}
          >
            {t('manage.delete.submit')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
