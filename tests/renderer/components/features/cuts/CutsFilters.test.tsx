import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UseQueryResult } from '@tanstack/react-query'
import i18n from '@renderer/i18n'
import { CutsFilters, sortKeyToParams, type CutsSortKey } from '@/components/features/cuts/CutsFilters'
import { useAllDistinctTags } from '@/hooks/use-tags'
import { useCreatorsPaginated } from '@/hooks/use-creators'
import type { CreatorDto } from '@shared/dtos'
import type { EntityStatus, PaginatedResult, TagAggregation } from '@shared/types'

vi.mock('@/hooks/use-tags', () => ({
  useAllDistinctTags: vi.fn()
}))
vi.mock('@/hooks/use-creators', () => ({
  useCreatorsPaginated: vi.fn()
}))

// The chip editor's keyboard interactions are covered in TagInput.test.tsx.
// Here a minimal stub keeps the focus on CutsFilters' wiring: it surfaces the
// placeholder, the value, the suggestions count, and an onChange hook so the
// `onTagsChange` prop can be exercised directly.
vi.mock('@/components/shared/TagInput', () => ({
  TagInput: ({
    value,
    onChange,
    placeholder,
    suggestions
  }: {
    value: string[]
    onChange: (next: string[]) => void
    placeholder?: string
    suggestions?: string[]
  }) => (
    <input
      data-testid="tag-input"
      data-suggestions={(suggestions ?? []).join(',')}
      placeholder={placeholder}
      value={value.join(',')}
      onChange={(e) => onChange(e.target.value ? e.target.value.split(',').filter(Boolean) : [])}
    />
  )
}))

const tCuts = (key: string): string => i18n.t(key, { ns: 'cuts' })

function makeQueryResult<T>(data: T | undefined): UseQueryResult<T, Error> {
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

const CREATORS: CreatorDto[] = [
  {
    id: 'c-1',
    name: 'Alice',
    folderName: 'alice',
    externalUrl: null,
    status: 'active'
  } as CreatorDto,
  {
    id: 'c-2',
    name: 'Bob',
    folderName: 'bob',
    externalUrl: null,
    status: 'active'
  } as CreatorDto
]

const TAGS: TagAggregation[] = [
  { tag: 'music', videoCount: 3, cutCount: 0 },
  { tag: 'comedy', videoCount: 0, cutCount: 5 }
]

function paginated(data: CreatorDto[]): PaginatedResult<CreatorDto> {
  return { data, total: data.length, page: 1, pageSize: 500 }
}

interface RenderProps {
  search?: string
  onSearchChange?: (value: string) => void
  statusFilter?: EntityStatus[] | undefined
  onStatusFilterChange?: (value: EntityStatus[] | undefined) => void
  creatorId?: string | undefined
  onCreatorChange?: (id: string | undefined) => void
  tags?: string[]
  onTagsChange?: (tags: string[]) => void
  sort?: CutsSortKey
  onSortChange?: (sort: CutsSortKey) => void
}

function renderFilters(props: RenderProps = {}): {
  onSearchChange: ReturnType<typeof vi.fn>
  onStatusFilterChange: ReturnType<typeof vi.fn>
  onCreatorChange: ReturnType<typeof vi.fn>
  onTagsChange: ReturnType<typeof vi.fn>
  onSortChange: ReturnType<typeof vi.fn>
} {
  const onSearchChange = vi.fn()
  const onStatusFilterChange = vi.fn()
  const onCreatorChange = vi.fn()
  const onTagsChange = vi.fn()
  const onSortChange = vi.fn()
  render(
    <CutsFilters
      search={props.search ?? ''}
      onSearchChange={props.onSearchChange ?? onSearchChange}
      statusFilter={'statusFilter' in props ? props.statusFilter : undefined}
      onStatusFilterChange={props.onStatusFilterChange ?? onStatusFilterChange}
      creatorId={'creatorId' in props ? props.creatorId : undefined}
      onCreatorChange={props.onCreatorChange ?? onCreatorChange}
      tags={props.tags ?? []}
      onTagsChange={props.onTagsChange ?? onTagsChange}
      sort={props.sort ?? 'recent'}
      onSortChange={props.onSortChange ?? onSortChange}
    />
  )
  return { onSearchChange, onStatusFilterChange, onCreatorChange, onTagsChange, onSortChange }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useCreatorsPaginated).mockReturnValue(makeQueryResult(paginated(CREATORS)))
  vi.mocked(useAllDistinctTags).mockReturnValue(makeQueryResult(TAGS))
})

describe('sortKeyToParams', () => {
  it('maps "recent" to createdAt desc', () => {
    expect(sortKeyToParams('recent')).toEqual({ sortBy: 'createdAt', sortDirection: 'desc' })
  })

  it('maps "oldest" to createdAt asc', () => {
    expect(sortKeyToParams('oldest')).toEqual({ sortBy: 'createdAt', sortDirection: 'asc' })
  })

  it('maps "longest" to duration desc', () => {
    expect(sortKeyToParams('longest')).toEqual({ sortBy: 'duration', sortDirection: 'desc' })
  })

  it('maps "shortest" to duration asc', () => {
    expect(sortKeyToParams('shortest')).toEqual({ sortBy: 'duration', sortDirection: 'asc' })
  })
})

describe('CutsFilters — search input', () => {
  it('renders the search placeholder', () => {
    renderFilters()
    expect(screen.getByPlaceholderText(tCuts('filters.searchPlaceholder'))).toBeInTheDocument()
  })

  it('displays the current search value', () => {
    renderFilters({ search: 'hello' })
    expect(screen.getByPlaceholderText(tCuts('filters.searchPlaceholder'))).toHaveValue('hello')
  })

  it('calls onSearchChange with the typed value', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    renderFilters({ onSearchChange })

    await user.type(screen.getByPlaceholderText(tCuts('filters.searchPlaceholder')), 'x')
    expect(onSearchChange).toHaveBeenCalledWith('x')
  })
})

describe('CutsFilters — creator select', () => {
  it('shows the "all creators" placeholder when no creator is selected', () => {
    renderFilters({ creatorId: undefined })
    expect(screen.getByText(tCuts('filters.creatorAll'))).toBeInTheDocument()
  })

  it('reflects the selected creator name in the trigger', () => {
    renderFilters({ creatorId: 'c-2' })
    // The Select trigger renders the value of the chosen item.
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('lists every creator as an option and selecting one fires onCreatorChange with its id', async () => {
    const user = userEvent.setup()
    const onCreatorChange = vi.fn()
    renderFilters({ onCreatorChange })

    // First combobox is the creator picker.
    await user.click(screen.getAllByRole('combobox')[0])
    const alice = screen.getAllByText('Alice').find((el) => el.closest('[role="option"]'))
    if (!alice) throw new Error('expected Alice option')
    await user.click(alice)

    expect(onCreatorChange).toHaveBeenCalledWith('c-1')
  })

  it('choosing "all creators" maps the sentinel back to undefined', async () => {
    const user = userEvent.setup()
    const onCreatorChange = vi.fn()
    renderFilters({ creatorId: 'c-1', onCreatorChange })

    await user.click(screen.getAllByRole('combobox')[0])
    const all = screen
      .getAllByText(tCuts('filters.creatorAll'))
      .find((el) => el.closest('[role="option"]'))
    if (!all) throw new Error('expected all-creators option')
    await user.click(all)

    expect(onCreatorChange).toHaveBeenCalledWith(undefined)
  })

  it('renders no creator options when the query returns undefined data', async () => {
    vi.mocked(useCreatorsPaginated).mockReturnValue(makeQueryResult<PaginatedResult<CreatorDto>>(undefined))
    const user = userEvent.setup()
    renderFilters()

    await user.click(screen.getAllByRole('combobox')[0])
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
    expect(screen.queryByText('Bob')).not.toBeInTheDocument()
    // The "all creators" sentinel is still present.
    expect(
      screen.getAllByText(tCuts('filters.creatorAll')).some((el) => el.closest('[role="option"]'))
    ).toBe(true)
  })
})

describe('CutsFilters — status select (currentStatusValue branches)', () => {
  it('defaults to "Active" when statusFilter is undefined', () => {
    renderFilters({ statusFilter: undefined })
    expect(screen.getByText(tCuts('filters.status.active'))).toBeInTheDocument()
  })

  it('shows "Active" when statusFilter is exactly ["active"]', () => {
    renderFilters({ statusFilter: ['active'] })
    expect(screen.getByText(tCuts('filters.status.active'))).toBeInTheDocument()
  })

  it('shows "All" when statusFilter has all three statuses', () => {
    renderFilters({ statusFilter: ['active', 'deleted', 'missing'] })
    expect(screen.getByText(tCuts('filters.status.all'))).toBeInTheDocument()
  })

  it('shows the first status when statusFilter is a single non-active value', () => {
    renderFilters({ statusFilter: ['deleted'] })
    expect(screen.getByText(tCuts('filters.status.deleted'))).toBeInTheDocument()
  })

  it('falls back to "active" when statusFilter is an empty array (statusFilter[0] is undefined)', () => {
    renderFilters({ statusFilter: [] })
    expect(screen.getByText(tCuts('filters.status.active'))).toBeInTheDocument()
  })

  it('selecting "All" expands to active + deleted + missing', async () => {
    const user = userEvent.setup()
    const onStatusFilterChange = vi.fn()
    renderFilters({ onStatusFilterChange })

    // Second combobox is the status picker.
    await user.click(screen.getAllByRole('combobox')[1])
    const all = screen
      .getAllByText(tCuts('filters.status.all'))
      .find((el) => el.closest('[role="option"]'))
    if (!all) throw new Error('expected status all option')
    await user.click(all)

    expect(onStatusFilterChange).toHaveBeenCalledWith(['active', 'deleted', 'missing'])
  })

  it('selecting a single status passes a one-element array', async () => {
    const user = userEvent.setup()
    const onStatusFilterChange = vi.fn()
    renderFilters({ onStatusFilterChange })

    await user.click(screen.getAllByRole('combobox')[1])
    const deleted = screen
      .getAllByText(tCuts('filters.status.deleted'))
      .find((el) => el.closest('[role="option"]'))
    if (!deleted) throw new Error('expected status deleted option')
    await user.click(deleted)

    expect(onStatusFilterChange).toHaveBeenCalledWith(['deleted'])
  })
})

describe('CutsFilters — sort select', () => {
  it('reflects the current sort selection in the trigger', () => {
    renderFilters({ sort: 'longest' })
    expect(screen.getByText(tCuts('filters.sort.longest'))).toBeInTheDocument()
  })

  it('selecting a sort option fires onSortChange with the key', async () => {
    const user = userEvent.setup()
    const onSortChange = vi.fn()
    renderFilters({ sort: 'recent', onSortChange })

    // Third combobox is the sort picker.
    await user.click(screen.getAllByRole('combobox')[2])
    const oldest = screen
      .getAllByText(tCuts('filters.sort.oldest'))
      .find((el) => el.closest('[role="option"]'))
    if (!oldest) throw new Error('expected sort oldest option')
    await user.click(oldest)

    expect(onSortChange).toHaveBeenCalledWith('oldest')
  })
})

describe('CutsFilters — tag filter', () => {
  it('renders the tags label and placeholder', () => {
    renderFilters()
    expect(screen.getByText(tCuts('filters.tagsLabel'))).toBeInTheDocument()
    expect(screen.getByPlaceholderText(tCuts('filters.tagsPlaceholder'))).toBeInTheDocument()
  })

  it('passes distinct tag names as suggestions', () => {
    renderFilters()
    expect(screen.getByTestId('tag-input')).toHaveAttribute('data-suggestions', 'music,comedy')
  })

  it('passes an empty suggestion list when distinctTags is undefined', () => {
    vi.mocked(useAllDistinctTags).mockReturnValue(makeQueryResult<TagAggregation[]>(undefined))
    renderFilters()
    expect(screen.getByTestId('tag-input')).toHaveAttribute('data-suggestions', '')
  })

  it('reflects the current tags value', () => {
    renderFilters({ tags: ['music', 'comedy'] })
    expect(screen.getByTestId('tag-input')).toHaveValue('music,comedy')
  })

  it('forwards changes through onTagsChange', async () => {
    const user = userEvent.setup()
    const onTagsChange = vi.fn()
    renderFilters({ onTagsChange })

    // The stub input is controlled by the (spied, no-op) `value` prop, so it
    // never accumulates text — each keystroke fires onChange with a single
    // character. We only need to assert the prop is wired through to onChange.
    await user.type(screen.getByTestId('tag-input'), 'j')
    expect(onTagsChange).toHaveBeenLastCalledWith(['j'])
  })
})
