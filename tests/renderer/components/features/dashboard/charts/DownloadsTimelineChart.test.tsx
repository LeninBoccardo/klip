import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '@renderer/i18n'
import { DownloadsTimelineChart } from '@/components/features/dashboard/charts/DownloadsTimelineChart'

const tDashboard = (key: string): string => i18n.t(key, { ns: 'dashboard' })

describe('DownloadsTimelineChart', () => {
  it('renders the no-data copy when every day has count=0', () => {
    const empty = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      count: 0
    }))
    render(<DownloadsTimelineChart data={empty} />)
    expect(screen.getByText(tDashboard('charts.noData'))).toBeInTheDocument()
  })

  it('renders the no-data copy on an empty array', () => {
    render(<DownloadsTimelineChart data={[]} />)
    expect(screen.getByText(tDashboard('charts.noData'))).toBeInTheDocument()
  })

  it('renders a chart container when at least one day has count > 0', () => {
    const data = [
      { date: '2026-01-01', count: 0 },
      { date: '2026-01-02', count: 3 },
      { date: '2026-01-03', count: 0 }
    ]
    const { container } = render(<DownloadsTimelineChart data={data} />)
    expect(container.querySelector('.recharts-responsive-container')).not.toBeNull()
    expect(screen.queryByText(tDashboard('charts.noData'))).not.toBeInTheDocument()
  })
})
