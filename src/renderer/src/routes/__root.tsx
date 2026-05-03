import {
  createRootRoute,
  Outlet,
  useMatches,
  useNavigate,
  Link,
  type ErrorComponentProps
} from '@tanstack/react-router'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@ui/empty'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '@ui/tooltip'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@ui/sidebar'
import { Toaster } from '@ui/sonner'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@ui/breadcrumb'
import { Separator } from '@ui/separator'
import { queryClient } from '@/lib/query-client'
import { useDbListener } from '@/hooks/use-db-listener'
import { useDownloadProgressListener } from '@/hooks/use-downloads'
import { useUpdaterStatus, useInstallUpdate } from '@/hooks/use-updater'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AppSidebar } from '@components/features/layout/AppSidebar'
import { ThemeToggle } from '@components/features/layout/ThemeToggle'
import { BlockingOperationDialog } from '@/components/shared'
import { CommandPalette } from '@/components/features/search/CommandPalette'
import { HelpOverlay } from '@/components/features/help/HelpOverlay'
import { OnboardingWizard } from '@/components/features/onboarding/OnboardingWizard'
import { PersistentPlayer } from '@/components/features/player/PersistentPlayer'
import { PreferencesBootstrap } from '@components/PreferencesBootstrap'
import { usePlaybackSettingMirror } from '@/hooks/use-playback-setting'
import { useDropUrl } from '@/hooks/use-drop-url'
import { useShortcut } from '@/hooks/use-shortcut'
import { DropZoneOverlay } from '@/components/features/downloads/DropZoneOverlay'
import { Button } from '@ui/button'
import { Search } from 'lucide-react'

function GlobalListeners(): React.ReactElement {
  useDbListener()
  useDownloadProgressListener()
  usePlaybackSettingMirror()
  return <UpdaterToastWatcher />
}

function GlobalDropZone(): React.ReactElement {
  const active = useDropUrl()
  return <DropZoneOverlay active={active} />
}

function CommandPaletteController(): React.ReactElement {
  const { t } = useTranslation('navigation')
  const [open, setOpen] = useState(false)
  const togglePalette = useCallback(() => setOpen((prev) => !prev), [])
  const openPalette = useCallback(() => setOpen(true), [])

  useShortcut('mod+k', togglePalette)
  useShortcut('/', openPalette)

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="ml-auto gap-2 text-muted-foreground"
        aria-label={t('openSearchPalette')}
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">{t('search')}</span>
        <kbd className="ml-2 hidden rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline">
          Ctrl K
        </kbd>
      </Button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  )
}

function GlobalShortcuts(): React.ReactElement {
  const navigate = useNavigate()
  const [helpOpen, setHelpOpen] = useState(false)

  const goto = useCallback(
    (to: string) => () => {
      navigate({ to })
    },
    [navigate]
  )

  useShortcut('?', () => setHelpOpen((prev) => !prev))
  useShortcut('g h', goto('/'))
  useShortcut('g b', goto('/dashboard'))
  useShortcut('g d', goto('/downloads'))
  useShortcut('g c', goto('/cuts'))
  useShortcut('g t', goto('/tags'))
  useShortcut('g a', goto('/activity'))
  useShortcut('g s', goto('/search'))

  return <HelpOverlay open={helpOpen} onOpenChange={setHelpOpen} />
}

/**
 * Listens for the auto-updater reaching the `ready` state and raises a single
 * sonner toast with a "Restart now" action. Subsequent transitions (e.g.
 * back to `idle` after install) reset the latch so a fresh `ready` event will
 * notify again.
 */
function UpdaterToastWatcher(): null {
  const { t } = useTranslation('settings')
  const { data: status } = useUpdaterStatus()
  const installUpdate = useInstallUpdate()
  const notifiedFor = useRef<string | null>(null)
  // Hold the mutation in a ref so the toast effect doesn't re-run on every render.
  // TanStack Query returns a fresh mutation object each render even though
  // `mutate` is stable, and assigning to a ref must happen inside an effect
  // (not during render) per React's rules-of-refs.
  const installRef = useRef(installUpdate)
  useEffect(() => {
    installRef.current = installUpdate
  })

  useEffect(() => {
    if (!status) return
    if (status.state === 'ready' && status.newVersion) {
      // Avoid re-toasting on every render for the same downloaded version.
      if (notifiedFor.current === status.newVersion) return
      notifiedFor.current = status.newVersion
      toast.message(t('updates.toast.readyTitle', { version: status.newVersion }), {
        description: t('updates.toast.readyDescription'),
        duration: Infinity,
        action: {
          label: t('updates.toast.restartAction'),
          onClick: () => installRef.current.mutate()
        }
      })
    } else if (status.state !== 'ready') {
      notifiedFor.current = null
    }
  }, [status, t])

  return null
}

/**
 * Map route paths to navigation translation keys for breadcrumbs. Add new
 * routes here when introducing top-level pages.
 */
const ROUTE_KEYS: Record<
  string,
  | 'library'
  | 'dashboard'
  | 'cuts'
  | 'tags'
  | 'collections'
  | 'downloads'
  | 'activity'
  | 'settings'
  | 'about'
> = {
  '/': 'library',
  '/dashboard': 'dashboard',
  '/cuts': 'cuts',
  '/tags': 'tags',
  '/collections': 'collections',
  '/downloads': 'downloads',
  '/activity': 'activity',
  '/settings': 'settings',
  '/about': 'about'
}

function AppBreadcrumb(): React.ReactElement | null {
  const { t } = useTranslation('navigation')
  const matches = useMatches()

  // Build breadcrumb segments from matched routes (skip root). useMatches() can
  // return the layout match and the index match for the same pathname (both `/`),
  // so dedupe by pathname — last write wins on the label.
  const segmentsMap = new Map<string, { path: string; label: string }>()
  for (const m of matches) {
    if (m.id === '__root__') continue
    const key = ROUTE_KEYS[m.pathname]
    const label = key ? t(key) : m.pathname.split('/').pop() || ''
    if (!label) continue
    segmentsMap.set(m.pathname, { path: m.pathname, label })
  }
  const segments = [...segmentsMap.values()]

  if (segments.length === 0) return null

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segments.map((segment, i) => {
          const isLast = i === segments.length - 1
          return (
            <Fragment key={segment.path}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{segment.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={segment.path}>{segment.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

const RootLayout = (): React.ReactElement => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="klip-theme">
      <PreferencesBootstrap />
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="flex h-full flex-col overflow-hidden">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <AppBreadcrumb />
              <CommandPaletteController />
              <ThemeToggle />
            </header>
            <div className="flex-1 overflow-hidden">
              <Outlet />
            </div>
          </SidebarInset>
        </SidebarProvider>
        <Toaster richColors closeButton />
        <BlockingOperationDialog />
        <PersistentPlayer />
        <GlobalDropZone />
        <GlobalShortcuts />
        <OnboardingWizard />
        <GlobalListeners />
        <TanStackRouterDevtools />
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
)

/**
 * Renders inside the layout (so the sidebar and command palette stay
 * functional) when a route throws or no match is found. Common copy lives in
 * `common.errors.*`; the link uses the typed router so deep-link clicks land
 * on a known route.
 */
function NotFoundComponent(): React.ReactElement {
  const { t } = useTranslation('common')
  return (
    <Empty className="m-auto">
      <EmptyHeader>
        <EmptyTitle>{t('errors.notFoundTitle')}</EmptyTitle>
        <EmptyDescription>{t('errors.notFoundBody')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link to="/">{t('errors.backHome')}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function ErrorComponent({ error }: ErrorComponentProps): React.ReactElement {
  const { t } = useTranslation('common')
  // Surface the underlying message to console so devs can dig in; we keep
  // the user-facing copy generic to avoid leaking internals into a UI string.
  useEffect(() => {
    console.error('[klip] Route error boundary caught:', error)
  }, [error])
  return (
    <Empty className="m-auto">
      <EmptyHeader>
        <EmptyTitle>{t('errors.unexpectedTitle')}</EmptyTitle>
        <EmptyDescription>{t('errors.unexpectedBody')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link to="/">{t('errors.backHome')}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent
})
