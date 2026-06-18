import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import i18n from '@renderer/i18n'
import { EditableTagsCard } from '@/components/features/videos/EditableTagsCard'
import { useAllDistinctTags, useBulkUpdateTags } from '@/hooks/use-tags'
import type {
  BulkUpdateTagsRequest,
  BulkUpdateTagsResult,
  TagAggregation
} from '@shared/types'

vi.mock('@/hooks/use-tags', () => ({
  useAllDistinctTags: vi.fn(),
  useBulkUpdateTags: vi.fn()
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args)
  }
}))

const tVideos = (key: string, params?: Record<string, unknown>): string =>
  i18n.t(key, { ns: 'videos', ...params })
const tCommon = (key: string, params?: Record<string, unknown>): string =>
  i18n.t(key, { ns: 'common', ...params })

type DistinctQuery = UseQueryResult<TagAggregation[], Error>
type BulkMutation = UseMutationResult<BulkUpdateTagsResult, Error, BulkUpdateTagsRequest>

function makeDistinctQuery(overrides: Partial<DistinctQuery> = {}): DistinctQuery {
  return {
    data: undefined,
    error: null,
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: true,
    status: 'success',
    fetchStatus: 'idle',
    refetch: vi.fn(),
    ...overrides
  } as unknown as DistinctQuery
}

function makeBulkMutation(overrides: Partial<BulkMutation> = {}): BulkMutation {
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
  } as unknown as BulkMutation
}

const AGGREGATIONS: TagAggregation[] = [
  { tag: 'music', videoCount: 5, cutCount: 0 },
  { tag: 'comedy', videoCount: 0, cutCount: 3 },
  { tag: 'shared', videoCount: 2, cutCount: 4 }
]

function enterEditMode(): Promise<void> {
  return userEvent.setup().click(screen.getByRole('button', { name: tVideos('tags.editAria') }))
}

// Commit a brand-new tag through the TagInput. Typing opens the cmdk popover,
// which captures Enter, so the reliable commit is clicking the "Create …"
// option the popover surfaces for an unmatched draft.
async function commitNewTag(name: string): Promise<void> {
  const user = userEvent.setup()
  const input = document.querySelector('input') as HTMLInputElement
  await user.type(input, name)
  await user.click(
    screen.getByText(i18n.t('input.createOption', { ns: 'tags', name }))
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAllDistinctTags).mockReturnValue(makeDistinctQuery())
  vi.mocked(useBulkUpdateTags).mockReturnValue(makeBulkMutation())
})

describe('EditableTagsCard — read-only mode', () => {
  it('renders the empty copy when there are no tags and no readOnlyExtras', () => {
    render(<EditableTagsCard entityKind="video" entityId="v1" tags={[]} />)

    expect(screen.getByText(tVideos('tags.title'))).toBeInTheDocument()
    expect(screen.getByText(tVideos('tags.empty'))).toBeInTheDocument()
  })

  it('renders a badge per saved tag', () => {
    render(<EditableTagsCard entityKind="video" entityId="v1" tags={['music', 'comedy']} />)

    expect(screen.getByText('music')).toBeInTheDocument()
    expect(screen.getByText('comedy')).toBeInTheDocument()
    expect(screen.queryByText(tVideos('tags.empty'))).not.toBeInTheDocument()
  })

  it('renders readOnlyExtras and suppresses the empty copy even with zero tags', () => {
    render(
      <EditableTagsCard
        entityKind="video"
        entityId="v1"
        tags={[]}
        readOnlyExtras={<span>Short</span>}
      />
    )

    expect(screen.getByText('Short')).toBeInTheDocument()
    // The empty branch is gated on `!readOnlyExtras`, so it must not appear.
    expect(screen.queryByText(tVideos('tags.empty'))).not.toBeInTheDocument()
  })

  it('renders readOnlyExtras alongside badges when tags are present', () => {
    render(
      <EditableTagsCard
        entityKind="video"
        entityId="v1"
        tags={['music']}
        readOnlyExtras={<span>Short</span>}
      />
    )

    expect(screen.getByText('Short')).toBeInTheDocument()
    expect(screen.getByText('music')).toBeInTheDocument()
  })

  it('does not render the editing controls while read-only', () => {
    render(<EditableTagsCard entityKind="video" entityId="v1" tags={['music']} />)

    expect(
      screen.queryByRole('button', { name: tCommon('actions.save') })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: tCommon('actions.cancel') })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: tVideos('tags.editAria') })
    ).toBeInTheDocument()
  })
})

describe('EditableTagsCard — entering edit mode', () => {
  it('switches to the TagInput seeded from saved tags when the pencil is clicked', async () => {
    render(<EditableTagsCard entityKind="video" entityId="v1" tags={['music', 'comedy']} />)

    await enterEditMode()

    // TagInput renders the draft chips; the read-only badges path is replaced.
    expect(screen.getByText('music')).toBeInTheDocument()
    expect(screen.getByText('comedy')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: tCommon('actions.save') })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: tCommon('actions.cancel') })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: tVideos('tags.editAria') })
    ).not.toBeInTheDocument()
  })
})

describe('EditableTagsCard — suggestions filtering', () => {
  it("uses only tags with videoCount > 0 when entityKind is 'video'", async () => {
    vi.mocked(useAllDistinctTags).mockReturnValue(makeDistinctQuery({ data: AGGREGATIONS }))
    render(<EditableTagsCard entityKind="video" entityId="v1" tags={[]} />)

    await enterEditMode()
    const input = document.querySelector('input') as HTMLInputElement
    const user = userEvent.setup()
    await user.type(input, 'm')

    // "music" (videoCount 5) suggested; "comedy" (videoCount 0) excluded.
    const listbox = screen.getByRole('listbox')
    expect(within(listbox).getByText('music')).toBeInTheDocument()
    expect(within(listbox).queryByText('comedy')).not.toBeInTheDocument()
  })

  it("uses only tags with cutCount > 0 when entityKind is 'cut'", async () => {
    vi.mocked(useAllDistinctTags).mockReturnValue(makeDistinctQuery({ data: AGGREGATIONS }))
    render(<EditableTagsCard entityKind="cut" entityId="c1" tags={[]} />)

    await enterEditMode()
    const input = document.querySelector('input') as HTMLInputElement
    const user = userEvent.setup()
    await user.type(input, 'c')

    // "comedy" (cutCount 3) suggested; "music" (cutCount 0) excluded.
    const listbox = screen.getByRole('listbox')
    expect(within(listbox).getByText('comedy')).toBeInTheDocument()
    expect(within(listbox).queryByText('music')).not.toBeInTheDocument()
  })

  it('falls back to an empty suggestion pool when the distinct-tags query has no data', async () => {
    // `allTags.data ?? []` — undefined data must collapse to an empty pool, so
    // the autocomplete never surfaces an "Existing tags" group, only the
    // "Create …" affordance for whatever the user types.
    vi.mocked(useAllDistinctTags).mockReturnValue(makeDistinctQuery({ data: undefined }))
    render(<EditableTagsCard entityKind="video" entityId="v1" tags={[]} />)

    await enterEditMode()
    const input = document.querySelector('input') as HTMLInputElement
    const user = userEvent.setup()
    await user.type(input, 'm')

    // No existing-tag suggestions surface; only the create option for "m".
    expect(
      screen.queryByText(i18n.t('input.existingHeading', { ns: 'tags' }))
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(i18n.t('input.createOption', { ns: 'tags', name: 'm' }))
    ).toBeInTheDocument()
  })
})

describe('EditableTagsCard — saving (no-op diff)', () => {
  it('exits edit mode without firing the mutation when the draft equals the saved tags', async () => {
    const mutate = vi.fn()
    vi.mocked(useBulkUpdateTags).mockReturnValue(makeBulkMutation({ mutate }))
    render(<EditableTagsCard entityKind="video" entityId="v1" tags={['music']} />)

    await enterEditMode()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: tCommon('actions.save') }))

    expect(mutate).not.toHaveBeenCalled()
    // Back in read-only mode: the edit pencil is showing again.
    expect(screen.getByRole('button', { name: tVideos('tags.editAria') })).toBeInTheDocument()
  })
})

describe('EditableTagsCard — saving (real diff)', () => {
  it('fires bulkUpdate with only removeTags when a chip is deleted', async () => {
    const mutate = vi.fn()
    vi.mocked(useBulkUpdateTags).mockReturnValue(makeBulkMutation({ mutate }))
    render(<EditableTagsCard entityKind="video" entityId="v1" tags={['music', 'comedy']} />)

    await enterEditMode()
    const user = userEvent.setup()
    // TagInput exposes a remove button per chip via the tags namespace aria label.
    await user.click(
      screen.getByLabelText(i18n.t('input.removeAria', { ns: 'tags', tag: 'comedy' }))
    )
    await user.click(screen.getByRole('button', { name: tCommon('actions.save') }))

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith(
      { entityKind: 'video', ids: ['v1'], removeTags: ['comedy'] },
      expect.any(Object)
    )
    // No addTags key when nothing was added.
    expect(mutate.mock.calls[0][0]).not.toHaveProperty('addTags')
  })

  it('fires bulkUpdate with only addTags when a new chip is committed', async () => {
    const mutate = vi.fn()
    vi.mocked(useBulkUpdateTags).mockReturnValue(makeBulkMutation({ mutate }))
    render(<EditableTagsCard entityKind="cut" entityId="c1" tags={['music']} />)

    await enterEditMode()
    const user = userEvent.setup()
    await commitNewTag('jazz')
    await user.click(screen.getByRole('button', { name: tCommon('actions.save') }))

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith(
      { entityKind: 'cut', ids: ['c1'], addTags: ['jazz'] },
      expect.any(Object)
    )
    expect(mutate.mock.calls[0][0]).not.toHaveProperty('removeTags')
  })

  it('fires bulkUpdate with both addTags and removeTags when a chip is swapped', async () => {
    const mutate = vi.fn()
    vi.mocked(useBulkUpdateTags).mockReturnValue(makeBulkMutation({ mutate }))
    render(<EditableTagsCard entityKind="video" entityId="v9" tags={['music']} />)

    await enterEditMode()
    const user = userEvent.setup()
    await user.click(
      screen.getByLabelText(i18n.t('input.removeAria', { ns: 'tags', tag: 'music' }))
    )
    await commitNewTag('jazz')
    await user.click(screen.getByRole('button', { name: tCommon('actions.save') }))

    expect(mutate).toHaveBeenCalledWith(
      { entityKind: 'video', ids: ['v9'], addTags: ['jazz'], removeTags: ['music'] },
      expect.any(Object)
    )
  })

  it('toasts success and exits edit mode on the mutation success callback', async () => {
    const mutate = vi.fn(
      (_vars: BulkUpdateTagsRequest, opts?: { onSuccess?: (r: BulkUpdateTagsResult) => void }) =>
        opts?.onSuccess?.({ updated: 1, skipped: 0 })
    )
    vi.mocked(useBulkUpdateTags).mockReturnValue(makeBulkMutation({ mutate }))
    render(<EditableTagsCard entityKind="video" entityId="v1" tags={['music']} />)

    await enterEditMode()
    const user = userEvent.setup()
    await commitNewTag('jazz')
    await user.click(screen.getByRole('button', { name: tCommon('actions.save') }))

    expect(toastSuccess).toHaveBeenCalledWith(tVideos('tags.updated'))
    // Edit mode exited: pencil is back.
    expect(screen.getByRole('button', { name: tVideos('tags.editAria') })).toBeInTheDocument()
  })

  it('toasts the failure copy and stays in edit mode on the mutation error callback', async () => {
    const mutate = vi.fn(
      (_vars: BulkUpdateTagsRequest, opts?: { onError?: (e: Error) => void }) =>
        opts?.onError?.(new Error('boom'))
    )
    vi.mocked(useBulkUpdateTags).mockReturnValue(makeBulkMutation({ mutate }))
    render(<EditableTagsCard entityKind="video" entityId="v1" tags={['music']} />)

    await enterEditMode()
    const user = userEvent.setup()
    await commitNewTag('jazz')
    await user.click(screen.getByRole('button', { name: tCommon('actions.save') }))

    expect(toastError).toHaveBeenCalledWith(
      tVideos('tags.updateFailed', { message: 'boom' })
    )
    // Draft preserved, still editing so the user can retry.
    expect(screen.getByRole('button', { name: tCommon('actions.save') })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: tVideos('tags.editAria') })
    ).not.toBeInTheDocument()
  })
})

describe('EditableTagsCard — cancelling', () => {
  it('discards draft edits and returns to the saved tags in read-only mode', async () => {
    const mutate = vi.fn()
    vi.mocked(useBulkUpdateTags).mockReturnValue(makeBulkMutation({ mutate }))
    render(<EditableTagsCard entityKind="video" entityId="v1" tags={['music']} />)

    await enterEditMode()
    const user = userEvent.setup()
    await commitNewTag('jazz')
    // Cancel: draft reset to ['music'], edit mode off.
    await user.click(screen.getByRole('button', { name: tCommon('actions.cancel') }))

    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: tVideos('tags.editAria') })).toBeInTheDocument()
    expect(screen.getByText('music')).toBeInTheDocument()
    // The discarded draft tag is gone from the read-only view.
    expect(screen.queryByText('jazz')).not.toBeInTheDocument()
  })

  it('re-entering edit mode after cancel re-seeds the draft from the saved tags', async () => {
    render(<EditableTagsCard entityKind="video" entityId="v1" tags={['music']} />)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: tVideos('tags.editAria') }))
    await commitNewTag('jazz')
    await user.click(screen.getByRole('button', { name: tCommon('actions.cancel') }))

    // Second entry: pencil seeds the draft afresh from props (no stale "jazz").
    await user.click(screen.getByRole('button', { name: tVideos('tags.editAria') }))
    expect(screen.getByText('music')).toBeInTheDocument()
    expect(screen.queryByText('jazz')).not.toBeInTheDocument()
  })
})

describe('EditableTagsCard — pending state', () => {
  it('disables the save/cancel buttons, the TagInput, and shows the spinner while the mutation is pending', async () => {
    vi.mocked(useBulkUpdateTags).mockReturnValue(makeBulkMutation({ isPending: true, isIdle: false }))
    render(<EditableTagsCard entityKind="video" entityId="v1" tags={['music']} />)

    await enterEditMode()

    expect(screen.getByRole('button', { name: tCommon('actions.save') })).toBeDisabled()
    expect(screen.getByRole('button', { name: tCommon('actions.cancel') })).toBeDisabled()
    const input = document.querySelector('input') as HTMLInputElement
    expect(input).toBeDisabled()
    // Loader2 carries the animate-spin class while pending.
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })
})
