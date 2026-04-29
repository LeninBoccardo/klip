import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CollectionCard } from '@/components/features/collections/CollectionCard'
import type { CollectionDto } from '@shared/dtos'

function makeCollection(overrides: Partial<CollectionDto> = {}): CollectionDto {
  return {
    id: 'col-1',
    name: 'Favourites',
    description: null,
    kind: 'manual',
    itemCount: 3,
    createdAt: '',
    updatedAt: '',
    ...overrides
  }
}

describe('CollectionCard', () => {
  it('renders name + plural item count', () => {
    render(<CollectionCard collection={makeCollection({ name: 'A', itemCount: 3 })} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('3 items')).toBeInTheDocument()
  })

  it('uses singular item label for itemCount=1', () => {
    render(<CollectionCard collection={makeCollection({ itemCount: 1 })} />)
    expect(screen.getByText('1 item')).toBeInTheDocument()
  })

  it('renders the description when present', () => {
    render(<CollectionCard collection={makeCollection({ description: 'My picks' })} />)
    expect(screen.getByText('My picks')).toBeInTheDocument()
  })

  it('forwards click events', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<CollectionCard collection={makeCollection()} onClick={onClick} />)
    await user.click(screen.getByText('Favourites'))
    expect(onClick).toHaveBeenCalled()
  })
})
