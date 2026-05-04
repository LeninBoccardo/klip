import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@renderer/i18n'
import { TopCreatorsList } from '@/components/features/dashboard/TopCreatorsList'
import type { LibraryStats } from '@shared/types'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock
}))

const tDashboard = (key: string, params?: Record<string, unknown>): string =>
  i18n.t(key, { ns: 'dashboard', ...params })

beforeEach(() => {
  navigateMock.mockReset()
})

type Creators = LibraryStats['topCreators']

describe('TopCreatorsList', () => {
  it('renders the empty-state copy when no creators are present', () => {
    render(<TopCreatorsList creators={[] as Creators} />)
    expect(screen.getByText(tDashboard('charts.noData'))).toBeInTheDocument()
  })

  it('renders one row per creator with rank index and video-count copy', () => {
    const creators: Creators = [
      { creatorId: 'c-1', name: 'Alice', videoCount: 10 },
      { creatorId: 'c-2', name: 'Bob', videoCount: 4 },
      { creatorId: 'c-3', name: 'Carol', videoCount: 1 }
    ]
    render(<TopCreatorsList creators={creators} />)

    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Carol')).toBeInTheDocument()
    expect(screen.getByText('1.')).toBeInTheDocument()
    expect(screen.getByText('3.')).toBeInTheDocument()
    expect(
      screen.getByText(tDashboard('topCreators.videoCount', { count: 10 }))
    ).toBeInTheDocument()
    expect(screen.getByText(tDashboard('topCreators.videoCount', { count: 1 }))).toBeInTheDocument()
  })

  it('clicking a row navigates to the creator detail route', async () => {
    const creators: Creators = [{ creatorId: 'c-9', name: 'Dora', videoCount: 7 }]
    const user = userEvent.setup()
    render(<TopCreatorsList creators={creators} />)

    await user.click(screen.getByRole('button', { name: /Dora/i }))
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/creators/$creatorId',
      params: { creatorId: 'c-9' }
    })
  })

  it('bar-width formula: top creator gets 100%, others scale proportionally', () => {
    const creators: Creators = [
      { creatorId: 'c-1', name: 'Top', videoCount: 10 },
      { creatorId: 'c-2', name: 'Half', videoCount: 5 }
    ]
    const { container } = render(<TopCreatorsList creators={creators} />)

    const bars = container.querySelectorAll<HTMLDivElement>('.bg-primary')
    expect(bars[0]?.style.width).toBe('100%')
    expect(bars[1]?.style.width).toBe('50%')
  })

  it('divide-by-zero guard: a top creator with 0 videos still renders without crashing', () => {
    // The component falls back to `?? 1` when the head is missing, but a head
    // with 0 videoCount needs the same defensive treatment to avoid NaN width.
    const creators: Creators = [{ creatorId: 'c-1', name: 'Empty', videoCount: 0 }]
    render(<TopCreatorsList creators={creators} />)
    expect(screen.getByText('Empty')).toBeInTheDocument()
  })
})
