import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface PageContainerProps {
  children: React.ReactNode
  className?: string
}

/**
 * Top-level page wrapper used by every route.
 *
 * Layout chain (top → bottom):
 *   body(padding-top: --titlebar-height)
 *   → SidebarProvider wrapper [data-slot=sidebar-wrapper]
 *      (height: calc(100svh - --titlebar-height), overflow:hidden;
 *       see main.css — sized explicitly so SidebarInset's flex-1 works)
 *   → SidebarInset (relative flex flex-1 flex-col, primitive default)
 *      ⤷ header (h-12, shrink-0)
 *      ⤷ #main-content div (flex-1 overflow-hidden) — outlet target
 *         ⤷ **PageContainer** (h-full → ScrollArea → constrained content)
 *
 * Provides:
 * - Full-height scroll via shadcn ScrollArea (custom scrollbar)
 * - Max-width constrained content area (max-w-6xl)
 * - Consistent padding (p-6) and vertical spacing (space-y-6)
 *
 * Invariant: the sidebar-wrapper height rule in main.css is what makes
 * `h-full` here resolve to a real pixel value. If you ever remove that
 * rule, every page collapses to zero height. (Was previously patched
 * via a className on SidebarInset; centralised in main.css for clarity.)
 */
export function PageContainer({ children, className }: PageContainerProps): React.ReactElement {
  return (
    <ScrollArea className="h-full">
      <div className={cn('mx-auto w-full max-w-6xl space-y-6 p-6', className)}>{children}</div>
    </ScrollArea>
  )
}
