import { useState } from 'react'
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New collection</DialogTitle>
          <DialogDescription>
            Create a manual collection. You can add videos and cuts to it from any card&apos;s
            context menu.
          </DialogDescription>
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
          toast.success(`Collection "${created.name}" created`)
          onCreated(created)
        },
        onError: (err) => toast.error(`Failed to create collection: ${err.message}`)
      }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="collection-name">Name</Label>
        <Input
          id="collection-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My favourite clips"
          maxLength={200}
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="collection-description">Description (optional)</Label>
        <Textarea
          id="collection-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this collection is for…"
          maxLength={5000}
          rows={3}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {create.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Create
        </Button>
      </DialogFooter>
    </form>
  )
}
