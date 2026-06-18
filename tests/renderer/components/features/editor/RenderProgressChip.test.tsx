import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { RenderProgressChip } from '@/components/features/editor/RenderProgressChip'
import type { RenderProgress, RenderJobStatus } from '@shared/types'

// Captured listener so each test can push synthetic `render-progress` events
// the same way main → renderer would over IPC.
let progressListener: ((event: unknown, data: RenderProgress) => void) | null = null

const unsubscribe = vi.fn()
const onRenderProgress = vi.fn((cb: (event: unknown, data: RenderProgress) => void) => {
  progressListener = cb
  return unsubscribe
})
const editorOpenWindow = vi.fn()

beforeEach(() => {
  progressListener = null
  unsubscribe.mockReset()
  onRenderProgress.mockClear()
  editorOpenWindow.mockReset()
  editorOpenWindow.mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    value: { onRenderProgress, editorOpenWindow },
    writable: true,
    configurable: true
  })
})

function makeProgress(overrides: Partial<RenderProgress> = {}): RenderProgress {
  return {
    jobId: 'job-1',
    cutId: 'cut-1',
    sourceVideoId: 'vid-1',
    status: 'rendering',
    percent: 42,
    ...overrides
  }
}

/** Mount the chip and push one progress event in a single committed pass. */
function emit(data: RenderProgress): void {
  act(() => {
    progressListener?.(null, data)
  })
}

describe('RenderProgressChip', () => {
  it('renders nothing before any render-progress event arrives', () => {
    const { container } = render(<RenderProgressChip />)
    expect(container.firstChild).toBeNull()
  })

  it('subscribes to render progress on mount and unsubscribes on unmount', () => {
    const { unmount } = render(<RenderProgressChip />)
    expect(onRenderProgress).toHaveBeenCalledTimes(1)
    expect(unsubscribe).not.toHaveBeenCalled()
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('shows the chip once a non-terminal snapshot arrives', () => {
    render(<RenderProgressChip />)
    emit(makeProgress({ status: 'queued', percent: null }))
    expect(screen.getByRole('button', { name: "Reopen the render's editor window" })).toBeInTheDocument()
    expect(screen.getByText('Render queued')).toBeInTheDocument()
  })

  // ── labelFor: every status branch ──

  it('labels a queued render', () => {
    render(<RenderProgressChip />)
    emit(makeProgress({ status: 'queued', percent: null }))
    expect(screen.getByText('Render queued')).toBeInTheDocument()
  })

  it('labels a rendering snapshot with the rounded percent when percent is known', () => {
    render(<RenderProgressChip />)
    emit(makeProgress({ status: 'rendering', percent: 42.7 }))
    // toFixed(0) rounds 42.7 → "43"
    expect(screen.getByText('Rendering · 43%')).toBeInTheDocument()
  })

  it('labels a rendering snapshot without a percent (pre-flight) using the indeterminate copy', () => {
    render(<RenderProgressChip />)
    emit(makeProgress({ status: 'rendering', percent: null }))
    expect(screen.getByText('Rendering…')).toBeInTheDocument()
  })

  it('labels a finalizing render', () => {
    render(<RenderProgressChip />)
    emit(makeProgress({ status: 'finalizing', percent: 99 }))
    expect(screen.getByText('Finalising')).toBeInTheDocument()
  })

  it('labels a complete render', () => {
    render(<RenderProgressChip />)
    emit(makeProgress({ status: 'complete', percent: 100 }))
    expect(screen.getByText('Cut saved')).toBeInTheDocument()
  })

  it('labels a cancelled render', () => {
    render(<RenderProgressChip />)
    emit(makeProgress({ status: 'cancelled', percent: null }))
    expect(screen.getByText('Render cancelled')).toBeInTheDocument()
  })

  it('labels an errored render', () => {
    render(<RenderProgressChip />)
    emit(makeProgress({ status: 'error', percent: null }))
    expect(screen.getByText('Render failed')).toBeInTheDocument()
  })

  // ── inFlight branch: Progress bar + dismiss-button visibility ──

  it.each<RenderJobStatus>(['queued', 'rendering', 'finalizing'])(
    'shows the progress bar and hides the dismiss button while %s (in-flight)',
    (status) => {
      render(<RenderProgressChip />)
      emit(makeProgress({ status, percent: 30 }))
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
      expect(screen.queryByLabelText('Dismiss')).not.toBeInTheDocument()
    }
  )

  it.each<RenderJobStatus>(['complete', 'cancelled', 'error'])(
    'hides the progress bar and shows the dismiss button when %s (terminal)',
    (status) => {
      render(<RenderProgressChip />)
      emit(makeProgress({ status, percent: 100 }))
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Dismiss')).toBeInTheDocument()
    }
  )

  it('renders the progress bar with a pulsing class while percent is null (pre-flight)', () => {
    render(<RenderProgressChip />)
    emit(makeProgress({ status: 'rendering', percent: null }))
    expect(screen.getByRole('progressbar')).toHaveClass('animate-pulse')
  })

  it('renders the progress bar without the pulsing class when percent is known', () => {
    render(<RenderProgressChip />)
    emit(makeProgress({ status: 'rendering', percent: 55 }))
    expect(screen.getByRole('progressbar')).not.toHaveClass('animate-pulse')
  })

  // ── handleClick: reopen the editor window ──

  it('reopens the editor window for the current source video when the chip is clicked', async () => {
    render(<RenderProgressChip />)
    emit(makeProgress({ status: 'rendering', percent: 10, sourceVideoId: 'vid-99' }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Reopen the render's editor window" }))
    })

    expect(editorOpenWindow).toHaveBeenCalledTimes(1)
    expect(editorOpenWindow).toHaveBeenCalledWith({ sourceVideoId: 'vid-99' })
  })

  // ── handleDismiss + stopPropagation ──

  it('dismisses the chip without reopening the editor when the dismiss button is clicked', () => {
    const { container } = render(<RenderProgressChip />)
    emit(makeProgress({ status: 'complete', percent: 100 }))

    act(() => {
      fireEvent.click(screen.getByLabelText('Dismiss'))
    })

    // stopPropagation prevents the outer button's handleClick from firing…
    expect(editorOpenWindow).not.toHaveBeenCalled()
    // …and handleDismiss clears the snapshot, removing the chip entirely.
    expect(container.firstChild).toBeNull()
  })

  // ── terminal-event auto-fade timer ──

  describe('terminal auto-fade timer', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
    })

    it.each<RenderJobStatus>(['complete', 'cancelled', 'error'])(
      'fades a %s snapshot after 4s',
      (status) => {
        render(<RenderProgressChip />)
        emit(makeProgress({ status, percent: 100 }))
        expect(screen.getByLabelText('Dismiss')).toBeInTheDocument()

        // Just before the deadline the chip is still on screen.
        act(() => {
          vi.advanceTimersByTime(3999)
        })
        expect(screen.queryByLabelText('Dismiss')).toBeInTheDocument()

        act(() => {
          vi.advanceTimersByTime(1)
        })
        expect(screen.queryByLabelText('Dismiss')).not.toBeInTheDocument()
      }
    )

    it('does not fade an in-flight snapshot', () => {
      render(<RenderProgressChip />)
      emit(makeProgress({ status: 'rendering', percent: 50 }))

      act(() => {
        vi.advanceTimersByTime(10_000)
      })
      // No timer scheduled for non-terminal states → chip stays put.
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })

    it('replaces the snapshot and resets the fade timer when a fresh event arrives before the deadline', () => {
      render(<RenderProgressChip />)
      emit(makeProgress({ status: 'complete', percent: 100 }))

      // Part-way through the terminal fade window, a new queued render arrives.
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      emit(makeProgress({ status: 'queued', percent: null }))

      // The previous (terminal) timer was cleared on snapshot change; the new
      // in-flight snapshot schedules no fade, so even past the old 4s deadline
      // the chip remains visible showing the new label.
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(screen.getByText('Render queued')).toBeInTheDocument()
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })
  })
})
