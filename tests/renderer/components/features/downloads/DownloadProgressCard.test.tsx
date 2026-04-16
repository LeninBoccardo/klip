import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DownloadProgressCard } from '@/components/features/downloads/DownloadProgressCard'
import { makeDownloadProgress } from '../../../helpers/test-utils'

describe('DownloadProgressCard', () => {
  it('renders the URL', () => {
    render(
      <DownloadProgressCard
        progress={makeDownloadProgress({ url: 'https://youtube.com/watch?v=test' })}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('https://youtube.com/watch?v=test')).toBeInTheDocument()
  })

  it('renders status text', () => {
    render(
      <DownloadProgressCard
        progress={makeDownloadProgress({ status: 'downloading' })}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('downloading')).toBeInTheDocument()
  })

  it('renders percentage', () => {
    const { container } = render(
      <DownloadProgressCard progress={makeDownloadProgress({ percent: 75 })} onCancel={vi.fn()} />
    )
    expect(container.textContent).toContain('75%')
  })

  it('renders speed when present', () => {
    const { container } = render(
      <DownloadProgressCard
        progress={makeDownloadProgress({ speed: '2.5 MB/s' })}
        onCancel={vi.fn()}
      />
    )
    expect(container.textContent).toContain('2.5 MB/s')
  })

  it('renders ETA when present', () => {
    const { container } = render(
      <DownloadProgressCard progress={makeDownloadProgress({ eta: '01:30' })} onCancel={vi.fn()} />
    )
    expect(container.textContent).toContain('ETA 01:30')
  })

  it('shows cancel button for active downloads', () => {
    render(
      <DownloadProgressCard
        progress={makeDownloadProgress({ status: 'downloading' })}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <DownloadProgressCard
        progress={makeDownloadProgress({ downloadId: 'dl-42', status: 'downloading' })}
        onCancel={onCancel}
      />
    )
    await user.click(screen.getByRole('button'))
    expect(onCancel).toHaveBeenCalledWith('dl-42')
  })

  it('hides cancel button for completed downloads', () => {
    render(
      <DownloadProgressCard
        progress={makeDownloadProgress({ status: 'complete' })}
        onCancel={vi.fn()}
      />
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('hides cancel button for errored downloads', () => {
    render(
      <DownloadProgressCard
        progress={makeDownloadProgress({ status: 'error' })}
        onCancel={vi.fn()}
      />
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('hides cancel button for cancelled downloads', () => {
    render(
      <DownloadProgressCard
        progress={makeDownloadProgress({ status: 'cancelled' })}
        onCancel={vi.fn()}
      />
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
