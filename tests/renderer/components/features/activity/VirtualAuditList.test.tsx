import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VirtualAuditList } from '@/components/features/activity/VirtualAuditList'
import type { AuditEntryDto } from '@shared/dtos'

// `Link` from @tanstack/react-router is rendered by the AuditEntryRow children;
// stub it so the list test doesn't need a router context.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>
}))

// Control which slice of items the virtualizer "produces". The component reads
// `getVirtualItems()` and renders only those rows; this lets us prove that the
// windowing layer is the gate, not the parent list mounting every entry.
const visibleIndices = vi.hoisted(() => ({ current: [0] as number[] }))
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 56,
    getVirtualItems: () =>
      visibleIndices.current
        .filter((i) => i < count)
        .map((i) => ({ index: i, start: i * 56, key: i, size: 56 })),
    measureElement: vi.fn()
  })
}))

function makeEntry(id: number): AuditEntryDto {
  return {
    id,
    entityType: 'video',
    entityId: `v-${id}`,
    action: 'created',
    changes: null,
    createdAt: new Date(Date.now() - id * 1_000).toISOString()
  }
}

beforeEach(() => {
  visibleIndices.current = [0]
})

describe('VirtualAuditList', () => {
  it('renders nothing when entries is empty', () => {
    const { container } = render(<VirtualAuditList entries={[]} />)
    // The wrapper UL still renders; just no rows inside.
    expect(container.querySelectorAll('li').length).toBe(0)
  })

  it('mounts only the rows the virtualizer reports as visible (windowing engaged)', () => {
    const entries = Array.from({ length: 50 }, (_, i) => makeEntry(i))
    visibleIndices.current = [0, 1, 2]

    render(<VirtualAuditList entries={entries} />)

    // Three rows mounted; the other 47 are not in the DOM.
    expect(screen.getByText('v-0')).toBeInTheDocument()
    expect(screen.getByText('v-1')).toBeInTheDocument()
    expect(screen.getByText('v-2')).toBeInTheDocument()
    expect(screen.queryByText('v-3')).not.toBeInTheDocument()
    expect(screen.queryByText('v-49')).not.toBeInTheDocument()
  })

  it('uses the virtual row offset to position each li (translateY)', () => {
    const entries = [makeEntry(0), makeEntry(1)]
    visibleIndices.current = [0, 1]

    const { container } = render(<VirtualAuditList entries={entries} />)
    const items = container.querySelectorAll<HTMLLIElement>('li[data-index]')

    expect(items.length).toBe(2)
    expect(items[0].style.transform).toBe('translateY(0px)')
    expect(items[1].style.transform).toBe('translateY(56px)')
    expect(items[0].getAttribute('data-index')).toBe('0')
    expect(items[1].getAttribute('data-index')).toBe('1')
  })

  it('sets the wrapper height from getTotalSize so the scroll surface knows the full extent', () => {
    const entries = Array.from({ length: 100 }, (_, i) => makeEntry(i))
    visibleIndices.current = [0]

    const { container } = render(<VirtualAuditList entries={entries} />)
    const ul = container.querySelector<HTMLUListElement>('ul')

    expect(ul?.style.height).toBe(`${100 * 56}px`)
  })

  it('sets aria-live="polite" on the rendered list so screen readers announce additions', () => {
    visibleIndices.current = [0]
    const { container } = render(<VirtualAuditList entries={[makeEntry(0)]} />)

    const ul = container.querySelector('ul')
    expect(ul).toHaveAttribute('aria-live', 'polite')
    expect(ul).toHaveAttribute('aria-relevant', 'additions')
  })
})
