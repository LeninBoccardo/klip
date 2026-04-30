import { Link, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar'
import { LayoutGrid, Download, Settings, Clapperboard, Info, ListMusic } from 'lucide-react'

type NavKey = 'library' | 'collections' | 'downloads' | 'settings' | 'about'

const navItems: ReadonlyArray<{
  key: NavKey
  to: string
  icon: React.ComponentType
}> = [
  { key: 'library', to: '/', icon: LayoutGrid },
  { key: 'collections', to: '/collections', icon: ListMusic },
  { key: 'downloads', to: '/downloads', icon: Download },
  { key: 'settings', to: '/settings', icon: Settings },
  { key: 'about', to: '/about', icon: Info }
]

export function AppSidebar(): React.ReactElement {
  const { t } = useTranslation('navigation')
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <Clapperboard className="size-6 text-primary" />
          <span className="text-lg font-bold tracking-tight">Klip</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('groupLabel')}</SidebarGroupLabel>
          <SidebarMenu>
            {navItems.map((item) => {
              const label = t(item.key)
              const isActive =
                item.to === '/'
                  ? currentPath === '/' || currentPath.startsWith('/creators')
                  : currentPath.startsWith(item.to)

              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
                    <Link to={item.to}>
                      <item.icon />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t px-4 py-3">
        <p className="text-xs text-muted-foreground">{t('version', { version: '0.0.1' })}</p>
      </SidebarFooter>
    </Sidebar>
  )
}
