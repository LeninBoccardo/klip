import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageContainer } from '@/components/shared/PageContainer'

describe('PageContainer', () => {
  it('renders children', () => {
    render(
      <PageContainer>
        <div data-testid="child">Hello</div>
      </PageContainer>
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('applies the max-width constraint class', () => {
    const { container } = render(
      <PageContainer>
        <span>Content</span>
      </PageContainer>
    )
    const inner = container.querySelector('.max-w-6xl')
    expect(inner).not.toBeNull()
  })

  it('applies custom className', () => {
    const { container } = render(
      <PageContainer className="my-custom">
        <span>Content</span>
      </PageContainer>
    )
    const inner = container.querySelector('.my-custom')
    expect(inner).not.toBeNull()
  })

  it('wraps content in a ScrollArea', () => {
    const { container } = render(
      <PageContainer>
        <span>Content</span>
      </PageContainer>
    )
    const scrollArea = container.querySelector('[data-slot="scroll-area"]')
    expect(scrollArea).not.toBeNull()
  })
})
