import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { AuditEntryRow } from './AuditEntryRow'
import type { AuditEntryDto } from '@shared/dtos'

interface VirtualAuditListProps {
  entries: readonly AuditEntryDto[]
}

/**
 * Windowed renderer for the activity feed. The Activity page caps at 1000
 * entries per pass; the previous plain `entries.map(...)` mounted every row
 * up-front, which dropped scroll performance to a crawl past ~500 entries.
 *
 * Uses @tanstack/react-virtual against a scrollable parent ref. `estimateSize`
 * is a static guess (rows are uniform); the virtualizer measures actual
 * heights on first render and updates the estimate via `measureElement`.
 */
export function VirtualAuditList({ entries }: VirtualAuditListProps): React.ReactElement {
  const scrollParentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollParentRef.current,
    // 56px is a measured baseline for a 2-line entry; rows that exceed this
    // are auto-corrected via measureElement on first render.
    estimateSize: () => 56,
    overscan: 8
  })

  const items = virtualizer.getVirtualItems()

  return (
    <div ref={scrollParentRef} className="max-h-[calc(100vh-280px)] overflow-y-auto">
      <ul
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {items.map((virtualRow) => {
          const entry = entries[virtualRow.index]
          return (
            <li
              key={entry.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full pb-2"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <AuditEntryRow entry={entry} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
