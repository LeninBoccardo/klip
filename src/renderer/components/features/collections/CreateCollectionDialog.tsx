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
import { Input } from '@ui/input'
import { Textarea } from '@ui/textarea'
import { Label } from '@ui/label'
import { Button } from '@ui/button'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateCollection } from '@/hooks/use-collections'
import type { CollectionDto } from '@shared/dtos'

interface CreateCollectionDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  /** Called with the newly-created collection on success. */
  onCreated?: (created: CollectionDto) => void
}

/**
 * Single-input dialog for creating a manual collection. The form is rendered
 * as a child component so we can key it on `open` — that way useState picks
 * up a fresh empty seed on each new open without setState-in-effect.
 */
export function CreateCollectionDialog({
  open,
  onOpenChange,
  onCreated
}: CreateCollectionDialogProps): React.ReactElement {
  const { t } = useTranslation('collections')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('create.title')}</DialogTitle>
          <DialogDescription>{t('create.description')}</DialogDescription>
        </DialogHeader>
        {open && (
          <CreateForm
            onClose={() => onOpenChange(false)}
            onCreated={(c) => {
              onOpenChange(false)
              onCreated?.(c)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CreateForm({
  onClose,
  onCreated
}: {
  onClose: () => void
  onCreated: (created: CollectionDto) => void
}): React.ReactElement {
  const { t } = useTranslation('collections')
  const { t: tc } = useTranslation('common')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const create = useCreateCollection()

  const trimmedName = name.trim()
  const canSubmit = trimmedName.length > 0 && !create.isPending

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault()
    if (!canSubmit) return
    create.mutate(
      { name: trimmedName, description: description.trim() || null },
      {
        onSuccess: (created) => {
          toast.success(t('create.createdToast', { name: created.name }))
          onCreated(created)
        },
        onError: (err) => toast.error(t('create.createFailed', { message: err.message }))
      }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="collection-name">{t('create.nameLabel')}</Label>
        <Input
          id="collection-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('create.namePlaceholder')}
          maxLength={200}
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="collection-description">{t('create.descriptionLabel')}</Label>
        <Textarea
          id="collection-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('create.descriptionPlaceholder')}
          maxLength={5000}
          rows={3}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {tc('actions.cancel')}
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {create.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          {tc('actions.create')}
        </Button>
      </DialogFooter>
    </form>
  )
}
