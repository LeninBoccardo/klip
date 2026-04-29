import { useState } from 'react'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator
} from '@ui/command'
import { ListMusic, Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useCollectionsPaginated,
  useAddToCollection,
  useCreateCollection
} from '@/hooks/use-collections'
import type { CollectionItemKind } from '@shared/types'

interface AddToCollectionDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  /** What to add — passed in by the caller (entity context menu). */
  entity: { kind: CollectionItemKind; id: string; title: string } | null
}

const PALETTE_LIMIT = 50

/**
 * cmdk-driven picker for adding the current entity to an existing collection.
 *
 * Empty / unmatched query exposes a "Create new collection" pivot — the
 * dialog stays open through create-then-add so the user gets a single
 * confirmation toast.
 */
export function AddToCollectionDialog({
  open,
  onOpenChange,
  entity
}: AddToCollectionDialogProps): React.ReactElement {
  const [query, setQuery] = useState('')
  // cmdk's filter handles the search; we always fetch the first page (sorted
  // by updated_at desc) so the most-recently-touched collections show first.
  const collectionsQuery = useCollectionsPaginated({ page: 1, pageSize: PALETTE_LIMIT })
  const addItem = useAddToCollection()
  const createCollection = useCreateCollection()

  const trimmed = query.trim()
  const collections = collectionsQuery.data?.data ?? []
  const exactExists = collections.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())
  const showCreateOption = trimmed.length > 0 && !exactExists

  const close = (): void => {
    setQuery('')
    onOpenChange(false)
  }

  const handleAdd = (collectionId: string, collectionName: string): void => {
    if (!entity) return
    addItem.mutate(
      { collectionId, kind: entity.kind, id: entity.id },
      {
        onSuccess: () => {
          toast.success(`Added to "${collectionName}"`)
          close()
        },
        onError: (err) => toast.error(`Failed to add: ${err.message}`)
      }
    )
  }

  const handleCreate = (): void => {
    if (!entity || trimmed.length === 0) return
    createCollection.mutate(
      { name: trimmed },
      {
        onSuccess: (created) => {
          // Chain the add — the created collection is the natural target.
          addItem.mutate(
            { collectionId: created.id, kind: entity.kind, id: entity.id },
            {
              onSuccess: () => {
                toast.success(`Created "${created.name}" and added`)
                close()
              },
              onError: (err) => toast.error(`Created collection but add failed: ${err.message}`)
            }
          )
        },
        onError: (err) => toast.error(`Failed to create collection: ${err.message}`)
      }
    )
  }

  const busy = addItem.isPending || createCollection.isPending

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add to collection"
      description={`Pick a collection to add ${entity?.title ?? 'this item'} to, or create a new one.`}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search collections, or type a new name…"
      />
      <CommandList>
        {collectionsQuery.isLoading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        )}

        {!collectionsQuery.isLoading && collections.length === 0 && trimmed.length === 0 && (
          <CommandEmpty>No collections yet — type a name to create one.</CommandEmpty>
        )}

        {collections.length > 0 && (
          <CommandGroup heading="Existing">
            {collections.map((c) => (
              <CommandItem
                key={c.id}
                value={`existing-${c.id}-${c.name}`}
                disabled={busy}
                onSelect={() => handleAdd(c.id, c.name)}
              >
                <ListMusic />
                <span className="truncate">{c.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {c.itemCount} {c.itemCount === 1 ? 'item' : 'items'}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {showCreateOption && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Create new">
              <CommandItem value={`__new__${trimmed}`} disabled={busy} onSelect={handleCreate}>
                <Plus />
                <span>Create &ldquo;{trimmed}&rdquo; and add</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
