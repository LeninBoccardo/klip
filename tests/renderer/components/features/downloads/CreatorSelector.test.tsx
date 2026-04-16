import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreatorSelector } from '@/components/features/downloads/CreatorSelector'

describe('CreatorSelector', () => {
  it('renders label text', () => {
    const { container } = render(<CreatorSelector value="" onChange={vi.fn()} />)
    expect(container.textContent).toContain('Creator name')
  })

  it('renders placeholder', () => {
    render(<CreatorSelector value="" onChange={vi.fn()} />)
    expect(screen.getByPlaceholderText('e.g. MrBeast')).toBeInTheDocument()
  })

  it('displays current value', () => {
    render(<CreatorSelector value="PewDiePie" onChange={vi.fn()} />)
    expect(screen.getByDisplayValue('PewDiePie')).toBeInTheDocument()
  })

  it('calls onChange when typing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CreatorSelector value="" onChange={onChange} />)

    await user.type(screen.getByPlaceholderText('e.g. MrBeast'), 'a')
    expect(onChange).toHaveBeenCalled()
  })
})
