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
import { Button } from '@ui/button'
import { Separator } from '@ui/separator'
import { queryClient } from '@/lib/query-client'
import { useDbListener } from '@/hooks/use-db-listener'
import { useDownloadProgressListener } from '@/hooks/use-downloads'
import { AppSidebar } from '@components/features/layout/AppSidebar'

function GlobalListeners() {
  useDbListener()
  useDownloadProgressListener()
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

              <Button>Test Button</Button>
            </div>
          </SidebarInset>
        </SidebarProvider>
        <Toaster richColors closeButton />
        <GlobalListeners />
        <TanStackRouterDevtools />
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
)

export const Route = createRootRoute({ component: RootLayout })
