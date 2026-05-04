import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '@renderer/i18n'
import { VideosByStatusChart } from '@/components/features/dashboard/charts/VideosByStatusChart'

const tDashboard = (key: string): string => i18n.t(key, { ns: 'dashboard' })

describe('VideosByStatusChart', () => {
  it('renders the no-data copy when every status count is zero or unset', () => {
    render(<VideosByStatusChart byStatus={{}} />)
    expect(screen.getByText(tDashboard('charts.noData'))).toBeInTheDocument()
  })

  it('renders a chart when any status has a non-zero count', () => {
    const { container } = render(<VideosByStatusChart byStatus={{ active: 5 }} />)
    expect(container.querySelector('.recharts-responsive-container')).not.toBeNull()
    expect(screen.queryByText(tDashboard('charts.noData'))).not.toBeInTheDocument()
  })

  it('treats missing keys in byStatus as 0 (defaults to no-data when all are unset)', () => {
    // The component calls `byStatus[status] ?? 0` for active/missing/deleted —
    // a partial object with only zeros should still flip into the no-data
    // branch.
    render(<VideosByStatusChart byStatus={{ active: 0 }} />)
    expect(screen.getByText(tDashboard('charts.noData'))).toBeInTheDocument()
  })
})
