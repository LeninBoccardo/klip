import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@renderer/i18n'
import { EntityContextMenu } from '@/components/shared/EntityContextMenu'
import type { EntityStatus } from '@shared/types'

const revealEntityInFolder = vi.fn()
const openExternalUrl = vi.fn()
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
const tCollections = (key: string, params?: Record<string, unknown>): string =>
  i18n.t(key, { ns: 'collections', ...params })

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'api', {
    value: { revealEntityInFolder, openExternalUrl },
    writable: true,
    configurable: true
  })
  // jsdom 29's `navigator.clipboard` is a non-configurable accessor at the
  // top level — replacing it as a whole silently fails. userEvent.setup()
  // also patches it. Sidestep both: ensure `navigator.clipboard` exists, then
  // patch its `writeText` slot (each method slot is configurable).
  if (!('clipboard' in navigator) || navigator.clipboard == null) {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true
    })
  } else {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: writeText,
      writable: true,
      configurable: true
    })
  }
  revealEntityInFolder.mockResolvedValue({ ok: true })
  openExternalUrl.mockResolvedValue({ ok: true })
  writeText.mockResolvedValue(undefined)
})

async function openMenu(
  user: ReturnType<typeof userEvent.setup>,
  testId = 'trigger'
): Promise<void> {
  await user.pointer([
    { target: screen.getByTestId(testId), keys: '[MouseRight>]' },
    { keys: '[/MouseRight]' }
  ])
}

function renderMenu(
  props: Partial<{
    status: EntityStatus
    onDelete: () => void
    onRestore: () => void
    onAddToCollection?: () => void
    title?: string
    youtubeUrl?: string
    reveal?: { kind: 'video' | 'cut'; id: string }
  }> = {}
): { onDelete: ReturnType<typeof vi.fn>; onRestore: ReturnType<typeof vi.fn> } {
  const onDelete = props.onDelete ?? vi.fn()
  const onRestore = props.onRestore ?? vi.fn()
  render(
    <EntityContextMenu
      status={props.status ?? 'active'}
      onDelete={onDelete}
      onRestore={onRestore}
      onAddToCollection={props.onAddToCollection}
      title={props.title}
      youtubeUrl={props.youtubeUrl}
      reveal={props.reveal}
    >
      <div data-testid="trigger">Right-click target</div>
    </EntityContextMenu>
  )
  return {
    onDelete: onDelete as ReturnType<typeof vi.fn>,
    onRestore: onRestore as ReturnType<typeof vi.fn>
  }
}

describe('EntityContextMenu — status branches', () => {
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

  it('missing status shows both Delete and Restore (status !== active && !== deleted)', async () => {
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

describe('EntityContextMenu — Add to collection', () => {
  it('renders the Add-to-collection item only when callback is provided AND status === "active"', async () => {
    const onAddToCollection = vi.fn()
    renderMenu({ status: 'active', onAddToCollection })
    const user = userEvent.setup()
    await openMenu(user)

    const item = await screen.findByText(`${tCollections('addToCollection.title')}…`)
    await user.click(item)
    expect(onAddToCollection).toHaveBeenCalledTimes(1)
  })

  it('hides Add-to-collection when status is not active even if callback is set', async () => {
    renderMenu({ status: 'deleted', onAddToCollection: vi.fn() })
    const user = userEvent.setup()
    await openMenu(user)

    expect(screen.queryByText(`${tCollections('addToCollection.title')}…`)).not.toBeInTheDocument()
  })

  it('hides Add-to-collection when callback is not provided (default two-item menu)', async () => {
    renderMenu({ status: 'active' })
    const user = userEvent.setup()
    await openMenu(user)

    await screen.findByText(tCommon('actions.delete'))
    expect(screen.queryByText(`${tCollections('addToCollection.title')}…`)).not.toBeInTheDocument()
  })
})

describe('EntityContextMenu — Copy/Open/Reveal info actions', () => {
  it('Copy title writes to clipboard and toasts success', async () => {
    renderMenu({ title: 'My Video' })
    const user = userEvent.setup()
    await openMenu(user)

    await user.click(await screen.findByText(tCommon('actions.copyTitle')))
    expect(writeText).toHaveBeenCalledWith('My Video')
    expect(toastSuccess).toHaveBeenCalledWith(tCommon('toasts.copied'))
  })

  it('Copy link writes the youtubeUrl', async () => {
    renderMenu({ youtubeUrl: 'https://youtu.be/abc' })
    const user = userEvent.setup()
    await openMenu(user)

    await user.click(await screen.findByText(tCommon('actions.copyLink')))
    expect(writeText).toHaveBeenCalledWith('https://youtu.be/abc')
  })

  it('Open on YouTube delegates to window.api.openExternalUrl', async () => {
    renderMenu({ youtubeUrl: 'https://youtu.be/abc' })
    const user = userEvent.setup()
    await openMenu(user)

    await user.click(await screen.findByText(tCommon('actions.openOnYoutube')))
    expect(openExternalUrl).toHaveBeenCalledWith('https://youtu.be/abc')
  })

  it('Reveal in folder delegates to window.api.revealEntityInFolder with the {kind, id} ref', async () => {
    renderMenu({ reveal: { kind: 'video', id: 'v-1' } })
    const user = userEvent.setup()
    await openMenu(user)

    await user.click(await screen.findByText(tCommon('actions.revealInFolder')))
    expect(revealEntityInFolder).toHaveBeenCalledWith('video', 'v-1')
  })

  it('Reveal failure toasts the error', async () => {
    revealEntityInFolder.mockResolvedValueOnce({ ok: false, error: 'No such directory' })
    renderMenu({ reveal: { kind: 'cut', id: 'c-1' } })
    const user = userEvent.setup()
    await openMenu(user)

    await user.click(await screen.findByText(tCommon('actions.revealInFolder')))
    expect(toastError).toHaveBeenCalledWith(
      tCommon('toasts.revealFailed', { message: 'No such directory' })
    )
  })

  it('Open external failure toasts the error', async () => {
    openExternalUrl.mockResolvedValueOnce({ ok: false, error: 'blocked' })
    renderMenu({ youtubeUrl: 'https://youtu.be/x' })
    const user = userEvent.setup()
    await openMenu(user)

    await user.click(await screen.findByText(tCommon('actions.openOnYoutube')))
    expect(toastError).toHaveBeenCalledWith(
      tCommon('toasts.openExternalFailed', { message: 'blocked' })
    )
  })

  it('Copy failure toasts the failure message', async () => {
    writeText.mockRejectedValueOnce(new Error('clipboard denied'))
    renderMenu({ title: 'My Video' })
    const user = userEvent.setup()
    await openMenu(user)

    await user.click(await screen.findByText(tCommon('actions.copyTitle')))
    expect(toastError).toHaveBeenCalledWith(
      tCommon('toasts.copyFailed', { message: 'clipboard denied' })
    )
  })
})

describe('EntityContextMenu — minimal menu (no info actions, no add-to-collection)', () => {
  it('only renders the status-driven Delete/Restore items', async () => {
    renderMenu({ status: 'active' })
    const user = userEvent.setup()
    await openMenu(user)

    await screen.findByText(tCommon('actions.delete'))
    // Info actions absent.
    expect(screen.queryByText(tCommon('actions.copyTitle'))).not.toBeInTheDocument()
    expect(screen.queryByText(tCommon('actions.copyLink'))).not.toBeInTheDocument()
    expect(screen.queryByText(tCommon('actions.openOnYoutube'))).not.toBeInTheDocument()
    expect(screen.queryByText(tCommon('actions.revealInFolder'))).not.toBeInTheDocument()
    // Add-to-collection absent.
    expect(screen.queryByText(`${tCollections('addToCollection.title')}…`)).not.toBeInTheDocument()
  })
})
