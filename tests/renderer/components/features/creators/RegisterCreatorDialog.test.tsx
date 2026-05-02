import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { RegisterCreatorDialog } from '@/components/features/creators/RegisterCreatorDialog'
import type { ChannelInfo } from '@shared/types'

const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args)
  }
}))

const fetchChannelInfo = vi.fn()
const registerCreator = vi.fn()

const channelInfo: ChannelInfo = {
  channelId: 'UC_abc123',
  channelName: 'Test Creator',
  channelUrl: 'https://youtube.com/channel/UC_abc123',
  uploaderUrl: null,
  subscriberCount: 12345,
  avatarUrl: null
}

beforeEach(() => {
  toastError.mockReset()
  toastSuccess.mockReset()
  fetchChannelInfo.mockReset().mockResolvedValue({
    channelInfo,
    creatorId: null,
    updated: false
  })
  registerCreator.mockReset().mockResolvedValue({ creatorId: 'new-id' })
  Object.defineProperty(window, 'api', {
    value: { fetchChannelInfo, registerCreator },
    writable: true,
    configurable: true
  })
})

function renderDialog(props: Partial<React.ComponentProps<typeof RegisterCreatorDialog>> = {}): {
  qc: QueryClient
} {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } }
  })
  render(
    <QueryClientProvider client={qc}>
      <RegisterCreatorDialog open onOpenChange={() => {}} {...props} />
    </QueryClientProvider>
  )
  return { qc }
}

describe('RegisterCreatorDialog', () => {
  it('does not render the form when closed', () => {
    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <RegisterCreatorDialog open={false} onOpenChange={() => {}} />
      </QueryClientProvider>
    )
    expect(screen.queryByLabelText(/channel url/i)).toBeNull()
  })

  it('starts in URL-only phase, fetches on submit, prefills overrides from preview', async () => {
    const user = userEvent.setup()
    renderDialog()

    expect(screen.getByLabelText(/channel url/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/display name/i)).toBeNull()

    await user.type(screen.getByLabelText(/channel url/i), 'https://youtube.com/@test')
    await user.click(screen.getByRole('button', { name: /^fetch$/i }))

    await waitFor(() => expect(fetchChannelInfo).toHaveBeenCalledWith('https://youtube.com/@test'))

    const nameInput = await screen.findByLabelText(/display name/i)
    expect((nameInput as HTMLInputElement).value).toBe('Test Creator')
    expect((screen.getByLabelText(/folder name/i) as HTMLInputElement).value).toBe('test-creator')
  })

  it('submits a registration request with normalized tags and notes, then closes + fires onCreated', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onCreated = vi.fn()
    renderDialog({ onOpenChange, onCreated })

    await user.type(screen.getByLabelText(/channel url/i), 'https://youtube.com/@test')
    await user.click(screen.getByRole('button', { name: /^fetch$/i }))
    await screen.findByLabelText(/display name/i)

    await user.clear(screen.getByLabelText(/display name/i))
    await user.type(screen.getByLabelText(/display name/i), 'Custom Name')
    await user.type(screen.getByLabelText(/notes/i), '  some notes  ')
    await user.type(screen.getByLabelText(/^tags$/i), ' vlog , tech ,, ')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() =>
      expect(registerCreator).toHaveBeenCalledWith({
        channelInfo,
        displayName: 'Custom Name',
        folderName: 'test-creator',
        notes: 'some notes',
        tags: ['vlog', 'tech']
      })
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onCreated).toHaveBeenCalledWith('new-id')
  })

  it('routes "already registered" error to onOpenExisting via toast action', async () => {
    const user = userEvent.setup()
    const onOpenExisting = vi.fn()
    registerCreator.mockRejectedValueOnce(new Error('CREATOR_ALREADY_REGISTERED:existing-id'))
    renderDialog({ onOpenExisting })

    await user.type(screen.getByLabelText(/channel url/i), 'https://youtube.com/@test')
    await user.click(screen.getByRole('button', { name: /^fetch$/i }))
    await screen.findByLabelText(/display name/i)
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    const [, opts] = toastError.mock.calls.at(-1) as [string, { action?: { onClick: () => void } }]
    expect(opts.action).toBeDefined()
    opts.action!.onClick()
    expect(onOpenExisting).toHaveBeenCalledWith('existing-id')
  })
})
