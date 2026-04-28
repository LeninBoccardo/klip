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
import { Search } from 'lucide-react'
import type { EntityStatus } from '@shared/types'

interface CreatorFiltersProps {
  search: string
  onSearchChange: (value: string) => void
  statusFilter: EntityStatus[] | undefined
  onStatusFilterChange: (value: EntityStatus[] | undefined) => void
}

const statusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'All', value: 'all' },
  { label: 'Deleted', value: 'deleted' },
  { label: 'Missing', value: 'missing' }
] as const

export function CreatorFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange
}: CreatorFiltersProps): React.ReactElement {
  const currentStatusValue =
    !statusFilter || (statusFilter.length === 1 && statusFilter[0] === 'active')
      ? 'active'
      : statusFilter.length === 3
        ? 'all'
        : (statusFilter[0] ?? 'active')

  return (
    <div className="flex items-center gap-3">
      <InputGroup className="flex-1">
        <InputGroupAddon>
          <InputGroupText>
            <Search />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search creators..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </InputGroup>
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
          {statusOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
