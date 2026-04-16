import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CreatorHeader } from '@/components/features/creators/CreatorHeader'
import { makeCreatorDto } from '../../../helpers/test-utils'

describe('CreatorHeader', () => {
  it('renders creator name', () => {
    render(<CreatorHeader creator={makeCreatorDto({ name: 'MrBeast' })} />)
    expect(screen.getByText('MrBeast')).toBeInTheDocument()
  })

  it('renders folder name', () => {
    render(<CreatorHeader creator={makeCreatorDto({ folderName: 'mrbeast' })} />)
    expect(screen.getByText('mrbeast')).toBeInTheDocument()
  })

  it('renders status badge', () => {
    render(<CreatorHeader creator={makeCreatorDto({ status: 'missing' })} />)
    expect(screen.getByText('Missing')).toBeInTheDocument()
  })

  it('renders avatar initials', () => {
    render(<CreatorHeader creator={makeCreatorDto({ name: 'Mark Rober' })} />)
    expect(screen.getByText('MR')).toBeInTheDocument()
  })
})
