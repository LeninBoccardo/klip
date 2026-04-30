import { createRootRoute, Outlet, useMatches, Link } from '@tanstack/react-router'
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
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AppSidebar } from '@components/features/layout/AppSidebar'
import { ThemeToggle } from '@components/features/layout/ThemeToggle'
import { BlockingOperationDialog } from '@/components/shared'
import { CommandPalette } from '@/components/features/search/CommandPalette'
import { PersistentPlayer } from '@/components/features/player/PersistentPlayer'
import { PreferencesBootstrap } from '@components/PreferencesBootstrap'
import { usePlaybackSettingMirror } from '@/hooks/use-playback-setting'
import { Button } from '@ui/button'
import { Search } from 'lucide-react'

function GlobalListeners(): React.ReactElement {
  useDbListener()
  useDownloadProgressListener()
  usePlaybackSettingMirror()
  return <UpdaterToastWatcher />
}

/**
 * Returns true while the active focus is in a text-entry surface — used to
 * suppress global single-key shortcuts (`/`) so they don't hijack typing.
 * The Cmd/Ctrl+K shortcut intentionally bypasses this since it's the
 * standard escape hatch from any input.
 */
function isTextInputActive(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

function CommandPaletteController(): React.ReactElement {
  const { t } = useTranslation('navigation')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
      const isSlash = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey

      if (isCmdK) {
        event.preventDefault()
        setOpen((prev) => !prev)
        return
      }
      if (isSlash && !isTextInputActive()) {
        event.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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
const ROUTE_KEYS: Record<string, 'library' | 'collections' | 'downloads' | 'settings' | 'about'> = {
  '/': 'library',
  '/collections': 'collections',
  '/downloads': 'downloads',
  '/settings': 'settings',
  '/about': 'about'
}

function AppBreadcrumb(): React.ReactElement | null {
  const { t } = useTranslation('navigation')
  const matches = useMatches()

  // Build breadcrumb segments from matched routes (skip root)
  const segments = matches
    .filter((m) => m.id !== '__root__')
    .map((m) => {
      const key = ROUTE_KEYS[m.pathname]
      const label = key
        ? t(key)
        : // For dynamic routes like /creators/$creatorId, show the param
          m.pathname.split('/').pop() || ''
      return { path: m.pathname, label }
    })
    .filter((s) => s.label)

  if (segments.length === 0) return null

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segments.map((segment, i) => {
          const isLast = i === segments.length - 1
          return (
            <BreadcrumbItem key={segment.path}>
              {i > 0 && <BreadcrumbSeparator />}
              {isLast ? (
                <BreadcrumbPage>{segment.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={segment.path}>{segment.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
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
        <GlobalListeners />
        <TanStackRouterDevtools />
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
)

export const Route = createRootRoute({ component: RootLayout })
