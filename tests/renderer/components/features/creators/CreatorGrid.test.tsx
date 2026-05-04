import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { CreatorGrid } from '@/components/features/creators/CreatorGrid'

describe('CreatorGrid', () => {
  it('renders its children', () => {
    const { getByText } = render(
      <CreatorGrid>
        <div>Card A</div>
        <div>Card B</div>
      </CreatorGrid>
    )
    expect(getByText('Card A')).toBeInTheDocument()
    expect(getByText('Card B')).toBeInTheDocument()
  })

  it('forwards a className alongside the responsive grid classes', () => {
    const { container } = render(
      <CreatorGrid className="custom-cls">
        <div />
      </CreatorGrid>
    )
    const grid = container.firstElementChild
    expect(grid?.className).toContain('custom-cls')
    // The responsive grid breakpoints are the load-bearing layout — make sure
    // a future refactor doesn't drop them silently.
    expect(grid?.className).toContain('grid-cols-1')
    expect(grid?.className).toContain('sm:grid-cols-2')
    expect(grid?.className).toContain('lg:grid-cols-3')
    expect(grid?.className).toContain('xl:grid-cols-4')
  })
})
