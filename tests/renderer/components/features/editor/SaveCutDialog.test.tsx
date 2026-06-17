import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SaveCutDialog } from '@/components/features/editor/SaveCutDialog'
import { useEditorStore } from '@/hooks/use-editor-store'

// Saveability + recipe projection are covered by recipe-from-timeline's own
// tests; stub them so the dialog is in a submittable state regardless of the
// (mocked) timeline shape.
vi.mock('@/lib/recipe-from-timeline', () => ({
  isTimelineSaveable: () => true,
  recipeFromTimeline: () => ({
    version: 1,
    sourceVideoId: 'vid-1',
    ops: [{ type: 'trim', in: 1, out: 2 }],
    output: { container: 'mp4', mode: 'copy' }
  })
}))

vi.mock('@/hooks/use-tags', () => ({
  useAllDistinctTags: () => ({ data: [] })
}))

const editorStartRender = vi.fn()

beforeEach(() => {
  editorStartRender.mockReset()
  Object.defineProperty(window, 'api', {
    value: { editorStartRender },
    writable: true,
    configurable: true
  })
  act(() => {
    // Any non-null timeline — isTimelineSaveable is stubbed true.
    useEditorStore.setState({ timeline: {} as never, renderMode: 'copy' })
  })
})

describe('SaveCutDialog double-submit guard (F12)', () => {
  it('fires editorStartRender once when the submit button is clicked twice synchronously', async () => {
    // Hold the IPC promise open so the second click lands while the first is
    // still in flight — the actual double-click race (submitting state hasn't
    // committed, so the button isn't disabled yet).
    let resolveRender: (v: unknown) => void = () => {}
    editorStartRender.mockReturnValue(
      new Promise((res) => {
        resolveRender = res
      })
    )

    const user = userEvent.setup()
    render(<SaveCutDialog open onOpenChange={vi.fn()} />)

    await user.type(screen.getByLabelText('Title'), 'My cut')

    const submit = screen.getByRole('button', { name: 'Save cut' })
    // Both clicks inside ONE act() so React does NOT commit between them: the
    // button stays enabled (disabled={!canSubmit} reads the not-yet-committed
    // `submitting` state), so the `disabled` attribute can't stop the second
    // click — only the synchronous submittingRef guard can. Without the guard
    // this would call editorStartRender twice.
    act(() => {
      fireEvent.click(submit)
      fireEvent.click(submit)
    })

    expect(editorStartRender).toHaveBeenCalledTimes(1)

    // Resolve so the pending then/finally state updates flush cleanly.
    await act(async () => {
      resolveRender({ jobId: 'j1', cutId: 'c1' })
    })
  })

  it('submits when Enter is pressed in the title field (F27)', async () => {
    editorStartRender.mockResolvedValue({ jobId: 'j1', cutId: 'c1' })
    const user = userEvent.setup()
    render(<SaveCutDialog open onOpenChange={vi.fn()} />)

    const title = screen.getByLabelText('Title')
    await user.type(title, 'My cut')
    // Enter in the autofocused single field should submit (no mouse needed).
    await user.type(title, '{Enter}')

    expect(editorStartRender).toHaveBeenCalledTimes(1)
  })
})
