import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CreatorHeader } from '@/components/features/creators/CreatorHeader'
import { createQueryWrapper, makeCreatorDto } from '../../../helpers/test-utils'

// CreatorHeader calls useQueryClient() (for cache invalidation on its actions),
// so it must render under a QueryClientProvider.
const wrapper = createQueryWrapper()

beforeEach(() => {
  // The DTO has no avatar, so the mount effect fires a silent background
  // refreshCreatorAvatar; stub it so the effect resolves instead of hitting an
  // undefined window.api.
  Object.defineProperty(window, 'api', {
    value: { refreshCreatorAvatar: vi.fn().mockResolvedValue({ refreshed: false }) },
    writable: true,
    configurable: true
  })
})

describe('CreatorHeader', () => {
  it('renders creator name', () => {
    render(<CreatorHeader creator={makeCreatorDto({ name: 'MrBeast' })} />, { wrapper })
    expect(screen.getByText('MrBeast')).toBeInTheDocument()
  })

  it('renders folder name', () => {
    render(<CreatorHeader creator={makeCreatorDto({ folderName: 'mrbeast' })} />, { wrapper })
    expect(screen.getByText('mrbeast')).toBeInTheDocument()
  })

  it('renders status badge', () => {
    render(<CreatorHeader creator={makeCreatorDto({ status: 'missing' })} />, { wrapper })
    expect(screen.getByText('Missing')).toBeInTheDocument()
  })

  it('renders avatar initials', () => {
    render(<CreatorHeader creator={makeCreatorDto({ name: 'Mark Rober' })} />, { wrapper })
    expect(screen.getByText('MR')).toBeInTheDocument()
  })
})
