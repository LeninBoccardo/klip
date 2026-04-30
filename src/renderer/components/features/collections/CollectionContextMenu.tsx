import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('common')
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onEdit}>
          <Pencil className="mr-2 size-4" />
          {t('actions.edit')}
        </ContextMenuItem>
        <ContextMenuItem onClick={onDelete} className="text-destructive">
          <Trash2 className="mr-2 size-4" />
          {t('actions.delete')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
