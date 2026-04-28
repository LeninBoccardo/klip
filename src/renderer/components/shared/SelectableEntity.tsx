import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

interface SelectableEntityProps {
  /** When false, behaves like a normal child wrapper (no checkbox, no overlay). */
  selectable: boolean
  selected: boolean
  onToggle: () => void
  children: React.ReactNode
  className?: string
}

/**
 * Wraps a child card (e.g. `MediaCard`) to add a corner checkbox + a
 * "selection-mode" click handler.
 *
 * When `selectable` is true:
 *   - A checkbox renders in the top-left corner with `selected` state.
 *   - Clicking anywhere on the wrapper toggles selection (overrides the
 *     child's onClick navigation).
 *   - A subtle ring is shown on the selected card.
 *
 * When `selectable` is false the child renders untouched — no checkbox, no
 * ring, no click interception. This lets a parent flip selection mode on/off
 * without remounting the grid.
 */
export function SelectableEntity({
  selectable,
  selected,
  onToggle,
  children,
  className
}: SelectableEntityProps): React.ReactElement {
  if (!selectable) {
    return <div className={className}>{children}</div>
  }

  return (
    <div
      className={cn(
        'group relative cursor-pointer rounded-xl ring-2 ring-transparent transition-shadow',
        selected && 'ring-primary',
        className
      )}
      // Capture phase so this fires before the child's own onClick (which is
      // typically a router navigate). Stop propagation so navigation never
      // happens while in selection mode.
      onClickCapture={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle()
      }}
    >
      <div className="absolute left-2 top-2 z-10 rounded-md bg-background/80 p-1 shadow-sm backdrop-blur-sm">
        <Checkbox
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={onToggle}
        />
      </div>
      {/* Pointer-events-none on the inner wrapper to stop hover/click handlers
          on the child from firing — selection-mode owns the input layer. */}
      <div className="pointer-events-none">{children}</div>
    </div>
  )
}
