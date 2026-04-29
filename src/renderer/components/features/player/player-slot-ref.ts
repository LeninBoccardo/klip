import { create } from 'zustand'

/**
 * The detail-page placeholder element the persistent player should overlay
 * when in `detail` mode. Mediated through a zustand store so any component
 * can register a slot without needing to thread a context provider.
 *
 * This is a **DOM ref**, not an entity reference — only one can be active at
 * a time, and registering a new one supersedes the previous (e.g. soft
 * navigations between two video pages).
 */
interface PlayerSlotState {
  element: HTMLElement | null
  setElement: (el: HTMLElement | null) => void
}

export const usePlayerSlot = create<PlayerSlotState>((set) => ({
  element: null,
  setElement: (element) => set({ element })
}))
