import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const gridVariants = cva('grid w-full gap-4', {
  variants: {
    columns: {
      /** 1 → 2 → 3 → 4 columns (good for cards with thumbnails) */
      media: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
      /** 1 → 2 → 3 columns (wider cards, e.g. creator cards) */
      wide: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      /** 1 → 2 columns (forms, settings panels) */
      two: 'grid-cols-1 md:grid-cols-2'
    }
  },
  defaultVariants: {
    columns: 'media'
  }
})

interface ResponsiveGridProps
  extends React.ComponentProps<'div'>, VariantProps<typeof gridVariants> {}

/**
 * Shared responsive CSS-grid wrapper.
 * Use the `columns` variant to pick a density preset.
 */
export function ResponsiveGrid({ className, columns, children, ...props }: ResponsiveGridProps) {
  return (
    <div className={cn(gridVariants({ columns }), className)} {...props}>
      {children}
    </div>
  )
}
