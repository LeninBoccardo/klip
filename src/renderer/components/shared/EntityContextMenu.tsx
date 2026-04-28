import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { Trash2, RotateCcw } from 'lucide-react'
import type { EntityStatus } from '@shared/types'

interface EntityContextMenuProps {
  status: EntityStatus
  onDelete: () => void
  onRestore: () => void
  children: React.ReactNode
}

export function EntityContextMenu({
  status,
  onDelete,
  onRestore,
  children
}: EntityContextMenuProps): React.ReactElement {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
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
