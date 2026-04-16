import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MediaGrid } from '@/components/shared/MediaGrid'

describe('MediaGrid', () => {
  it('renders children', () => {
    render(
      <MediaGrid>
        <div data-testid="child-1">Item 1</div>
        <div data-testid="child-2">Item 2</div>
      </MediaGrid>
    )
    expect(screen.getByTestId('child-1')).toBeInTheDocument()
    expect(screen.getByTestId('child-2')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <MediaGrid className="custom-grid">
        <div>Item</div>
      </MediaGrid>
    )
    expect(container.firstChild).toHaveClass('custom-grid')
  })

  it('applies grid layout classes', () => {
    const { container } = render(
      <MediaGrid>
        <div>Item</div>
      </MediaGrid>
    )
    expect(container.firstChild).toHaveClass('grid')
  })
})
