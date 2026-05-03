import { useTranslation } from 'react-i18next'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { Trash2, RotateCcw, ListPlus, Copy, Link2, ExternalLink, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
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
  /** When provided, surfaces a "Copy title" action that writes to the clipboard. */
  title?: string
  /**
   * When provided, surfaces "Copy link" and "Open on YouTube" actions. The
   * URL is host-allowlisted (youtube.com / youtu.be) by the main-process
   * shell controller; renderer-supplied URLs from any other host are denied.
   */
  youtubeUrl?: string
  /**
   * When provided, surfaces a "Reveal in folder" action. The renderer never
   * holds raw filesystem paths — the controller resolves the (kind, id)
   * reference through `IResolveMediaUrl` server-side and shows the canonical
   * path.
   */
  reveal?: { kind: 'video' | 'cut'; id: string }
  children: React.ReactNode
}

export function EntityContextMenu({
  status,
  onDelete,
  onRestore,
  onAddToCollection,
  title,
  youtubeUrl,
  reveal,
  children
}: EntityContextMenuProps): React.ReactElement {
  const { t } = useTranslation('common')
  const { t: tcol } = useTranslation('collections')

  const handleCopy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('toasts.copied'))
    } catch (err) {
      toast.error(
        t('toasts.copyFailed', {
          message: err instanceof Error ? err.message : String(err)
        })
      )
    }
  }

  const handleReveal = async (kind: 'video' | 'cut', id: string): Promise<void> => {
    const result = await window.api.revealEntityInFolder(kind, id)
    if (!result.ok) {
      toast.error(t('toasts.revealFailed', { message: result.error ?? '' }))
    }
  }

  const handleOpenExternal = async (url: string): Promise<void> => {
    const result = await window.api.openExternalUrl(url)
    if (!result.ok) {
      toast.error(t('toasts.openExternalFailed', { message: result.error ?? '' }))
    }
  }

  const hasInfoActions = !!title || !!youtubeUrl || !!reveal
  const showAddToCollection = onAddToCollection && status === 'active'
  const showDelete = status !== 'deleted'
  const showRestore = status !== 'active'

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {title && (
          <ContextMenuItem onClick={() => void handleCopy(title)}>
            <Copy className="mr-2 size-4" />
            {t('actions.copyTitle')}
          </ContextMenuItem>
        )}
        {youtubeUrl && (
          <ContextMenuItem onClick={() => void handleCopy(youtubeUrl)}>
            <Link2 className="mr-2 size-4" />
            {t('actions.copyLink')}
          </ContextMenuItem>
        )}
        {youtubeUrl && (
          <ContextMenuItem onClick={() => void handleOpenExternal(youtubeUrl)}>
            <ExternalLink className="mr-2 size-4" />
            {t('actions.openOnYoutube')}
          </ContextMenuItem>
        )}
        {reveal && (
          <ContextMenuItem onClick={() => void handleReveal(reveal.kind, reveal.id)}>
            <FolderOpen className="mr-2 size-4" />
            {t('actions.revealInFolder')}
          </ContextMenuItem>
        )}
        {hasInfoActions && (showAddToCollection || showDelete || showRestore) && (
          <ContextMenuSeparator />
        )}
        {showAddToCollection && (
          <>
            <ContextMenuItem onClick={onAddToCollection}>
              <ListPlus className="mr-2 size-4" />
              {tcol('addToCollection.title')}…
            </ContextMenuItem>
            {(showDelete || showRestore) && <ContextMenuSeparator />}
          </>
        )}
        {showDelete && (
          <ContextMenuItem onClick={onDelete} className="text-destructive">
            <Trash2 className="mr-2 size-4" />
            {t('actions.delete')}
          </ContextMenuItem>
        )}
        {showRestore && (
          <ContextMenuItem onClick={onRestore}>
            <RotateCcw className="mr-2 size-4" />
            {t('actions.restore')}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
