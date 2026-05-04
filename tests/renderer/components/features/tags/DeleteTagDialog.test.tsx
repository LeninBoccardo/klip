import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UseMutationResult } from '@tanstack/react-query'
import i18n from '@renderer/i18n'
import { DeleteTagDialog } from '@/components/features/tags/DeleteTagDialog'
import { useDeleteTagGlobally } from '@/hooks/use-tags'
import type { DeleteTagGloballyResult, TagAggregation } from '@shared/types'

vi.mock('@/hooks/use-tags', () => ({
  useDeleteTagGlobally: vi.fn()
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args)
  }
}))

const tTags = (key: string, params?: Record<string, unknown>): string =>
  i18n.t(key, { ns: 'tags', ...params })
const tCommon = (key: string): string => i18n.t(key, { ns: 'common' })

type DeleteMutation = UseMutationResult<DeleteTagGloballyResult, Error, string>

function makeMutation(overrides: Partial<DeleteMutation> = {}): DeleteMutation {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isIdle: true,
    isError: false,
    isSuccess: false,
    status: 'idle',
    data: undefined,
    error: null,
    variables: undefined,
    reset: vi.fn(),
    ...overrides
  } as unknown as DeleteMutation
}

const TAG: TagAggregation = { tag: 'music', videoCount: 3, cutCount: 1 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useDeleteTagGlobally).mockReturnValue(makeMutation())
})

describe('DeleteTagDialog', () => {
  it('renders title + description with the tag name and counts when open', () => {
    render(<DeleteTagDialog open onOpenChange={() => {}} tag={TAG} />)
    expect(screen.getByText(tTags('manage.delete.title'))).toBeInTheDocument()
    expect(
      screen.getByText(
        tTags('manage.delete.description', { name: 'music', videoCount: 3, cutCount: 1 })
      )
    ).toBeInTheDocument()
  })

  it('clicking Delete fires the deleteTagGlobally mutation with the tag name', async () => {
    const mutate = vi.fn(
      (_tag: string, opts?: { onSuccess?: (r: DeleteTagGloballyResult) => void }) =>
        opts?.onSuccess?.({ videosUpdated: 3, cutsUpdated: 1 })
    )
    vi.mocked(useDeleteTagGlobally).mockReturnValue(makeMutation({ mutate }))
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<DeleteTagDialog open onOpenChange={onOpenChange} tag={TAG} />)

    await user.click(screen.getByRole('button', { name: tTags('manage.delete.submit') }))

    expect(mutate).toHaveBeenCalledWith('music', expect.any(Object))
    expect(toastSuccess).toHaveBeenCalledWith(
      tTags('manage.toasts.deleted', { name: 'music', videos: 3, cuts: 1 })
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('toasts the error message when the mutation rejects', async () => {
    const mutate = vi.fn((_tag: string, opts?: { onError?: (e: Error) => void }) =>
      opts?.onError?.(new Error('boom'))
    )
    vi.mocked(useDeleteTagGlobally).mockReturnValue(makeMutation({ mutate }))
    const user = userEvent.setup()
    render(<DeleteTagDialog open onOpenChange={() => {}} tag={TAG} />)

    await user.click(screen.getByRole('button', { name: tTags('manage.delete.submit') }))
    expect(toastError).toHaveBeenCalledWith(
      tTags('manage.toasts.deleteFailed', { message: 'boom' })
    )
  })

  it('disables the submit button while the mutation is pending', () => {
    vi.mocked(useDeleteTagGlobally).mockReturnValue(makeMutation({ isPending: true }))
    render(<DeleteTagDialog open onOpenChange={() => {}} tag={TAG} />)
    expect(screen.getByRole('button', { name: tTags('manage.delete.submit') })).toBeDisabled()
    expect(screen.getByRole('button', { name: tCommon('actions.cancel') })).toBeDisabled()
  })

  it('does nothing when tag prop is null and submit is somehow clicked', async () => {
    const mutate = vi.fn()
    vi.mocked(useDeleteTagGlobally).mockReturnValue(makeMutation({ mutate }))
    const user = userEvent.setup()
    render(<DeleteTagDialog open onOpenChange={() => {}} tag={null} />)

    await user.click(screen.getByRole('button', { name: tTags('manage.delete.submit') }))
    expect(mutate).not.toHaveBeenCalled()
  })
})
