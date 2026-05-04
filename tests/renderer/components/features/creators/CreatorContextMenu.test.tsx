import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@renderer/i18n'
import { CreatorContextMenu } from '@/components/features/creators/CreatorContextMenu'
import type { EntityStatus } from '@shared/types'

const writeText = vi.fn()
const revealCreatorFolder = vi.fn()
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

// userEvent.setup() installs its own clipboard stub. Trigger the install
// once at module load and then patch the writeText slot — subsequent setup
// calls in tests reuse the same clipboard object and don't clobber our spy.
userEvent.setup()
Object.defineProperty(navigator.clipboard, 'writeText', {
  value: writeText,
  writable: true,
  configurable: true
})

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'api', {
    value: { revealCreatorFolder },
    writable: true,
    configurable: true
  })
  Object.defineProperty(navigator.clipboard, 'writeText', {
    value: writeText,
    writable: true,
    configurable: true
  })
  writeText.mockResolvedValue(undefined)
  revealCreatorFolder.mockResolvedValue({ ok: true })
})

async function openMenu(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.pointer([
    { target: screen.getByTestId('trigger'), keys: '[MouseRight>]' },
    { keys: '[/MouseRight]' }
  ])
}

function renderMenu(
  props: Partial<{ creatorId: string; creatorName: string; status: EntityStatus }> = {}
): {
  onDelete: ReturnType<typeof vi.fn>
  onRestore: ReturnType<typeof vi.fn>
} {
  const onDelete = vi.fn()
  const onRestore = vi.fn()
  render(
    <CreatorContextMenu
      creatorId={props.creatorId ?? 'c-1'}
      creatorName={props.creatorName ?? 'Alice'}
      status={props.status ?? 'active'}
      onDelete={onDelete}
      onRestore={onRestore}
    >
      <div data-testid="trigger">Creator card</div>
    </CreatorContextMenu>
  )
  return { onDelete, onRestore }
}

describe('CreatorContextMenu — info actions', () => {
  it('Copy name writes the creator name to the clipboard', async () => {
    renderMenu({ creatorName: 'Alice Wonder' })
    const user = userEvent.setup()
    await openMenu(user)

    await user.click(await screen.findByText(tCommon('actions.copyName')))
    expect(writeText).toHaveBeenCalledWith('Alice Wonder')
    expect(toastSuccess).toHaveBeenCalledWith(tCommon('toasts.copied'))
  })

  it('Open folder forwards the creatorId to window.api.revealCreatorFolder', async () => {
    renderMenu({ creatorId: 'c-9' })
    const user = userEvent.setup()
    await openMenu(user)

    await user.click(await screen.findByText(tCommon('actions.openFolder')))
    expect(revealCreatorFolder).toHaveBeenCalledWith('c-9')
  })

  it('Reveal failure toasts the error', async () => {
    revealCreatorFolder.mockResolvedValueOnce({ ok: false, error: 'no such directory' })
    renderMenu()
    const user = userEvent.setup()
    await openMenu(user)

    await user.click(await screen.findByText(tCommon('actions.openFolder')))
    expect(toastError).toHaveBeenCalledWith(
      tCommon('toasts.openFolderFailed', { message: 'no such directory' })
    )
  })
})

describe('CreatorContextMenu — status branches', () => {
  it('active status shows Delete and hides Restore', async () => {
    renderMenu({ status: 'active' })
    const user = userEvent.setup()
    await openMenu(user)
    expect(await screen.findByText(tCommon('actions.delete'))).toBeInTheDocument()
    expect(screen.queryByText(tCommon('actions.restore'))).not.toBeInTheDocument()
  })

  it('deleted status shows Restore and hides Delete', async () => {
    renderMenu({ status: 'deleted' })
    const user = userEvent.setup()
    await openMenu(user)
    expect(await screen.findByText(tCommon('actions.restore'))).toBeInTheDocument()
    expect(screen.queryByText(tCommon('actions.delete'))).not.toBeInTheDocument()
  })

  it('missing status shows both Delete and Restore', async () => {
    renderMenu({ status: 'missing' })
    const user = userEvent.setup()
    await openMenu(user)
    expect(await screen.findByText(tCommon('actions.delete'))).toBeInTheDocument()
    expect(screen.getByText(tCommon('actions.restore'))).toBeInTheDocument()
  })

  it('Delete click invokes onDelete', async () => {
    const { onDelete } = renderMenu({ status: 'active' })
    const user = userEvent.setup()
    await openMenu(user)
    await user.click(await screen.findByText(tCommon('actions.delete')))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('Restore click invokes onRestore', async () => {
    const { onRestore } = renderMenu({ status: 'deleted' })
    const user = userEvent.setup()
    await openMenu(user)
    await user.click(await screen.findByText(tCommon('actions.restore')))
    expect(onRestore).toHaveBeenCalledTimes(1)
  })
})
