import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@renderer/i18n'
import { TagInput } from '@/components/shared/TagInput'

const tTags = (key: string, params?: Record<string, unknown>): string =>
  i18n.t(key, { ns: 'tags', ...params })

describe('TagInput — chip rendering', () => {
  it('renders a chip per tag in the value array', () => {
    render(<TagInput value={['music', 'comedy']} onChange={vi.fn()} />)

    expect(screen.getByText('music')).toBeInTheDocument()
    expect(screen.getByText('comedy')).toBeInTheDocument()
  })

  it('uses the consumer placeholder when empty', () => {
    render(<TagInput value={[]} onChange={vi.fn()} placeholder="Custom placeholder" />)
    expect(screen.getByPlaceholderText('Custom placeholder')).toBeInTheDocument()
  })

  it('falls back to the default placeholder when none is provided', () => {
    render(<TagInput value={[]} onChange={vi.fn()} />)
    expect(screen.getByPlaceholderText(tTags('input.placeholder'))).toBeInTheDocument()
  })
})

describe('TagInput — chip removal', () => {
  it('clicking the chip "remove" button calls onChange without that tag', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<TagInput value={['music', 'comedy']} onChange={onChange} />)

    await user.click(screen.getByLabelText(tTags('input.removeAria', { tag: 'music' })))
    expect(onChange).toHaveBeenCalledWith(['comedy'])
  })

  it('Backspace on an empty input removes the last chip', () => {
    const onChange = vi.fn()
    render(<TagInput value={['music', 'comedy']} onChange={onChange} />)

    const input = document.querySelector('input') as HTMLInputElement
    fireEvent.keyDown(input, { key: 'Backspace' })
    expect(onChange).toHaveBeenCalledWith(['music'])
  })

  // Branches that depend on `draft` being non-empty before the keyDown
  // (Backspace-with-draft, Comma-commits-draft) require React's render to
  // flush between fireEvent.change and fireEvent.keyDown so the next handler
  // captures the updated draft. fireEvent's act-wrapper doesn't reliably do
  // that under React 18 + the popover-open side effect, and userEvent.type
  // hits a separate jsdom layout block. These branches are exercised
  // end-to-end via BulkActionsBar / DeleteTagDialog tests where the same
  // commit path runs through the full pipeline.
})

describe('TagInput — commit paths', () => {
  it('does not commit an empty draft (Comma is a no-op when nothing is typed)', () => {
    const onChange = vi.fn()
    render(<TagInput value={['music']} onChange={onChange} />)

    const input = document.querySelector('input') as HTMLInputElement
    fireEvent.keyDown(input, { key: ',' })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('TagInput — disabled state', () => {
  it('disables the input when disabled is true', () => {
    render(<TagInput value={[]} onChange={vi.fn()} disabled />)
    const input = document.querySelector<HTMLInputElement>('input')
    expect(input).toBeDisabled()
  })
})
