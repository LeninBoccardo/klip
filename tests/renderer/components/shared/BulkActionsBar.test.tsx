import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import i18n from '@renderer/i18n'
import { BulkActionsBar } from '@/components/shared/BulkActionsBar'
import { useAllDistinctTags, useBulkUpdateTags } from '@/hooks/use-tags'
import type { TagAggregation, BulkUpdateTagsRequest, BulkUpdateTagsResult } from '@shared/types'

vi.mock('@/hooks/use-tags', () => ({
  useAllDistinctTags: vi.fn(),
  useBulkUpdateTags: vi.fn()
}))

vi.mock('@components/features/videos/MoveToCreatorDialog', () => ({
  MoveToCreatorDialog: ({ open, onMoved }: { open: boolean; onMoved?: () => void }) =>
    open ? (
      <div data-testid="move-dialog">
        <button type="button" onClick={() => onMoved?.()}>
          simulate-move
        </button>
      </div>
    ) : null
}))

// TagInput is a cmdk-driven chip editor. Its keyboard interactions (Enter,
// Backspace, comma) are tested directly in TagInput.test.tsx — for the
// BulkActionsBar tests we only need to drive `value`/`onChange`, so a
// minimal text-input stub keeps these tests focused on the bar's wiring.
vi.mock('@/components/shared/TagInput', () => ({
  TagInput: ({
    value,
    onChange,
    placeholder
  }: {
    value: string[]
    onChange: (next: string[]) => void
    placeholder?: string
    disabled?: boolean
    suggestions?: string[]
  }) => (
    <input
      data-testid="tag-input"
      placeholder={placeholder}
      value={value.join(',')}
      onChange={(e) => onChange(e.target.value ? e.target.value.split(',').filter(Boolean) : [])}
    />
  )
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
const tVideos = (key: string, params?: Record<string, unknown>): string =>
  i18n.t(key, { ns: 'videos', ...params })

function makeQueryResult<T>(data: T): UseQueryResult<T, Error> {
  return {
    data,
    error: null,
    isFetching: false,
    isLoading: false,
    isError: false,
    isSuccess: true,
    isPending: false,
    status: 'success',
    refetch: vi.fn()
  } as unknown as UseQueryResult<T, Error>
}

type BulkMutation = UseMutationResult<BulkUpdateTagsResult, Error, BulkUpdateTagsRequest>

function makeBulkMutation(overrides: Partial<BulkMutation> = {}): BulkMutation {
  return {
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    status: 'idle',
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    data: undefined,
    error: null,
    variables: undefined,
    ...overrides
  } as unknown as BulkMutation
}

const TAGS: TagAggregation[] = [
  { tag: 'music', videoCount: 3, cutCount: 0 },
  { tag: 'comedy', videoCount: 0, cutCount: 5 },
  { tag: 'mixed', videoCount: 2, cutCount: 1 }
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAllDistinctTags).mockReturnValue(makeQueryResult(TAGS))
  vi.mocked(useBulkUpdateTags).mockReturnValue(makeBulkMutation())
})

describe('BulkActionsBar — header', () => {
  it('renders the selected count via i18n plural rules', () => {
    render(
      <BulkActionsBar entityKind="video" selectedIds={['v-1', 'v-2', 'v-3']} onClear={() => {}} />
    )
    expect(screen.getByText(tTags('bulk.selected', { count: 3 }))).toBeInTheDocument()
  })

  it('Clear button fires onClear', async () => {
    const onClear = vi.fn()
    const user = userEvent.setup()
    render(<BulkActionsBar entityKind="video" selectedIds={['v-1']} onClear={onClear} />)

    await user.click(screen.getByRole('button', { name: tTags('bulk.clear') }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})

describe('BulkActionsBar — entity-kind branching', () => {
  it('renders the Move-to-creator button only when entityKind is "video"', () => {
    const { unmount } = render(
      <BulkActionsBar entityKind="video" selectedIds={['v-1']} onClear={() => {}} />
    )
    expect(screen.getByRole('button', { name: tVideos('move.buttonLabel') })).toBeInTheDocument()
    unmount()

    render(<BulkActionsBar entityKind="cut" selectedIds={['c-1']} onClear={() => {}} />)
    expect(
      screen.queryByRole('button', { name: tVideos('move.buttonLabel') })
    ).not.toBeInTheDocument()
  })

  it('clicking Move-to-creator opens the dialog and forwards a successful move via onMutationSuccess', async () => {
    const onClear = vi.fn()
    const onMutationSuccess = vi.fn()
    const user = userEvent.setup()
    render(
      <BulkActionsBar
        entityKind="video"
        selectedIds={['v-1']}
        onClear={onClear}
        onMutationSuccess={onMutationSuccess}
      />
    )

    await user.click(screen.getByRole('button', { name: tVideos('move.buttonLabel') }))
    expect(screen.getByTestId('move-dialog')).toBeInTheDocument()

    // Stubbed dialog exposes a button that triggers the onMoved callback.
    await user.click(screen.getByRole('button', { name: 'simulate-move' }))
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(onMutationSuccess).toHaveBeenCalledTimes(1)
  })
})

describe('BulkActionsBar — add/remove dialog', () => {
  it('opens the Add dialog and dispatches an addTags request on Apply', async () => {
    const mutate = vi.fn(
      (
        _req: BulkUpdateTagsRequest,
        opts?: {
          onSuccess?: (r: BulkUpdateTagsResult) => void
          onError?: (e: Error) => void
        }
      ) => opts?.onSuccess?.({ updated: 2, skipped: 0 })
    )
    vi.mocked(useBulkUpdateTags).mockReturnValue(makeBulkMutation({ mutate }))
    const onClear = vi.fn()
    const user = userEvent.setup()
    render(<BulkActionsBar entityKind="video" selectedIds={['v-1', 'v-2']} onClear={onClear} />)

    await user.click(screen.getByRole('button', { name: tTags('bulk.addButton') }))
    expect(screen.getByText(tTags('bulk.addTitle', { count: 2 }))).toBeInTheDocument()

    const tagInput = screen.getByTestId('tag-input')
    await user.type(tagInput, 'jazz')

    await user.click(screen.getByRole('button', { name: tCommon('actions.apply') }))

    expect(mutate).toHaveBeenCalledWith(
      { entityKind: 'video', ids: ['v-1', 'v-2'], addTags: ['jazz'] },
      expect.any(Object)
    )
    expect(toastSuccess).toHaveBeenCalledWith(tTags('bulk.addedToastVideo', { count: 2 }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('opens the Remove dialog and dispatches a removeTags request on Apply', async () => {
    const mutate = vi.fn(
      (
        _req: BulkUpdateTagsRequest,
        opts?: {
          onSuccess?: (r: BulkUpdateTagsResult) => void
        }
      ) => opts?.onSuccess?.({ updated: 1, skipped: 0 })
    )
    vi.mocked(useBulkUpdateTags).mockReturnValue(makeBulkMutation({ mutate }))
    const user = userEvent.setup()
    render(<BulkActionsBar entityKind="cut" selectedIds={['c-1']} onClear={() => {}} />)

    await user.click(screen.getByRole('button', { name: tTags('bulk.removeButton') }))
    expect(screen.getByText(tTags('bulk.removeTitle', { count: 1 }))).toBeInTheDocument()

    const tagInput = screen.getByTestId('tag-input')
    await user.type(tagInput, 'comedy')
    await user.click(screen.getByRole('button', { name: tCommon('actions.apply') }))

    expect(mutate).toHaveBeenCalledWith(
      { entityKind: 'cut', ids: ['c-1'], removeTags: ['comedy'] },
      expect.any(Object)
    )
    expect(toastSuccess).toHaveBeenCalledWith(tTags('bulk.removedToastCut', { count: 1 }))
  })

  it('Apply is disabled when the draft is empty', async () => {
    const user = userEvent.setup()
    render(<BulkActionsBar entityKind="video" selectedIds={['v-1']} onClear={() => {}} />)

    await user.click(screen.getByRole('button', { name: tTags('bulk.addButton') }))
    const apply = screen.getByRole('button', { name: tCommon('actions.apply') })
    expect(apply).toBeDisabled()
  })

  it('mutation error fires the failure toast', async () => {
    const mutate = vi.fn(
      (
        _req: BulkUpdateTagsRequest,
        opts?: {
          onSuccess?: (r: BulkUpdateTagsResult) => void
          onError?: (e: Error) => void
        }
      ) => opts?.onError?.(new Error('boom'))
    )
    vi.mocked(useBulkUpdateTags).mockReturnValue(makeBulkMutation({ mutate }))
    const user = userEvent.setup()
    render(<BulkActionsBar entityKind="video" selectedIds={['v-1']} onClear={() => {}} />)

    await user.click(screen.getByRole('button', { name: tTags('bulk.addButton') }))
    const tagInput = screen.getByTestId('tag-input')
    await user.type(tagInput, 'jazz')
    await user.click(screen.getByRole('button', { name: tCommon('actions.apply') }))

    expect(toastError).toHaveBeenCalledWith(tTags('bulk.updateFailed', { message: 'boom' }))
  })
})
