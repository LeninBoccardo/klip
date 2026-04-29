import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CollectionContextMenu } from '@/components/features/collections/CollectionContextMenu'

describe('CollectionContextMenu', () => {
  it('fires onEdit when the Edit item is clicked', async () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const user = userEvent.setup()

    render(
      <CollectionContextMenu onEdit={onEdit} onDelete={onDelete}>
        <div data-testid="trigger">Right-click me</div>
      </CollectionContextMenu>
    )

    await user.pointer([
      { target: screen.getByTestId('trigger'), keys: '[MouseRight>]' },
      { keys: '[/MouseRight]' }
    ])

    await user.click(await screen.findByText('Edit'))
    expect(onEdit).toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('fires onDelete when the Delete item is clicked', async () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const user = userEvent.setup()

    render(
      <CollectionContextMenu onEdit={onEdit} onDelete={onDelete}>
        <div data-testid="trigger">Right-click me</div>
      </CollectionContextMenu>
    )

    await user.pointer([
      { target: screen.getByTestId('trigger'), keys: '[MouseRight>]' },
      { keys: '[/MouseRight]' }
    ])

    await user.click(await screen.findByText('Delete'))
    expect(onDelete).toHaveBeenCalled()
    expect(onEdit).not.toHaveBeenCalled()
  })
})
