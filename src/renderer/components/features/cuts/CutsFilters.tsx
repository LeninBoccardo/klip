import { useTranslation } from 'react-i18next'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText
} from '@/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { TagInput } from '@/components/shared/TagInput'
import { useAllDistinctTags } from '@/hooks/use-tags'
import { useCreatorsPaginated } from '@/hooks/use-creators'
import { Search } from 'lucide-react'
import type { EntityStatus, SortDirection } from '@shared/types'

const STATUS_VALUES = ['active', 'all', 'deleted', 'missing'] as const
const SORT_VALUES = ['recent', 'oldest', 'longest', 'shortest'] as const

export type CutsSortKey = (typeof SORT_VALUES)[number]

// eslint-disable-next-line react-refresh/only-export-components
export function sortKeyToParams(key: CutsSortKey): {
  sortBy: 'createdAt' | 'duration'
  sortDirection: SortDirection
} {
  switch (key) {
    case 'recent':
      return { sortBy: 'createdAt', sortDirection: 'desc' }
    case 'oldest':
      return { sortBy: 'createdAt', sortDirection: 'asc' }
    case 'longest':
      return { sortBy: 'duration', sortDirection: 'desc' }
    case 'shortest':
      return { sortBy: 'duration', sortDirection: 'asc' }
  }
}

interface CutsFiltersProps {
  search: string
  onSearchChange: (value: string) => void
  statusFilter: EntityStatus[] | undefined
  onStatusFilterChange: (value: EntityStatus[] | undefined) => void
  creatorId: string | undefined
  onCreatorChange: (id: string | undefined) => void
  tags: string[]
  onTagsChange: (tags: string[]) => void
  sort: CutsSortKey
  onSortChange: (sort: CutsSortKey) => void
}

const ALL_CREATORS = '__all__'

export function CutsFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  creatorId,
  onCreatorChange,
  tags,
  onTagsChange,
  sort,
  onSortChange
}: CutsFiltersProps): React.ReactElement {
  const { t } = useTranslation('cuts')
  const { data: distinctTags } = useAllDistinctTags()
  // 500 covers the documented scaling baseline; if a user has more creators
  // than that we'll surface it as a follow-up (likely as a typeahead).
  const { data: creators } = useCreatorsPaginated({ page: 1, pageSize: 500 })

  const currentStatusValue =
    !statusFilter || (statusFilter.length === 1 && statusFilter[0] === 'active')
      ? 'active'
      : statusFilter.length === 3
        ? 'all'
        : (statusFilter[0] ?? 'active')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <InputGroup className="min-w-[12rem] flex-1">
          <InputGroupAddon>
            <InputGroupText>
              <Search />
            </InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            placeholder={t('filters.searchPlaceholder')}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </InputGroup>

        <Select
          value={creatorId ?? ALL_CREATORS}
          onValueChange={(val) => onCreatorChange(val === ALL_CREATORS ? undefined : val)}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CREATORS}>{t('filters.creatorAll')}</SelectItem>
            {creators?.data.map((creator) => (
              <SelectItem key={creator.id} value={creator.id}>
                {creator.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={currentStatusValue}
          onValueChange={(val) => {
            if (val === 'all') {
              onStatusFilterChange(['active', 'deleted', 'missing'])
            } else {
              onStatusFilterChange([val as EntityStatus])
            }
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`filters.status.${value}` as const)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(val) => onSortChange(val as CutsSortKey)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`filters.sort.${value}` as const)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <TagInput
        value={tags}
        onChange={onTagsChange}
        suggestions={distinctTags?.map((d) => d.tag) ?? []}
        placeholder={t('filters.tagsPlaceholder')}
      />
    </div>
  )
}
