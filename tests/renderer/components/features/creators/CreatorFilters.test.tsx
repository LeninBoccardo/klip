import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreatorFilters } from '@/components/features/creators/CreatorFilters'

describe('CreatorFilters', () => {
  const defaultProps = {
    search: '',
    onSearchChange: vi.fn(),
    statusFilter: undefined,
    onStatusFilterChange: vi.fn()
  }

  it('renders search input', () => {
    render(<CreatorFilters {...defaultProps} />)
    expect(screen.getByPlaceholderText('Search creators...')).toBeInTheDocument()
  })

  it('calls onSearchChange when typing in search', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    render(<CreatorFilters {...defaultProps} onSearchChange={onSearchChange} />)

    const input = screen.getByPlaceholderText('Search creators...')
    await user.type(input, 'a')
    expect(onSearchChange).toHaveBeenCalled()
  })

  it('displays current search value', () => {
    render(<CreatorFilters {...defaultProps} search="hello" />)
    const input = screen.getByPlaceholderText('Search creators...')
    expect(input).toHaveValue('hello')
  })
})
