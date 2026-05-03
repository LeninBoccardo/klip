import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UrlInput } from '@/components/features/downloads/UrlInput'

describe('UrlInput', () => {
  it('renders the input and button', () => {
    render(<UrlInput onSubmit={vi.fn()} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('calls onSubmit with the URL on form submit', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<UrlInput onSubmit={onSubmit} />)

    await user.type(screen.getByRole('textbox'), 'https://youtube.com/watch?v=abc')
    await user.click(screen.getByRole('button'))

    expect(onSubmit).toHaveBeenCalledWith('https://youtube.com/watch?v=abc')
  })

  it('disables button when isLoading is true', () => {
    render(<UrlInput onSubmit={vi.fn()} isLoading />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('does not submit for invalid URL', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<UrlInput onSubmit={onSubmit} />)

    await user.type(screen.getByRole('textbox'), 'not-a-url')
    await user.click(screen.getByRole('button'))

    expect(onSubmit).not.toHaveBeenCalled()
  })
})
