import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ui/dialog'
import { Input } from '@ui/input'
import { Textarea } from '@ui/textarea'
import { Label } from '@ui/label'
import { Button } from '@ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@ui/avatar'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useFetchChannelInfo, useRegisterCreator } from '@/hooks/use-creators'
import { formatCount } from '@/lib/format'
import { slugify } from '@shared/slugify'
import type { ChannelInfo } from '@shared/types'

interface RegisterCreatorDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  /** Called with the new creator's id on success. */
  onCreated?: (creatorId: string) => void
  /** Called when the user wants to view an already-registered creator. */
  onOpenExisting?: (creatorId: string) => void
}

/**
 * Two-phase dialog: paste URL → fetch preview → edit overrides → save. The
 * inner form is keyed on `open` so each new opening starts with empty state.
 */
export function RegisterCreatorDialog({
  open,
  onOpenChange,
  onCreated,
  onOpenExisting
}: RegisterCreatorDialogProps): React.ReactElement {
  const { t } = useTranslation('creators')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('register.title')}</DialogTitle>
          <DialogDescription>{t('register.description')}</DialogDescription>
        </DialogHeader>
        {open && (
          <RegisterForm
            onClose={() => onOpenChange(false)}
            onCreated={(id) => {
              onOpenChange(false)
              onCreated?.(id)
            }}
            onOpenExisting={(id) => {
              onOpenChange(false)
              onOpenExisting?.(id)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function RegisterForm({
  onClose,
  onCreated,
  onOpenExisting
}: {
  onClose: () => void
  onCreated: (creatorId: string) => void
  onOpenExisting: (creatorId: string) => void
}): React.ReactElement {
  const { t } = useTranslation('creators')
  const { t: tc } = useTranslation('common')

  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<ChannelInfo | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [folderName, setFolderName] = useState('')
  const [notes, setNotes] = useState('')
  const [tagsInput, setTagsInput] = useState('')

  const fetchInfo = useFetchChannelInfo()
  const register = useRegisterCreator()

  const trimmedUrl = url.trim()
  const canFetch = trimmedUrl.length > 0 && !fetchInfo.isPending

  const handleFetch = (event: React.FormEvent): void => {
    event.preventDefault()
    if (!canFetch) return
    fetchInfo.mutate(trimmedUrl, {
      onSuccess: (result) => {
        setPreview(result.channelInfo)
        setDisplayName(result.channelInfo.channelName)
        setFolderName(slugify(result.channelInfo.channelName))
      },
      onError: (err) => toast.error(t('register.errors.fetchFailed', { message: err.message }))
    })
  }

  const trimmedName = displayName.trim()
  const trimmedFolder = folderName.trim()
  const canSubmit =
    !!preview && trimmedName.length > 0 && trimmedFolder.length > 0 && !register.isPending

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault()
    if (!canSubmit || !preview) return
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
    register.mutate(
      {
        channelInfo: preview,
        displayName: trimmedName,
        folderName: trimmedFolder,
        notes: notes.trim() || null,
        tags
      },
      {
        onSuccess: (result) => {
          toast.success(t('register.savedToast', { name: trimmedName }))
          onCreated(result.creatorId)
        },
        onError: (err) => handleSaveError(err)
      }
    )
  }

  const handleSaveError = (err: Error): void => {
    const [code, payload] = err.message.split(':', 2)
    switch (code) {
      case 'CREATOR_ALREADY_REGISTERED':
        toast.error(t('register.errors.alreadyRegistered'), {
          action: payload
            ? {
                label: t('register.errors.alreadyRegisteredAction'),
                onClick: () => onOpenExisting(payload)
              }
            : undefined
        })
        return
      case 'FOLDER_NAME_TAKEN':
        toast.error(t('register.errors.folderTaken', { folderName: payload }))
        return
      case 'INVALID_FOLDER_NAME':
        toast.error(t('register.errors.invalidFolder'))
        return
      case 'EMPTY_DISPLAY_NAME':
        toast.error(t('register.errors.emptyDisplayName'))
        return
      default:
        toast.error(t('register.errors.saveFailed', { message: err.message }))
    }
  }

  if (!preview) {
    return (
      <form onSubmit={handleFetch} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="register-url">{t('register.urlLabel')}</Label>
          <Input
            id="register-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('register.urlPlaceholder')}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" disabled={!canFetch}>
            {fetchInfo.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {fetchInfo.isPending ? t('register.fetchingButton') : t('register.fetchButton')}
          </Button>
        </DialogFooter>
      </form>
    )
  }

  const initials = preview.channelName
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
        <Avatar className="size-12">
          <AvatarImage src={preview.avatarUrl ?? undefined} alt={preview.channelName} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{preview.channelName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {t('register.previewSubscribers', { count: formatCount(preview.subscriberCount) })}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-name">{t('register.nameLabel')}</Label>
        <Input
          id="register-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={200}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-folder">{t('register.folderLabel')}</Label>
        <Input
          id="register-folder"
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
          maxLength={200}
        />
        <p className="text-xs text-muted-foreground">{t('register.folderHelp')}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-notes">{t('register.notesLabel')}</Label>
        <Textarea
          id="register-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('register.notesPlaceholder')}
          maxLength={5000}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-tags">{t('register.tagsLabel')}</Label>
        <Input
          id="register-tags"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder={t('register.tagsPlaceholder')}
        />
        <p className="text-xs text-muted-foreground">{t('register.tagsHelp')}</p>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {tc('actions.cancel')}
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {register.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          {register.isPending ? t('register.savingButton') : t('register.saveButton')}
        </Button>
      </DialogFooter>
    </form>
  )
}
