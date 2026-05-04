import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UseMutationResult } from '@tanstack/react-query'
import i18n from '@renderer/i18n'
import { RenameTagDialog } from '@/components/features/tags/RenameTagDialog'
import { useRenameTagGlobally } from '@/hooks/use-tags'
import type { RenameTagGloballyResult, TagAggregation } from '@shared/types'

vi.mock('@/hooks/use-tags', () => ({
  useRenameTagGlobally: vi.fn()
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

type RenameMutation = UseMutationResult<
  RenameTagGloballyResult,
  Error,
  { oldTag: string; newTag: string }
>

function makeMutation(overrides: Partial<RenameMutation> = {}): RenameMutation {
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
  } as unknown as RenameMutation
}

const TAG: TagAggregation = { tag: 'music', videoCount: 5, cutCount: 2 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useRenameTagGlobally).mockReturnValue(makeMutation())
})

describe('RenameTagDialog', () => {
  it('seeds the input with the current tag name when opened', () => {
    render(<RenameTagDialog open onOpenChange={() => {}} tag={TAG} existingTags={new Set()} />)

    const input = screen.getByLabelText(tTags('manage.rename.toLabel'))
    expect(input).toHaveValue('music')
  })

  it('disables submit when the input matches the existing name (no-op rename)', () => {
    render(<RenameTagDialog open onOpenChange={() => {}} tag={TAG} existingTags={new Set()} />)
    expect(screen.getByRole('button', { name: tTags('manage.rename.submit') })).toBeDisabled()
  })

  it('disables submit when the trimmed input is empty', async () => {
    const user = userEvent.setup()
    render(<RenameTagDialog open onOpenChange={() => {}} tag={TAG} existingTags={new Set()} />)

    const input = screen.getByLabelText(tTags('manage.rename.toLabel'))
    await user.clear(input)
    expect(screen.getByRole('button', { name: tTags('manage.rename.submit') })).toBeDisabled()
  })

  it('shows the merge warning when the new name matches an existing tag', async () => {
    const user = userEvent.setup()
    render(
      <RenameTagDialog open onOpenChange={() => {}} tag={TAG} existingTags={new Set(['comedy'])} />
    )

    const input = screen.getByLabelText(tTags('manage.rename.toLabel'))
    await user.clear(input)
    await user.type(input, 'comedy')

    expect(
      screen.getByText(tTags('manage.rename.mergeWarning', { name: 'comedy' }))
    ).toBeInTheDocument()
  })

  it('submitting fires the rename mutation with old/new tag and toasts success', async () => {
    const mutate = vi.fn(
      (
        _vars: { oldTag: string; newTag: string },
        opts?: { onSuccess?: (r: RenameTagGloballyResult) => void }
      ) => opts?.onSuccess?.({ videosUpdated: 5, cutsUpdated: 2 })
    )
    vi.mocked(useRenameTagGlobally).mockReturnValue(makeMutation({ mutate }))
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<RenameTagDialog open onOpenChange={onOpenChange} tag={TAG} existingTags={new Set()} />)

    const input = screen.getByLabelText(tTags('manage.rename.toLabel'))
    await user.clear(input)
    await user.type(input, 'jazz')
    await user.click(screen.getByRole('button', { name: tTags('manage.rename.submit') }))

    expect(mutate).toHaveBeenCalledWith({ oldTag: 'music', newTag: 'jazz' }, expect.any(Object))
    expect(toastSuccess).toHaveBeenCalledWith(
      tTags('manage.toasts.renamed', { from: 'music', to: 'jazz', videos: 5, cuts: 2 })
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('mutation error toasts the failure copy', async () => {
    const mutate = vi.fn(
      (_vars: { oldTag: string; newTag: string }, opts?: { onError?: (e: Error) => void }) =>
        opts?.onError?.(new Error('boom'))
    )
    vi.mocked(useRenameTagGlobally).mockReturnValue(makeMutation({ mutate }))
    const user = userEvent.setup()
    render(<RenameTagDialog open onOpenChange={() => {}} tag={TAG} existingTags={new Set()} />)

    const input = screen.getByLabelText(tTags('manage.rename.toLabel'))
    await user.clear(input)
    await user.type(input, 'jazz')
    await user.click(screen.getByRole('button', { name: tTags('manage.rename.submit') }))

    expect(toastError).toHaveBeenCalledWith(
      tTags('manage.toasts.renameFailed', { message: 'boom' })
    )
  })
})
