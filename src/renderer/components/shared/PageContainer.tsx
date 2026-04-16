import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface PageContainerProps {
  children: React.ReactNode
  className?: string
}

/**
 * Top-level page wrapper used by every route.
 *
 * Layout chain: html(h-full) → body(h-full) → #root(h-full flex-col)
 *   → SidebarProvider(min-h-svh) → SidebarInset(flex-col h-full)
 *   → header(shrink-0) + div(flex-1 overflow-hidden)
 *   → **PageContainer**(h-full → ScrollArea → constrained content)
 *
 * Provides:
 * - Full-height scroll via shadcn ScrollArea (custom scrollbar)
 * - Max-width constrained content area (max-w-6xl)
 * - Consistent padding (p-6) and vertical spacing (space-y-6)
 */
export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <ScrollArea className="h-full">
      <div className={cn('mx-auto w-full max-w-6xl space-y-6 p-6', className)}>{children}</div>
    </ScrollArea>
  )
}
