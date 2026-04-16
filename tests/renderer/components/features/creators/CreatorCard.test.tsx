import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreatorCard } from '@/components/features/creators/CreatorCard'
import { makeCreatorDto } from '../../../helpers/test-utils'

describe('CreatorCard', () => {
  it('renders creator name and folder name', () => {
    const creator = makeCreatorDto({ name: 'MrBeast', folderName: 'mrbeast' })
    render(<CreatorCard creator={creator} />)

    expect(screen.getByText('MrBeast')).toBeInTheDocument()
    expect(screen.getByText('mrbeast')).toBeInTheDocument()
  })

  it('renders status badge', () => {
    const creator = makeCreatorDto({ status: 'deleted' })
    render(<CreatorCard creator={creator} />)
    expect(screen.getByText('Deleted')).toBeInTheDocument()
  })

  it('renders initials in avatar fallback', () => {
    const creator = makeCreatorDto({ name: 'John Doe' })
    render(<CreatorCard creator={creator} />)
    expect(screen.getByText('JD')).toBeInTheDocument()
  })

  it('renders single initial for single-word names', () => {
    const creator = makeCreatorDto({ name: 'Pewdiepie' })
    render(<CreatorCard creator={creator} />)
    expect(screen.getByText('P')).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const { container } = render(<CreatorCard creator={makeCreatorDto()} onClick={onClick} />)

    const card = container.querySelector('[data-slot="card"]') || container.firstElementChild!
    await user.click(card)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('applies custom className', () => {
    const { container } = render(<CreatorCard creator={makeCreatorDto()} className="my-custom" />)
    expect(container.querySelector('.my-custom')).not.toBeNull()
  })
})
