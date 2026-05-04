import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@renderer/i18n'
import { TagContextMenu } from '@/components/features/tags/TagContextMenu'

const writeText = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args)
  }
}))

const tCommon = (key: string, params?: Record<string, unknown>): string =>
  i18n.t(key, { ns: 'common', ...params })

// Force userEvent's clipboard stub to install once, then we can patch its
// `writeText` slot per-test. Calling userEvent.setup() *first* triggers the
// install; subsequent setup calls in tests reuse the same stub.
userEvent.setup()
Object.defineProperty(navigator.clipboard, 'writeText', {
  value: writeText,
  writable: true,
  configurable: true
})

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator.clipboard, 'writeText', {
    value: writeText,
    writable: true,
    configurable: true
  })
  writeText.mockResolvedValue(undefined)
})

async function openMenu(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.pointer([
    { target: screen.getByTestId('trigger'), keys: '[MouseRight>]' },
    { keys: '[/MouseRight]' }
  ])
}

function renderMenu(
  props: Partial<{ tag: string; onRename: () => void; onDelete: () => void }> = {}
): {
  onRename: ReturnType<typeof vi.fn>
  onDelete: ReturnType<typeof vi.fn>
} {
  const onRename = (props.onRename ?? vi.fn()) as ReturnType<typeof vi.fn>
  const onDelete = (props.onDelete ?? vi.fn()) as ReturnType<typeof vi.fn>
  render(
    <TagContextMenu tag={props.tag ?? 'music'} onRename={onRename} onDelete={onDelete}>
      <div data-testid="trigger">Tag chip</div>
    </TagContextMenu>
  )
  return { onRename, onDelete }
}

describe('TagContextMenu', () => {
  it('Copy tag writes the tag value to the clipboard', async () => {
    renderMenu({ tag: 'music' })
    const user = userEvent.setup()
    await openMenu(user)

    await user.click(await screen.findByText(tCommon('actions.copyTag')))
    expect(writeText).toHaveBeenCalledWith('music')
    expect(toastSuccess).toHaveBeenCalledWith(tCommon('toasts.copied'))
  })

  it('Rename click invokes onRename', async () => {
    const { onRename } = renderMenu()
    const user = userEvent.setup()
    await openMenu(user)

    await user.click(await screen.findByText(tCommon('actions.rename')))
    expect(onRename).toHaveBeenCalledTimes(1)
  })

  it('Delete click invokes onDelete', async () => {
    const { onDelete } = renderMenu()
    const user = userEvent.setup()
    await openMenu(user)

    await user.click(await screen.findByText(tCommon('actions.delete')))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('clipboard failure toasts the error message', async () => {
    writeText.mockRejectedValueOnce(new Error('clipboard denied'))
    renderMenu({ tag: 'comedy' })
    const user = userEvent.setup()
    await openMenu(user)

    await user.click(await screen.findByText(tCommon('actions.copyTag')))
    expect(toastError).toHaveBeenCalledWith(
      tCommon('toasts.copyFailed', { message: 'clipboard denied' })
    )
  })
})
