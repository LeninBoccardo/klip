import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '@renderer/i18n'
import { HelpOverlay } from '@/components/features/help/HelpOverlay'
import { GROUPS } from '@/components/features/help/shortcut-registry'

const tShortcuts = (key: string, params?: Record<string, unknown>): string =>
  i18n.t(key, { ns: 'shortcuts', ...params })

describe('HelpOverlay', () => {
  it('renders nothing visible when closed', () => {
    render(<HelpOverlay open={false} onOpenChange={() => {}} />)
    expect(screen.queryByText(tShortcuts('title'))).not.toBeInTheDocument()
  })

  it('renders the title and description with the "?" key when open', () => {
    render(<HelpOverlay open onOpenChange={() => {}} />)
    expect(screen.getByText(tShortcuts('title'))).toBeInTheDocument()
    expect(screen.getByText(tShortcuts('description', { key: '?' }))).toBeInTheDocument()
  })

  it('renders one section heading per group from the registry', () => {
    render(<HelpOverlay open onOpenChange={() => {}} />)
    for (const group of GROUPS) {
      expect(screen.getByText(tShortcuts(`groups.${group}`))).toBeInTheDocument()
    }
  })

  it('renders the description label for known shortcuts', () => {
    // Spot-check three entries (one global, one navigation, one player). Uses
    // getAllByText for openPaletteMod because openPaletteSlash shares the
    // same English copy ("Open command palette") — the registry has two
    // distinct ids with the same translation, which is intentional (the
    // palette has two activation keys).
    render(<HelpOverlay open onOpenChange={() => {}} />)
    expect(screen.getAllByText(tShortcuts('entries.openPaletteMod')).length).toBeGreaterThan(0)
    expect(screen.getByText(tShortcuts('entries.navHome'))).toBeInTheDocument()
    expect(screen.getByText(tShortcuts('entries.playerFullscreen'))).toBeInTheDocument()
  })

  it('renders the spacebar shortcut as the "Space" token (not a literal " ")', () => {
    // Player.playPause has keys: ' '. The component substitutes 'Space' so
    // users see a label, not whitespace.
    render(<HelpOverlay open onOpenChange={() => {}} />)
    expect(screen.getByText('Space')).toBeInTheDocument()
  })
})
