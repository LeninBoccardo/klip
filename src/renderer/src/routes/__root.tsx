import { createRootRoute, Outlet, useMatches, Link } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@components/theme-provider'
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
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { AppSidebar } from '@components/features/layout/AppSidebar'
import { BlockingOperationDialog } from '@/components/shared'

function GlobalListeners() {
  useDbListener()
  useDownloadProgressListener()
  return <UpdaterToastWatcher />
}

/**
 * Listens for the auto-updater reaching the `ready` state and raises a single
 * sonner toast with a "Restart now" action. Subsequent transitions (e.g.
 * back to `idle` after install) reset the latch so a fresh `ready` event will
 * notify again.
 */
function UpdaterToastWatcher() {
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
      toast.message(`Update v${status.newVersion} ready`, {
        description: 'Restart Klip now to install, or it will install on next quit.',
        duration: Infinity,
        action: {
          label: 'Restart now',
          onClick: () => installRef.current.mutate()
        }
      })
    } else if (status.state !== 'ready') {
      notifiedFor.current = null
    }
  }, [status])

  return null
}

/** Map route paths to display labels for breadcrumbs */
const routeLabels: Record<string, string> = {
  '/': 'Library',
  '/downloads': 'Downloads',
  '/settings': 'Settings',
  '/about': 'About'
}

function AppBreadcrumb() {
  const matches = useMatches()

  // Build breadcrumb segments from matched routes (skip root)
  const segments = matches
    .filter((m) => m.id !== '__root__')
    .map((m) => ({
      path: m.pathname,
      label:
        routeLabels[m.pathname] ||
        // For dynamic routes like /creators/$creatorId, show the param
        m.pathname.split('/').pop() ||
        ''
    }))
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

const RootLayout = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="flex h-full flex-col overflow-hidden">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <AppBreadcrumb />
            </header>
            <div className="flex-1 overflow-hidden">
              <Outlet />
            </div>
          </SidebarInset>
        </SidebarProvider>
        <Toaster richColors closeButton />
        <BlockingOperationDialog />
        <GlobalListeners />
        <TanStackRouterDevtools />
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
)

export const Route = createRootRoute({ component: RootLayout })
