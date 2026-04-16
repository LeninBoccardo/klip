import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageHeader } from '@/components/shared/PageHeader'

describe('PageHeader', () => {
  it('renders the title', () => {
    render(<PageHeader title="My Page" />)
    expect(screen.getByText('My Page')).toBeInTheDocument()
  })

  it('renders the description when provided', () => {
    render(<PageHeader title="Title" description="A helpful description" />)
    expect(screen.getByText('A helpful description')).toBeInTheDocument()
  })

  it('does not render description when not provided', () => {
    const { container } = render(<PageHeader title="Title" />)
    expect(container.querySelectorAll('p')).toHaveLength(0)
  })

  it('renders action slot', () => {
    render(<PageHeader title="Title" actions={<button data-testid="action-btn">Click</button>} />)
    expect(screen.getByTestId('action-btn')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<PageHeader title="Title" className="my-header" />)
    expect(container.firstChild).toHaveClass('my-header')
  })
})
