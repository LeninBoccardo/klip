import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MigrateRootButton } from '@components/features/settings/MigrateRootButton'
import { useAppStore } from '@/hooks/use-app-store'
import { createQueryWrapper } from '../../../helpers/test-utils'

// Mock window.api
const mockSelectFolder = vi.fn()
const mockMigrateRoot = vi.fn()
const mockOnMigrateRootProgress = vi.fn().mockReturnValue(() => {})

beforeEach(() => {
  ;(window as any).api = {
    selectFolder: mockSelectFolder,
    migrateRoot: mockMigrateRoot,
    onMigrateRootProgress: mockOnMigrateRootProgress
  }
  useAppStore.setState({ blockingOperation: null })
  mockSelectFolder.mockReset()
  mockMigrateRoot.mockReset()
})

describe('MigrateRootButton', () => {
  it('renders the button', () => {
    render(<MigrateRootButton currentRootPath="/old/root" />, {
      wrapper: createQueryWrapper()
    })
    expect(screen.getByText('Change Root Folder')).toBeInTheDocument()
  })

  it('is disabled when a blocking operation is active', () => {
    useAppStore.setState({
      blockingOperation: { title: 'Migrating' }
    })

    render(<MigrateRootButton currentRootPath="/old/root" />, {
      wrapper: createQueryWrapper()
    })

    expect(screen.getByText('Change Root Folder').closest('button')).toBeDisabled()
  })

  it('opens folder picker on click', async () => {
    mockSelectFolder.mockResolvedValue(null)
    const user = userEvent.setup()

    render(<MigrateRootButton currentRootPath="/old/root" />, {
      wrapper: createQueryWrapper()
    })

    await user.click(screen.getByText('Change Root Folder'))
    expect(mockSelectFolder).toHaveBeenCalledOnce()
  })

  it('shows confirmation dialog after folder selection', async () => {
    mockSelectFolder.mockResolvedValue('/new/root')
    const user = userEvent.setup()

    render(<MigrateRootButton currentRootPath="/old/root" />, {
      wrapper: createQueryWrapper()
    })

    await user.click(screen.getByText('Change Root Folder'))

    await waitFor(() => {
      expect(screen.getByText('Move all files to a new location?')).toBeInTheDocument()
    })
    expect(screen.getByText('/new/root')).toBeInTheDocument()
  })

  it('does not show confirmation when folder picker is cancelled', async () => {
    mockSelectFolder.mockResolvedValue(null)
    const user = userEvent.setup()

    render(<MigrateRootButton currentRootPath="/old/root" />, {
      wrapper: createQueryWrapper()
    })

    await user.click(screen.getByText('Change Root Folder'))

    expect(screen.queryByText('Move all files to a new location?')).not.toBeInTheDocument()
  })
})
