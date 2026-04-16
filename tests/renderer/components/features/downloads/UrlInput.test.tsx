import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UrlInput } from '@/components/features/downloads/UrlInput'

describe('UrlInput', () => {
  it('renders the input and button', () => {
    render(<UrlInput onSubmit={vi.fn()} />)
    expect(screen.getByPlaceholderText('Paste a video URL...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /fetch info/i })).toBeInTheDocument()
  })

  it('calls onSubmit with the URL on form submit', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<UrlInput onSubmit={onSubmit} />)

    await user.type(
      screen.getByPlaceholderText('Paste a video URL...'),
      'https://youtube.com/watch?v=abc'
    )
    await user.click(screen.getByRole('button', { name: /fetch info/i }))

    expect(onSubmit).toHaveBeenCalledWith('https://youtube.com/watch?v=abc')
  })

  it('disables button when isLoading is true', () => {
    render(<UrlInput onSubmit={vi.fn()} isLoading />)
    expect(screen.getByRole('button', { name: /fetch info/i })).toBeDisabled()
  })

  it('does not submit for invalid URL', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<UrlInput onSubmit={onSubmit} />)

    await user.type(screen.getByPlaceholderText('Paste a video URL...'), 'not-a-url')
    await user.click(screen.getByRole('button', { name: /fetch info/i }))

    expect(onSubmit).not.toHaveBeenCalled()
  })
})
