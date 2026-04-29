import { create } from 'zustand'
import type { PlaybackOnNavigate } from '@shared/types'
import { DEFAULT_PLAYBACK_ON_NAVIGATE } from '@shared/types'

/**
 * The visible attachment of the single persistent `<video>` element.
 *
 *   - `idle`    — no media loaded; the player surface is unmounted.
 *   - `detail`  — anchored to the placeholder rendered by the active
 *                 `/videos/$videoId` page (full-size, in-page experience).
 *   - `mini`    — fixed-position floating dock in the bottom-right corner;
 *                 picks up automatically when the user navigates away under
 *                 the `floating` nav-behavior setting.
 *   - `paused`  — the `<video>` is unmounted to free GPU/decoder resources,
 *                 but `videoId` and `resumeAt` are retained so revisiting
 *                 the detail page resumes from the saved time.
 */
export type PlayerMode = 'idle' | 'detail' | 'mini' | 'paused'

/**
 * Whether the loaded media is a full video or a cut clip. Drives which
 * `klip-media://<kind>/...` URL the player surface requests.
 */
export type MediaKind = 'video' | 'cut'

/**
 * One item in a "Play all" queue. Cuts are routed via `klip-media://cut/...`
 * so the player can step through mixed kinds without the surface caring.
 */
export interface QueueItem {
  kind: MediaKind
  id: string
  title: string
  /** For cuts: the parent creator id, so navigation can stay in sync. */
  creatorId?: string
}

export interface PlayerSlice {
  /** Currently-loaded media id (video or cut). Null while idle. */
  videoId: string | null
  mediaKind: MediaKind
  /** Display title — kept in the slice so the mini-player can label itself
      without re-fetching the video DTO. */
  title: string | null
  mode: PlayerMode
  /** Mirror of the `playbackOnNavigate` user setting. The route-change
      effect reads this synchronously, so keeping it in the store avoids a
      stale-closure race against the settings query. */
  navBehavior: PlaybackOnNavigate
  /** Seconds — last `currentTime` observed; used to seek the surface when
      the player is re-attached after `paused`. */
  resumeAt: number
  /** Active "Play all" queue, or null when the user is playing a single item. */
  queue: { items: QueueItem[]; index: number } | null

  /** Open a video or cut in the player. Replacing the current item resets resumeAt. */
  play(input: { videoId: string; title: string; mediaKind?: MediaKind; mode?: PlayerMode }): void
  /** The player surface reports its `currentTime` here on a low-frequency
      tick (250-500ms is fine — used only for resume, not for the seek bar). */
  reportTime(seconds: number): void
  /** Switch attachment without altering the loaded media. */
  setMode(mode: PlayerMode): void
  /** Update the mirrored nav-behavior preference. Called by the settings
      mirror effect; do not call from UI. */
  setNavBehavior(value: PlaybackOnNavigate): void
  /** Stop and clear the slice — equivalent to closing the floating player. */
  stop(): void

  // ── Queue actions ──
  /**
   * Load a queue and start playing. `startIndex` clamps into [0, items.length).
   * No-op for an empty `items` array. Replaces any existing queue.
   */
  playQueue(items: QueueItem[], startIndex?: number): void
  /** Advance to the next item; stops + clears the queue on overflow. */
  next(): void
  /** Step back one item; no-op at index 0. */
  previous(): void
  /** Drop the queue but keep the currently-loaded item playing. */
  clearQueue(): void
}

export const usePlayerStore = create<PlayerSlice>((set) => ({
  videoId: null,
  mediaKind: 'video',
  title: null,
  mode: 'idle',
  navBehavior: DEFAULT_PLAYBACK_ON_NAVIGATE,
  resumeAt: 0,
  queue: null,

  play: ({ videoId, title, mediaKind = 'video', mode = 'detail' }) =>
    set((state) => {
      const sameItem = state.videoId === videoId && state.mediaKind === mediaKind
      return {
        videoId,
        mediaKind,
        title,
        mode,
        // Re-opening the same item keeps the resume point so the user can
        // navigate away and come back without losing position. A different
        // item resets to 0.
        resumeAt: sameItem ? state.resumeAt : 0
      }
    }),

  reportTime: (seconds) =>
    set((state) => {
      // The native `<video>` fires `timeupdate` ~4×/sec; coalesce to whole
      // seconds in state to keep the store quiet under React DevTools.
      const next = Math.floor(seconds)
      if (next === Math.floor(state.resumeAt)) return state
      return { resumeAt: seconds }
    }),

  setMode: (mode) => set({ mode }),
  setNavBehavior: (value) => set({ navBehavior: value }),
  stop: () =>
    set({
      videoId: null,
      mediaKind: 'video',
      title: null,
      mode: 'idle',
      resumeAt: 0,
      queue: null
    }),

  playQueue: (items, startIndex = 0) =>
    set(() => {
      if (items.length === 0) return {}
      const index = Math.max(0, Math.min(startIndex, items.length - 1))
      const item = items[index]
      return {
        queue: { items, index },
        videoId: item.id,
        mediaKind: item.kind,
        title: item.title,
        mode: 'detail',
        resumeAt: 0
      }
    }),

  next: () =>
    set((state) => {
      if (!state.queue) return state
      const nextIndex = state.queue.index + 1
      if (nextIndex >= state.queue.items.length) {
        // Overflow — clear queue, stop playback. The mini-player UI watches
        // `mode === 'idle'` to unmount.
        return {
          queue: null,
          videoId: null,
          mediaKind: 'video',
          title: null,
          mode: 'idle',
          resumeAt: 0
        }
      }
      const item = state.queue.items[nextIndex]
      return {
        queue: { items: state.queue.items, index: nextIndex },
        videoId: item.id,
        mediaKind: item.kind,
        title: item.title,
        // Preserve the user's current mode (detail / mini) so advancing in
        // the floating dock doesn't yank focus back to the page.
        resumeAt: 0
      }
    }),

  previous: () =>
    set((state) => {
      if (!state.queue || state.queue.index === 0) return state
      const prevIndex = state.queue.index - 1
      const item = state.queue.items[prevIndex]
      return {
        queue: { items: state.queue.items, index: prevIndex },
        videoId: item.id,
        mediaKind: item.kind,
        title: item.title,
        resumeAt: 0
      }
    }),

  clearQueue: () => set({ queue: null })
}))
