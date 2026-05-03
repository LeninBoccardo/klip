import { useTranslation } from 'react-i18next'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { Pencil, Trash2, Copy } from 'lucide-react'
import { toast } from 'sonner'

interface TagContextMenuProps {
  tag: string
  onRename: () => void
  onDelete: () => void
  children: React.ReactNode
}

export function TagContextMenu({
  tag,
  onRename,
  onDelete,
  children
}: TagContextMenuProps): React.ReactElement {
  const { t } = useTranslation('common')

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(tag)
      toast.success(t('toasts.copied'))
    } catch (err) {
      toast.error(
        t('toasts.copyFailed', {
          message: err instanceof Error ? err.message : String(err)
        })
      )
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => void handleCopy()}>
          <Copy className="mr-2 size-4" />
          {t('actions.copyTag')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onRename}>
          <Pencil className="mr-2 size-4" />
          {t('actions.rename')}
        </ContextMenuItem>
        <ContextMenuItem onClick={onDelete} className="text-destructive">
          <Trash2 className="mr-2 size-4" />
          {t('actions.delete')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
