import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '@renderer/i18n'
import { AuditEntryRow } from '@/components/features/activity/AuditEntryRow'
import type { AuditEntryDto } from '@shared/dtos'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    className
  }: {
    to: string
    children: React.ReactNode
    className?: string
  }) => (
    <a href={to} className={className} data-testid="router-link">
      {children}
    </a>
  )
}))

const tActivity = (key: string): string => i18n.t(key, { ns: 'activity' })

function makeEntry(overrides: Partial<AuditEntryDto> = {}): AuditEntryDto {
  return {
    id: 1,
    entityType: 'video',
    entityId: 'v-1',
    action: 'created',
    changes: null,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    ...overrides
  }
}

describe('AuditEntryRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['creator', 'creator-1', '/creators/creator-1'],
    ['video', 'video-1', '/videos/video-1'],
    ['collection', 'col-1', '/collections/col-1']
  ])(
    'renders %s entity with translated kind label and a Link to the detail route',
    (kind, id, href) => {
      render(<AuditEntryRow entry={makeEntry({ entityType: kind, entityId: id })} />)

      expect(screen.getByText(tActivity(`entity.${kind}`))).toBeInTheDocument()
      expect(screen.getByText(id)).toBeInTheDocument()
      const link = screen.getByTestId('router-link')
      expect(link).toHaveAttribute('href', href)
    }
  )

  it('renders cut entity with a Link to the /cuts page (cuts have no detail route yet)', () => {
    render(<AuditEntryRow entry={makeEntry({ entityType: 'cut', entityId: 'cut-1' })} />)

    expect(screen.getByText(tActivity('entity.cut'))).toBeInTheDocument()
    expect(screen.getByTestId('router-link')).toHaveAttribute('href', '/cuts')
  })

  it('renders unknown entity types as the "Item" label without a Link', () => {
    render(<AuditEntryRow entry={makeEntry({ entityType: 'mystery', entityId: 'm-1' })} />)

    expect(screen.getByText(tActivity('entity.unknown'))).toBeInTheDocument()
    expect(screen.getByText('m-1')).toBeInTheDocument()
    expect(screen.queryByTestId('router-link')).not.toBeInTheDocument()
  })

  it('renders the translated action label for known actions', () => {
    render(<AuditEntryRow entry={makeEntry({ action: 'item_added' })} />)

    expect(screen.getByText(tActivity('action.item_added'))).toBeInTheDocument()
  })

  it('falls back to the unknown-action label when the action is not in the allowlist', () => {
    render(<AuditEntryRow entry={makeEntry({ action: 'newfangled_action' })} />)

    expect(screen.getByText(tActivity('action.unknown'))).toBeInTheDocument()
  })

  it('renders a relative-time string derived from createdAt', () => {
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
    const { container } = render(<AuditEntryRow entry={makeEntry({ createdAt: oneMinuteAgo })} />)

    // date-fns `formatDistanceToNow({ addSuffix: true })` for a 1-minute-old
    // timestamp yields "about 1 minute ago" (or "less than a minute ago" depending
    // on the second offset). We assert the substring "minute" + "ago" so the
    // test is stable across both date-fns rounding bands.
    expect(container.textContent ?? '').toMatch(/minute.*ago/i)
  })
})
