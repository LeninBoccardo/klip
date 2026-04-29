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

export interface PlayerSlice {
  videoId: string | null
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

  /** Open a video in the player. Replacing the current video resets resumeAt. */
  play(input: { videoId: string; title: string; mode?: PlayerMode }): void
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
}

export const usePlayerStore = create<PlayerSlice>((set) => ({
  videoId: null,
  title: null,
  mode: 'idle',
  navBehavior: DEFAULT_PLAYBACK_ON_NAVIGATE,
  resumeAt: 0,

  play: ({ videoId, title, mode = 'detail' }) =>
    set((state) => {
      const sameVideo = state.videoId === videoId
      return {
        videoId,
        title,
        mode,
        // Re-opening the same video keeps the resume point so the user can
        // navigate away and come back without losing position. A different
        // video resets to 0.
        resumeAt: sameVideo ? state.resumeAt : 0
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
  stop: () => set({ videoId: null, title: null, mode: 'idle', resumeAt: 0 })
}))
