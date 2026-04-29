import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@ui/context-menu'
import { Pencil, Trash2 } from 'lucide-react'

interface CollectionContextMenuProps {
  onEdit: () => void
  onDelete: () => void
  children: React.ReactNode
}

/** Right-click menu for a CollectionCard: edit / delete. */
export function CollectionContextMenu({
  onEdit,
  onDelete,
  children
}: CollectionContextMenuProps): React.ReactElement {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onEdit}>
          <Pencil className="mr-2 size-4" />
          Edit
        </ContextMenuItem>
        <ContextMenuItem onClick={onDelete} className="text-destructive">
          <Trash2 className="mr-2 size-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
