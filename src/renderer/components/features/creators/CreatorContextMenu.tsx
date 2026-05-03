import { useTranslation } from 'react-i18next'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { Copy, FolderOpen, Trash2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import type { EntityStatus } from '@shared/types'

interface CreatorContextMenuProps {
  creatorId: string
  creatorName: string
  status: EntityStatus
  onDelete: () => void
  onRestore: () => void
  children: React.ReactNode
}

export function CreatorContextMenu({
  creatorId,
  creatorName,
  status,
  onDelete,
  onRestore,
  children
}: CreatorContextMenuProps): React.ReactElement {
  const { t } = useTranslation('common')

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(creatorName)
      toast.success(t('toasts.copied'))
    } catch (err) {
      toast.error(
        t('toasts.copyFailed', {
          message: err instanceof Error ? err.message : String(err)
        })
      )
    }
  }

  const handleOpenFolder = async (): Promise<void> => {
    const result = await window.api.revealCreatorFolder(creatorId)
    if (!result.ok) {
      toast.error(t('toasts.openFolderFailed', { message: result.error ?? '' }))
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => void handleCopy()}>
          <Copy className="mr-2 size-4" />
          {t('actions.copyName')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => void handleOpenFolder()}>
          <FolderOpen className="mr-2 size-4" />
          {t('actions.openFolder')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        {status !== 'deleted' && (
          <ContextMenuItem onClick={onDelete} className="text-destructive">
            <Trash2 className="mr-2 size-4" />
            {t('actions.delete')}
          </ContextMenuItem>
        )}
        {status !== 'active' && (
          <ContextMenuItem onClick={onRestore}>
            <RotateCcw className="mr-2 size-4" />
            {t('actions.restore')}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
