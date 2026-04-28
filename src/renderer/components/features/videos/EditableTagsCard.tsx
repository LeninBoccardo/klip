import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@ui/card'
import { Badge } from '@ui/badge'
import { Button } from '@ui/button'
import { TagInput } from '@/components/shared'
import { useAllDistinctTags, useBulkUpdateTags } from '@/hooks/use-tags'
import { Pencil, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { TagEntityKind } from '@shared/types'

interface EditableTagsCardProps {
  entityKind: TagEntityKind
  entityId: string
  /** The currently-saved tag list (from the entity DTO). */
  tags: string[]
  /** Optional badges rendered alongside user tags in read-only mode (e.g. "Short", category). */
  readOnlyExtras?: React.ReactNode
}

/**
 * Tags card that toggles between read-only badges and an editable `TagInput`.
 *
 * Edit flow:
 *   1. Click the pencil icon → enters edit mode, draft seeded from saved tags.
 *   2. Add/remove chips on the draft (no mutation fires per chip).
 *   3. Click the check button → diffs draft vs. saved, fires a single
 *      `bulkUpdateTags` with `addTags` + `removeTags`. The success path
 *      shows a toast and exits edit mode; the failure path keeps the draft
 *      so the user can retry without losing their work.
 *
 * Suggestions come from `useAllDistinctTags()` (cross-table aggregation),
 * filtered by the consumer's entity kind so the autocomplete reflects the
 * pool the user is most likely to mean.
 */
export function EditableTagsCard({
  entityKind,
  entityId,
  tags,
  readOnlyExtras
}: EditableTagsCardProps): React.ReactElement {
  // `draft` is only meaningful while editing. When not editing it stays at
  // its last value but the read-only path renders `tags` directly, so a
  // stale draft never reaches the DOM. Seeding happens at the click that
  // enters edit mode (avoids a setState-in-effect rule violation).
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>(tags)
  const allTags = useAllDistinctTags()
  const bulkUpdate = useBulkUpdateTags()

  const suggestions = useMemo(() => {
    const data = allTags.data ?? []
    return entityKind === 'video'
      ? data.filter((t) => t.videoCount > 0).map((t) => t.tag)
      : data.filter((t) => t.cutCount > 0).map((t) => t.tag)
  }, [allTags.data, entityKind])

  const handleSave = (): void => {
    const before = new Set(tags)
    const after = new Set(draft)
    const addTags = draft.filter((t) => !before.has(t))
    const removeTags = tags.filter((t) => !after.has(t))

    if (addTags.length === 0 && removeTags.length === 0) {
      setEditing(false)
      return
    }

    bulkUpdate.mutate(
      {
        entityKind,
        ids: [entityId],
        ...(addTags.length > 0 ? { addTags } : {}),
        ...(removeTags.length > 0 ? { removeTags } : {})
      },
      {
        onSuccess: () => {
          toast.success('Tags updated')
          setEditing(false)
        },
        onError: (err) => toast.error(`Failed to update tags: ${err.message}`)
      }
    )
  }

  const handleCancel = (): void => {
    setDraft(tags)
    setEditing(false)
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Tags</CardTitle>
        {editing ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={bulkUpdate.isPending}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={bulkUpdate.isPending}>
              {bulkUpdate.isPending ? (
                <Loader2 className="mr-2 size-3 animate-spin" />
              ) : (
                <Check className="mr-2 size-3" />
              )}
              Save
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(tags)
              setEditing(true)
            }}
            aria-label="Edit tags"
          >
            <Pencil className="size-3" />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <TagInput
            value={draft}
            onChange={setDraft}
            suggestions={suggestions}
            disabled={bulkUpdate.isPending}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {readOnlyExtras}
            {tags.length === 0 && !readOnlyExtras ? (
              <p className="text-sm text-muted-foreground">No tags yet.</p>
            ) : (
              tags.map((t) => (
                <Badge key={t} variant="outline">
                  {t}
                </Badge>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
