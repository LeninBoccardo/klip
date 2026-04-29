import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { Trash2, RotateCcw, ListPlus } from 'lucide-react'
import type { EntityStatus } from '@shared/types'

interface EntityContextMenuProps {
  status: EntityStatus
  onDelete: () => void
  onRestore: () => void
  /**
   * Optional handler that opens the "Add to collection" dialog. The menu
   * item only renders when this callback is provided so callers that don't
   * want the action (e.g. the audit log view) get the original two-item menu.
   */
  onAddToCollection?: () => void
  children: React.ReactNode
}

export function EntityContextMenu({
  status,
  onDelete,
  onRestore,
  onAddToCollection,
  children
}: EntityContextMenuProps): React.ReactElement {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {onAddToCollection && status === 'active' && (
          <>
            <ContextMenuItem onClick={onAddToCollection}>
              <ListPlus className="mr-2 size-4" />
              Add to collection…
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        {status !== 'deleted' && (
          <ContextMenuItem onClick={onDelete} className="text-destructive">
            <Trash2 className="mr-2 size-4" />
            Delete
          </ContextMenuItem>
        )}
        {status !== 'active' && (
          <ContextMenuItem onClick={onRestore}>
            <RotateCcw className="mr-2 size-4" />
            Restore
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
