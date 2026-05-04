import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SelectableEntity } from '@/components/shared/SelectableEntity'

describe('SelectableEntity — selectable=false', () => {
  it('renders the child untouched (no checkbox, no ring)', () => {
    render(
      <SelectableEntity selectable={false} selected={false} onToggle={vi.fn()}>
        <button data-testid="child">Open</button>
      </SelectableEntity>
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('does NOT intercept clicks on the child when not in selection mode', async () => {
    const childClick = vi.fn()
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(
      <SelectableEntity selectable={false} selected={false} onToggle={onToggle}>
        <button data-testid="child" onClick={childClick}>
          Open
        </button>
      </SelectableEntity>
    )

    await user.click(screen.getByTestId('child'))
    expect(childClick).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('forwards className to the wrapper div', () => {
    const { container } = render(
      <SelectableEntity
        selectable={false}
        selected={false}
        onToggle={vi.fn()}
        className="test-class"
      >
        <span>X</span>
      </SelectableEntity>
    )
    expect(container.querySelector('.test-class')).not.toBeNull()
  })
})

describe('SelectableEntity — selectable=true', () => {
  it('renders a checkbox reflecting the selected prop', () => {
    const { rerender } = render(
      <SelectableEntity selectable selected={false} onToggle={vi.fn()}>
        <span>card</span>
      </SelectableEntity>
    )
    expect(screen.getByRole('checkbox')).not.toBeChecked()

    rerender(
      <SelectableEntity selectable selected onToggle={vi.fn()}>
        <span>card</span>
      </SelectableEntity>
    )
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('clicking the wrapper fires onToggle and prevents the child onClick from running', async () => {
    const childClick = vi.fn()
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(
      <SelectableEntity selectable selected={false} onToggle={onToggle}>
        <button data-testid="child" onClick={childClick}>
          card
        </button>
      </SelectableEntity>
    )

    await user.click(screen.getByTestId('child'))
    expect(onToggle).toHaveBeenCalledTimes(1)
    // Capture-phase + stopPropagation contract: the child's own onClick is
    // intercepted while in selection mode.
    expect(childClick).not.toHaveBeenCalled()
  })

  it('shows the selected ring when selected=true', () => {
    const { container } = render(
      <SelectableEntity selectable selected onToggle={vi.fn()}>
        <span>card</span>
      </SelectableEntity>
    )
    const wrapper = container.firstElementChild
    expect(wrapper?.className).toContain('ring-primary')
  })

  it('omits the selected ring when selected=false', () => {
    const { container } = render(
      <SelectableEntity selectable selected={false} onToggle={vi.fn()}>
        <span>card</span>
      </SelectableEntity>
    )
    const wrapper = container.firstElementChild
    expect(wrapper?.className).not.toContain('ring-primary')
  })

  it('the checkbox click forwards to onToggle without double-firing the wrapper handler', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(
      <SelectableEntity selectable selected={false} onToggle={onToggle}>
        <span>card</span>
      </SelectableEntity>
    )

    await user.click(screen.getByRole('checkbox'))
    // The wrapper's `onClickCapture` AND the checkbox's `onCheckedChange` both
    // call onToggle — the test guards against an off-by-one regression where
    // the checkbox click is suppressed entirely.
    expect(onToggle).toHaveBeenCalled()
  })
})
