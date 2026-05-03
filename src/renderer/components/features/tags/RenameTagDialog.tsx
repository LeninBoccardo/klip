import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ui/dialog'
import { Input } from '@ui/input'
import { Label } from '@ui/label'
import { Button } from '@ui/button'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRenameTagGlobally } from '@/hooks/use-tags'
import type { TagAggregation } from '@shared/types'

interface RenameTagDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  tag: TagAggregation | null
  existingTags: ReadonlySet<string>
}

export function RenameTagDialog({
  open,
  onOpenChange,
  tag,
  existingTags
}: RenameTagDialogProps): React.ReactElement {
  const { t } = useTranslation('tags')
  const rename = useRenameTagGlobally()
  const [next, setNext] = useState('')

  // Reset the input each time the dialog opens for a new tag.
  useEffect(() => {
    if (open && tag) setNext(tag.tag)
  }, [open, tag])

  const trimmed = next.trim()
  const isUnchanged = !tag || trimmed === tag.tag
  const willMerge = !!tag && trimmed.length > 0 && trimmed !== tag.tag && existingTags.has(trimmed)

  const handleSubmit = (): void => {
    if (!tag || trimmed.length === 0 || isUnchanged) return
    rename.mutate(
      { oldTag: tag.tag, newTag: trimmed },
      {
        onSuccess: (result) => {
          toast.success(
            t('manage.toasts.renamed', {
              from: tag.tag,
              to: trimmed,
              videos: result.videosUpdated,
              cuts: result.cutsUpdated
            })
          )
          onOpenChange(false)
        },
        onError: (err) => toast.error(t('manage.toasts.renameFailed', { message: err.message }))
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('manage.rename.title')}</DialogTitle>
          <DialogDescription>{t('manage.rename.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t('manage.rename.fromLabel')}</Label>
            <Input value={tag?.tag ?? ''} readOnly disabled />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rename-tag-to">{t('manage.rename.toLabel')}</Label>
            <Input
              id="rename-tag-to"
              autoFocus
              value={next}
              onChange={(e) => setNext(e.target.value)}
              maxLength={64}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !rename.isPending) handleSubmit()
              }}
            />
          </div>
          {willMerge && (
            <p className="text-sm text-amber-500">
              {t('manage.rename.mergeWarning', { name: trimmed })}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={rename.isPending || trimmed.length === 0 || isUnchanged}
          >
            {rename.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t('manage.rename.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
