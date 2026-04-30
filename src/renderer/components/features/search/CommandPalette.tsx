import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut
} from '@ui/command'
import { Badge } from '@ui/badge'
import { useSearchAll } from '@/hooks/use-search'
import {
  useRecentEntities,
  type RecentEntity,
  type RecentEntityKind
} from '@/hooks/use-recent-entities'
import { toast } from 'sonner'
import { User, Film, Scissors, Tag, Loader2, Clock } from 'lucide-react'

/**
 * Global command palette for cross-entity search (Cmd/Ctrl+K, `/`).
 *
 * Empty state shows up to 5 recently-opened entities pulled from
 * localStorage — `useRecentEntities` lives outside this component so
 * navigation handlers anywhere can call `addRecent` to push entries.
 *
 * The palette itself is purely presentational: search results come from
 * `useSearchAll` (200ms debounced). Cuts route to their parent creator
 * detail page since cuts don't have a dedicated route yet; tags emit a
 * "filter coming soon" toast (a tag-filtered grid lands with collections
 * in step 2.D).
 */
export function CommandPalette({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
}): React.ReactElement {
  const { t } = useTranslation('search')
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const search = useSearchAll(query)
  const { recents, addRecent } = useRecentEntities()

  // Reset the input when the palette closes so reopening starts fresh.
  // Defer one render so the close animation doesn't re-render the list.
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setQuery(''), 150)
      return () => clearTimeout(t)
    }
    return undefined
  }, [open])

  const close = (): void => onOpenChange(false)

  const handleCreatorSelect = (id: string, label: string): void => {
    addRecent({ kind: 'creator', id, label })
    navigate({ to: '/creators/$creatorId', params: { creatorId: id } })
    close()
  }

  const handleVideoSelect = (id: string, label: string): void => {
    addRecent({ kind: 'video', id, label })
    navigate({ to: '/videos/$videoId', params: { videoId: id } })
    close()
  }

  const handleCutSelect = (id: string, label: string, creatorId: string): void => {
    addRecent({ kind: 'cut', id, label, creatorId })
    // Cuts live inside creator detail (no /cuts/$cutId route yet); routing to
    // the parent gets the user to the right grid. Once the cut detail route
    // exists this jumps direct.
    navigate({ to: '/creators/$creatorId', params: { creatorId } })
    close()
  }

  const handleRecentSelect = (recent: RecentEntity): void => {
    if (recent.kind === 'creator') handleCreatorSelect(recent.id, recent.label)
    else if (recent.kind === 'video') handleVideoSelect(recent.id, recent.label)
    else if (recent.kind === 'cut' && recent.creatorId)
      handleCutSelect(recent.id, recent.label, recent.creatorId)
  }

  const handleTagSelect = (tag: string): void => {
    toast.info(t('tagFilterToast', { tag }))
    close()
  }

  const trimmed = query.trim()
  const showRecents = trimmed.length === 0
  const isLoading = !showRecents && search.isFetching
  const data = search.data

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      description={t('description')}
    >
      {/* `shouldFilter={false}` — the server-side query already filtered, and
          cmdk's fuzzy reranker would otherwise discard partial matches the
          user expects to see (e.g. case-insensitive substring hits). */}
      <CommandInput value={query} onValueChange={setQuery} placeholder={t('placeholder')} />
      <CommandList>
        {showRecents && recents.length === 0 && <CommandEmpty>{t('empty.initial')}</CommandEmpty>}

        {showRecents && recents.length > 0 && (
          <CommandGroup heading={t('groups.recent')}>
            {recents.map((r) => (
              <CommandItem
                key={`${r.kind}:${r.id}`}
                value={`recent-${r.kind}-${r.id}`}
                onSelect={() => handleRecentSelect(r)}
              >
                <RecentIcon kind={r.kind} />
                <span className="truncate">{r.label}</span>
                <CommandShortcut className="capitalize">{t(`kinds.${r.kind}`)}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!showRecents && isLoading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t('loading')}
          </div>
        )}

        {!showRecents && !isLoading && search.isError && (
          <CommandEmpty>{t('empty.error')}</CommandEmpty>
        )}

        {!showRecents && !isLoading && data && isEmpty(data) && (
          <CommandEmpty>{t('empty.noResults', { query: trimmed })}</CommandEmpty>
        )}

        {!showRecents && data && data.creators.length > 0 && (
          <CommandGroup heading={t('groups.creators')}>
            {data.creators.map((c) => (
              <CommandItem
                key={`creator:${c.id}`}
                value={`creator-${c.id}-${c.name}`}
                onSelect={() => handleCreatorSelect(c.id, c.name)}
              >
                <User />
                <span className="truncate">{c.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!showRecents && data && data.videos.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('groups.videos')}>
              {data.videos.map((v) => (
                <CommandItem
                  key={`video:${v.id}`}
                  value={`video-${v.id}-${v.title}`}
                  onSelect={() => handleVideoSelect(v.id, v.title)}
                >
                  <Film />
                  <span className="truncate">{v.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {!showRecents && data && data.cuts.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('groups.cuts')}>
              {data.cuts.map((cut) => (
                <CommandItem
                  key={`cut:${cut.id}`}
                  value={`cut-${cut.id}-${cut.title}`}
                  onSelect={() => handleCutSelect(cut.id, cut.title, cut.creatorId)}
                >
                  <Scissors />
                  <span className="truncate">{cut.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {!showRecents && data && data.tags.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('groups.tags')}>
              {data.tags.map((tag) => (
                <CommandItem
                  key={`tag:${tag.tag}`}
                  value={`tag-${tag.tag}`}
                  onSelect={() => handleTagSelect(tag.tag)}
                >
                  <Tag />
                  <span className="truncate">{tag.tag}</span>
                  <CommandShortcut>
                    <Badge variant="outline" className="ml-2 font-normal">
                      {tag.videoCount + tag.cutCount}
                    </Badge>
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}

function RecentIcon({ kind }: { kind: RecentEntityKind }): React.ReactElement {
  if (kind === 'creator') return <User />
  if (kind === 'video') return <Film />
  if (kind === 'cut') return <Scissors />
  return <Clock />
}

function isEmpty(data: {
  creators: unknown[]
  videos: unknown[]
  cuts: unknown[]
  tags: unknown[]
}): boolean {
  return (
    data.creators.length === 0 &&
    data.videos.length === 0 &&
    data.cuts.length === 0 &&
    data.tags.length === 0
  )
}
