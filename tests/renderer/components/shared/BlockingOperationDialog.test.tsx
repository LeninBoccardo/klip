import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '@renderer/i18n'
import { BlockingOperationDialog } from '@/components/shared/BlockingOperationDialog'
import { useAppStore } from '@/hooks/use-app-store'

// Phase labels are pulled from i18n at test time rather than hardcoded
// English. A regression that drops a translation key (component would render
// the raw `operations.phases.moving` literal) still fails this test, AND a
// future locale switch in the test harness wouldn't break the suite.
const phaseLabel = (key: 'moving' | 'updating_db' | 'reconciling'): string =>
  i18n.t(`operations.phases.${key}`, { ns: 'common' })

describe('BlockingOperationDialog', () => {
  beforeEach(() => {
    useAppStore.setState({ blockingOperation: null })
  })

  it('renders nothing when no blocking operation is active', () => {
    const { container } = render(<BlockingOperationDialog />)
    expect(container.innerHTML).toBe('')
  })

  it('renders title when a blocking operation is active', () => {
    useAppStore.setState({
      blockingOperation: { title: 'Migrating root folder' }
    })

    render(<BlockingOperationDialog />)
    expect(screen.getByText('Migrating root folder')).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    useAppStore.setState({
      blockingOperation: {
        title: 'Migrating',
        description: 'Moving creator folders…'
      }
    })

    render(<BlockingOperationDialog />)
    expect(screen.getByText('Moving creator folders…')).toBeInTheDocument()
  })

  it('renders progress bar and phase label when progress is set', () => {
    useAppStore.setState({
      blockingOperation: {
        title: 'Migrating',
        progress: { phase: 'moving', current: 2, total: 5, currentFolder: 'creator-a' }
      }
    })

    render(<BlockingOperationDialog />)
    expect(screen.getByText(phaseLabel('moving'))).toBeInTheDocument()
    expect(screen.getByText('2/5')).toBeInTheDocument()
    expect(screen.getByText('creator-a')).toBeInTheDocument()
    // Structural assertion: a real progressbar lives in the DOM.
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders updating_db phase label', () => {
    useAppStore.setState({
      blockingOperation: {
        title: 'Migrating',
        progress: { phase: 'updating_db', current: 0, total: 1 }
      }
    })

    render(<BlockingOperationDialog />)
    expect(screen.getByText(phaseLabel('updating_db'))).toBeInTheDocument()
  })

  it('renders reconciling phase label', () => {
    useAppStore.setState({
      blockingOperation: {
        title: 'Migrating',
        progress: { phase: 'reconciling', current: 0, total: 1 }
      }
    })

    render(<BlockingOperationDialog />)
    expect(screen.getByText(phaseLabel('reconciling'))).toBeInTheDocument()
  })

  it('falls back to the raw phase value when it is not in the known-phases allowlist', () => {
    // A regression that adds a new phase to the union without updating
    // `KNOWN_PHASES` would render the raw key — this is the documented
    // safety-net behavior. Pin it so the fallback isn't accidentally lost.
    useAppStore.setState({
      blockingOperation: {
        title: 'Migrating',
        progress: { phase: 'unknown_new_phase' as never, current: 0, total: 1 }
      }
    })

    render(<BlockingOperationDialog />)
    expect(screen.getByText('unknown_new_phase')).toBeInTheDocument()
  })
})
