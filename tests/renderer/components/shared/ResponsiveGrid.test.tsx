import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResponsiveGrid } from '@/components/shared/ResponsiveGrid'

describe('ResponsiveGrid', () => {
  it('renders children', () => {
    render(
      <ResponsiveGrid>
        <div data-testid="item">Item</div>
      </ResponsiveGrid>
    )
    expect(screen.getByTestId('item')).toBeInTheDocument()
  })

  it('applies grid class', () => {
    const { container } = render(
      <ResponsiveGrid>
        <div>Item</div>
      </ResponsiveGrid>
    )
    expect(container.firstChild).toHaveClass('grid')
  })

  it('applies media columns by default', () => {
    const { container } = render(
      <ResponsiveGrid>
        <div>Item</div>
      </ResponsiveGrid>
    )
    expect(container.firstChild).toHaveClass('grid-cols-1')
  })

  it('applies wide columns variant', () => {
    const { container } = render(
      <ResponsiveGrid columns="wide">
        <div>Item</div>
      </ResponsiveGrid>
    )
    expect(container.firstChild).toHaveClass('grid-cols-1')
    expect(container.firstChild).toHaveClass('lg:grid-cols-3')
  })

  it('applies two columns variant', () => {
    const { container } = render(
      <ResponsiveGrid columns="two">
        <div>Item</div>
      </ResponsiveGrid>
    )
    expect(container.firstChild).toHaveClass('md:grid-cols-2')
  })

  it('applies custom className', () => {
    const { container } = render(
      <ResponsiveGrid className="my-grid">
        <div>Item</div>
      </ResponsiveGrid>
    )
    expect(container.firstChild).toHaveClass('my-grid')
  })
})
