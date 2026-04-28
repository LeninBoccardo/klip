import { useState } from 'react'
import { Card, CardContent } from '@ui/card'
import { Button } from '@ui/button'
import { Badge } from '@ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ui/dialog'
import { TagInput } from '@/components/shared/TagInput'
import { useAllDistinctTags, useBulkUpdateTags } from '@/hooks/use-tags'
import { Loader2, Tag, TagsIcon, X } from 'lucide-react'
import { toast } from 'sonner'
import type { TagEntityKind } from '@shared/types'

interface BulkActionsBarProps {
  entityKind: TagEntityKind
  selectedIds: string[]
  onClear: () => void
  /** Called with the same `entityKind` after a successful mutation. */
  onMutationSuccess?: () => void
}

type DialogMode = 'add' | 'remove' | null

/**
 * Floating action bar shown at the top of a grid when ≥1 entity is selected.
 *
 * Renders a count + the available bulk actions ("Add tag…", "Remove tag…",
 * "Clear"). Opens a small dialog with a `TagInput` to gather the tag set,
 * then dispatches a single `bulkUpdateTags` mutation. The dialog stays open
 * during the mutation; the toast is the success/failure signal.
 */
export function BulkActionsBar({
  entityKind,
  selectedIds,
  onClear,
  onMutationSuccess
}: BulkActionsBarProps): React.ReactElement {
  const [mode, setMode] = useState<DialogMode>(null)
  const [draft, setDraft] = useState<string[]>([])
  const allTags = useAllDistinctTags()
  const bulkUpdate = useBulkUpdateTags()

  const suggestions = (allTags.data ?? [])
    .filter((t) => (entityKind === 'video' ? t.videoCount > 0 : t.cutCount > 0))
    .map((t) => t.tag)

  const closeDialog = (): void => {
    setMode(null)
    setDraft([])
  }

  const handleApply = (): void => {
    if (draft.length === 0) return
    const request =
      mode === 'add'
        ? { entityKind, ids: selectedIds, addTags: draft }
        : { entityKind, ids: selectedIds, removeTags: draft }

    bulkUpdate.mutate(request, {
      onSuccess: (result) => {
        toast.success(
          `Tags ${mode === 'add' ? 'added to' : 'removed from'} ${result.updated} ` +
            `${entityKind === 'video' ? 'video' : 'cut'}${result.updated === 1 ? '' : 's'}`
        )
        closeDialog()
        onClear()
        onMutationSuccess?.()
      },
      onError: (err) => toast.error(`Bulk update failed: ${err.message}`)
    })
  }

  return (
    <>
      <Card className="sticky top-2 z-10 border-primary/40 bg-primary/5 shadow-md">
        <CardContent className="flex flex-wrap items-center gap-3 py-2">
          <Badge variant="secondary" className="gap-1">
            <TagsIcon className="size-3" />
            {selectedIds.length} selected
          </Badge>
          <Button size="sm" variant="outline" onClick={() => setMode('add')}>
            <Tag className="mr-2 size-3" />
            Add tag…
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode('remove')}>
            <Tag className="mr-2 size-3" />
            Remove tag…
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear} className="ml-auto">
            <X className="mr-2 size-3" />
            Clear
          </Button>
        </CardContent>
      </Card>

      <Dialog open={mode !== null} onOpenChange={(open) => (open ? null : closeDialog())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mode === 'add' ? 'Add tags' : 'Remove tags'} from {selectedIds.length} selected
            </DialogTitle>
            <DialogDescription>
              {mode === 'add'
                ? 'Type to add new or existing tags. Each one will be appended to every selected entity.'
                : 'Pick existing tags to remove. Entities that don’t carry the tag are unaffected.'}
            </DialogDescription>
          </DialogHeader>
          <TagInput
            value={draft}
            onChange={setDraft}
            suggestions={suggestions}
            disabled={bulkUpdate.isPending}
            placeholder={mode === 'add' ? 'Add tag…' : 'Remove tag…'}
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={bulkUpdate.isPending}>
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={bulkUpdate.isPending || draft.length === 0}>
              {bulkUpdate.isPending && <Loader2 className="mr-2 size-3 animate-spin" />}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
