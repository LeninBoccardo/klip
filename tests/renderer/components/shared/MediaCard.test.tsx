import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MediaCard } from '@/components/shared/MediaCard'

describe('MediaCard', () => {
  const defaultProps = {
    title: 'My Video',
    status: 'active' as const,
    thumbnailPath: null,
    duration: 125,
    resolution: '1920x1080',
    fileSize: 50 * 1024 * 1024
  }

  it('renders the title', () => {
    render(<MediaCard {...defaultProps} />)
    expect(screen.getByText('My Video')).toBeInTheDocument()
  })

  it('renders the status badge', () => {
    render(<MediaCard {...defaultProps} />)
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1)
  })

  it('renders formatted duration overlay', () => {
    render(<MediaCard {...defaultProps} />)
    // Duration renders both in overlay and possibly in metadata
    expect(screen.getAllByText('2:05').length).toBeGreaterThanOrEqual(1)
  })

  it('renders resolution and file size', () => {
    render(<MediaCard {...defaultProps} />)
    expect(screen.getByText('1920x1080 · 50.0 MB')).toBeInTheDocument()
  })

  it('renders dash when no resolution or file size', () => {
    render(<MediaCard {...defaultProps} resolution={null} fileSize={null} />)
    // The metadata line should show dash
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(1)
  })

  it('renders placeholder icon when no thumbnail', () => {
    render(<MediaCard {...defaultProps} thumbnailPath={null} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders img when thumbnail path is provided', () => {
    render(<MediaCard {...defaultProps} thumbnailPath="C:\\thumb.jpg" />)
    const img = screen.getByRole('img', { name: 'My Video' })
    expect(img).toHaveAttribute('src', expect.stringContaining('klip-media://'))
  })

  it('calls onClick when card is clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const { container } = render(<MediaCard {...defaultProps} onClick={onClick} />)

    // Click the card element itself
    const card = container.querySelector('[data-slot="card"]') || container.firstElementChild!
    await user.click(card)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not render duration overlay when null', () => {
    render(<MediaCard {...defaultProps} duration={null} />)
    // No formatted time should appear (no colon-separated time)
    const allText = document.body.textContent || ''
    expect(allText).not.toMatch(/\d+:\d{2}/)
  })

  it('renders children instead of card when children are provided', () => {
    render(
      <MediaCard {...defaultProps}>
        <div data-testid="custom-child">Custom</div>
      </MediaCard>
    )
    expect(screen.getByTestId('custom-child')).toBeInTheDocument()
  })
})
