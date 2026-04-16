import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VideoInfoPreview } from '@/components/features/downloads/VideoInfoPreview'
import { makeVideoInfo } from '../../../helpers/test-utils'

describe('VideoInfoPreview', () => {
  it('renders the video title', () => {
    render(<VideoInfoPreview info={makeVideoInfo({ title: 'Cool Video' })} />)
    expect(screen.getByText('Cool Video')).toBeInTheDocument()
  })

  it('renders channel name', () => {
    render(<VideoInfoPreview info={makeVideoInfo({ channel: 'TestChannel' })} />)
    expect(screen.getByText('TestChannel')).toBeInTheDocument()
  })

  it('renders formatted duration', () => {
    render(<VideoInfoPreview info={makeVideoInfo({ duration: 3661 })} />)
    expect(screen.getByText('1:01:01')).toBeInTheDocument()
  })

  it('renders description', () => {
    render(<VideoInfoPreview info={makeVideoInfo({ description: 'A cool description' })} />)
    expect(screen.getByText('A cool description')).toBeInTheDocument()
  })

  it('does not render channel when null', () => {
    const { container } = render(<VideoInfoPreview info={makeVideoInfo({ channel: null })} />)
    // Should not contain the default channel text
    expect(container.textContent).not.toContain('Test Channel')
  })

  it('does not render description when null', () => {
    render(<VideoInfoPreview info={makeVideoInfo({ description: null })} />)
    expect(screen.getByText('Test Video Title')).toBeInTheDocument()
  })

  it('does not render duration when null', () => {
    const { container } = render(<VideoInfoPreview info={makeVideoInfo({ duration: null })} />)
    // No time pattern should appear
    expect(container.textContent).not.toMatch(/\d+:\d{2}/)
  })
})
