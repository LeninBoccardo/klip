import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaginationControls } from '@/components/shared/PaginationControls'

describe('PaginationControls', () => {
  it('renders nothing when totalPages is 1', () => {
    const { container } = render(
      <PaginationControls page={1} totalPages={1} onPageChange={vi.fn()} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when totalPages is 0', () => {
    const { container } = render(
      <PaginationControls page={1} totalPages={0} onPageChange={vi.fn()} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders page numbers for small page counts', () => {
    render(<PaginationControls page={1} totalPages={3} onPageChange={vi.fn()} />)
    const nav = screen.getByRole('navigation', { name: 'pagination' })
    expect(within(nav).getByText('1')).toBeInTheDocument()
    expect(within(nav).getByText('2')).toBeInTheDocument()
    expect(within(nav).getByText('3')).toBeInTheDocument()
  })

  it('calls onPageChange when a page number is clicked', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(<PaginationControls page={1} totalPages={5} onPageChange={onPageChange} />)

    const links = screen.getAllByText('3')
    await user.click(links[0])
    expect(onPageChange).toHaveBeenCalledWith(3)
  })

  it('calls onPageChange with next page on Next click', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(<PaginationControls page={2} totalPages={5} onPageChange={onPageChange} />)

    const nextButton = screen.getByLabelText('Go to next page')
    await user.click(nextButton)
    expect(onPageChange).toHaveBeenCalledWith(3)
  })

  it('calls onPageChange with previous page on Previous click', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(<PaginationControls page={3} totalPages={5} onPageChange={onPageChange} />)

    const prevButton = screen.getByLabelText('Go to previous page')
    await user.click(prevButton)
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('disables Previous on first page', () => {
    render(<PaginationControls page={1} totalPages={5} onPageChange={vi.fn()} />)
    const prevButton = screen.getByLabelText('Go to previous page')
    expect(prevButton).toHaveAttribute('aria-disabled', 'true')
  })

  it('disables Next on last page', () => {
    render(<PaginationControls page={5} totalPages={5} onPageChange={vi.fn()} />)
    const nextButton = screen.getByLabelText('Go to next page')
    expect(nextButton).toHaveAttribute('aria-disabled', 'true')
  })

  it('shows ellipsis for many pages', () => {
    render(<PaginationControls page={5} totalPages={10} onPageChange={vi.fn()} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    const ellipses = screen.getAllByText('More pages')
    expect(ellipses.length).toBeGreaterThanOrEqual(1)
  })
})
