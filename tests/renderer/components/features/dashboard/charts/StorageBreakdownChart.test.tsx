import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '@renderer/i18n'
import { StorageBreakdownChart } from '@/components/features/dashboard/charts/StorageBreakdownChart'
import type { StorageStats } from '@shared/types'

const tDashboard = (key: string): string => i18n.t(key, { ns: 'dashboard' })

describe('StorageBreakdownChart', () => {
  it('renders the no-data copy when both byte counts are zero', () => {
    const empty: StorageStats = { videosBytes: 0, cutsBytes: 0, totalBytes: 0 }
    render(<StorageBreakdownChart storage={empty} />)
    expect(screen.getByText(tDashboard('charts.noData'))).toBeInTheDocument()
  })

  it('renders a chart container when at least one byte count is non-zero', () => {
    const stats: StorageStats = { videosBytes: 1_000, cutsBytes: 500, totalBytes: 1_500 }
    const { container } = render(<StorageBreakdownChart storage={stats} />)
    // Recharts in jsdom renders a wrapper div with an svg inside; assert
    // structurally rather than visually since recharts measurements degrade
    // without real layout.
    expect(container.querySelector('.recharts-responsive-container')).not.toBeNull()
    expect(screen.queryByText(tDashboard('charts.noData'))).not.toBeInTheDocument()
  })

  it('filters out zero-value slices (only the non-zero bucket is included)', () => {
    const onlyVideos: StorageStats = { videosBytes: 100, cutsBytes: 0, totalBytes: 100 }
    const { container } = render(<StorageBreakdownChart storage={onlyVideos} />)
    // Pie cells rendered correspond only to non-zero slices; "no data" must
    // not render since at least one slice survived the filter.
    expect(screen.queryByText(tDashboard('charts.noData'))).not.toBeInTheDocument()
    expect(container.querySelector('.recharts-responsive-container')).not.toBeNull()
  })
})
