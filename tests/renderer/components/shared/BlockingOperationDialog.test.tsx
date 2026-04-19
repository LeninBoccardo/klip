import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BlockingOperationDialog } from '@/components/shared/BlockingOperationDialog'
import { useAppStore } from '@/hooks/use-app-store'

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
    expect(screen.getByText('Moving files…')).toBeInTheDocument()
    expect(screen.getByText('2/5')).toBeInTheDocument()
    expect(screen.getByText('creator-a')).toBeInTheDocument()
  })

  it('renders updating_db phase label', () => {
    useAppStore.setState({
      blockingOperation: {
        title: 'Migrating',
        progress: { phase: 'updating_db', current: 0, total: 1 }
      }
    })

    render(<BlockingOperationDialog />)
    expect(screen.getByText('Updating database…')).toBeInTheDocument()
  })

  it('renders reconciling phase label', () => {
    useAppStore.setState({
      blockingOperation: {
        title: 'Migrating',
        progress: { phase: 'reconciling', current: 0, total: 1 }
      }
    })

    render(<BlockingOperationDialog />)
    expect(screen.getByText('Reconciling…')).toBeInTheDocument()
  })
})
