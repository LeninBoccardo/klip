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
import { useRenameCollection } from '@/hooks/use-collections'
import type { CollectionDto } from '@shared/dtos'

interface RenameCollectionDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  collection: CollectionDto | null
}

export function RenameCollectionDialog({
  open,
  onOpenChange,
  collection
}: RenameCollectionDialogProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit collection</DialogTitle>
          <DialogDescription>Rename or update the description.</DialogDescription>
        </DialogHeader>
        {/* Keying the form on (open, id) makes useState pick up the latest
            seed naturally on each new open without setState-in-effect. */}
        {collection && open && (
          <RenameForm
            key={`${collection.id}:${open}`}
            collection={collection}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function RenameForm({
  collection,
  onClose
}: {
  collection: CollectionDto
  onClose: () => void
}): React.ReactElement {
  const [name, setName] = useState(collection.name)
  const [description, setDescription] = useState(collection.description ?? '')
  const rename = useRenameCollection()

  const trimmedName = name.trim()
  const canSubmit = trimmedName.length > 0 && !rename.isPending

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault()
    if (!canSubmit) return
    rename.mutate(
      { id: collection.id, name: trimmedName, description: description.trim() || null },
      {
        onSuccess: () => {
          toast.success('Collection updated')
          onClose()
        },
        onError: (err) => toast.error(`Failed to update: ${err.message}`)
      }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="rename-collection-name">Name</Label>
        <Input
          id="rename-collection-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="rename-collection-description">Description</Label>
        <Textarea
          id="rename-collection-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={5000}
          rows={3}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {rename.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}
