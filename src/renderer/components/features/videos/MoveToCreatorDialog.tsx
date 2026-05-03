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
import { Button } from '@ui/button'
import { Label } from '@ui/label'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useCreatorsPaginated } from '@/hooks/use-creators'
import { useMoveVideosToCreator } from '@/hooks/use-videos'
import { RegisterCreatorDialog } from '@components/features/creators/RegisterCreatorDialog'

interface MoveToCreatorDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  videoIds: string[]
  /** Optional: hides the target creator from the picker (e.g., the parent
   * creator when opened from a creator detail page). */
  hideCreatorId?: string
  /** Called after a successful move with the result counts. */
  onMoved?: () => void
}

export function MoveToCreatorDialog({
  open,
  onOpenChange,
  videoIds,
  hideCreatorId,
  onMoved
}: MoveToCreatorDialogProps): React.ReactElement {
  const { t } = useTranslation('videos')
  const { t: tc } = useTranslation('common')
  const [target, setTarget] = useState<string>('')
  const [registerOpen, setRegisterOpen] = useState(false)
  const move = useMoveVideosToCreator()
  // Same 500-pageSize ceiling we use elsewhere; if a user has more creators we
  // surface a typeahead later (tracked in the cuts-page filter as well).
  const { data: creators } = useCreatorsPaginated({ page: 1, pageSize: 500 })

  const eligibleCreators = (creators?.data ?? []).filter((c) => c.id !== hideCreatorId)

  const handleSubmit = (): void => {
    if (!target || videoIds.length === 0) return
    move.mutate(
      { videoIds, targetCreatorId: target },
      {
        onSuccess: (result) => {
          const lines: string[] = []
          if (result.skipped > 0) lines.push(t('move.skippedNote', { count: result.skipped }))
          const errorCount = Object.keys(result.errors).length
          if (errorCount > 0) lines.push(t('move.errorsNote', { count: errorCount }))
          toast.success(t('move.movedToast', { count: result.moved }), {
            description: lines.length > 0 ? lines.join(' · ') : undefined
          })
          onOpenChange(false)
          setTarget('')
          onMoved?.()
        },
        onError: (err) => toast.error(t('move.moveFailed', { message: err.message }))
      }
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('move.title', { count: videoIds.length })}</DialogTitle>
            <DialogDescription>{t('move.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t('move.creatorLabel')}</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger>
                  <SelectValue placeholder={t('move.creatorPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {eligibleCreators.map((creator) => (
                    <SelectItem key={creator.id} value={creator.id}>
                      {creator.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRegisterOpen(true)}
              className="px-0"
            >
              <Plus className="mr-2 size-4" />
              {t('move.registerNew')}
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={move.isPending}
            >
              {tc('actions.cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={!target || move.isPending}>
              {move.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t('move.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RegisterCreatorDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onCreated={(id) => setTarget(id)}
        onOpenExisting={(id) => setTarget(id)}
      />
    </>
  )
}
