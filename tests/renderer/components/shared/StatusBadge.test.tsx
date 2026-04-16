import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from '@/components/shared/StatusBadge'

describe('StatusBadge', () => {
  it('renders "Active" for active status', () => {
    render(<StatusBadge status="active" />)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders "Deleted" for deleted status', () => {
    render(<StatusBadge status="deleted" />)
    expect(screen.getByText('Deleted')).toBeInTheDocument()
  })

  it('renders "Missing" for missing status', () => {
    render(<StatusBadge status="missing" />)
    expect(screen.getByText('Missing')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<StatusBadge status="active" className="my-class" />)
    expect(container.firstChild).toHaveClass('my-class')
  })
})
