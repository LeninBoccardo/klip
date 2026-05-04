import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCard } from '@/components/features/dashboard/StatCard'

describe('StatCard', () => {
  it('renders the label and value', () => {
    render(<StatCard label="Videos" value="42" />)
    expect(screen.getByText('Videos')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders the optional hint when provided', () => {
    render(<StatCard label="Storage" value="12 GB" hint="across 3 creators" />)
    expect(screen.getByText('across 3 creators')).toBeInTheDocument()
  })

  it('omits the hint when not provided', () => {
    render(<StatCard label="Storage" value="12 GB" />)
    expect(screen.queryByText(/across/i)).not.toBeInTheDocument()
  })

  it('renders the optional icon node', () => {
    render(<StatCard label="X" value="1" icon={<span data-testid="icon">★</span>} />)
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('forwards className to the wrapper', () => {
    const { container } = render(<StatCard label="X" value="1" className="test-class" />)
    expect(container.querySelector('.test-class')).not.toBeNull()
  })
})
