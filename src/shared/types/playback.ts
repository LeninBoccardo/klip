/**
 * Per-user preference for what should happen to the active video player when
 * the user navigates away from the video detail page.
 *
 *   - `floating` — keep playing in a floating mini-player docked bottom-right.
 *   - `pause`    — pause the video, keep the audio source loaded, and resume
 *                  on return to the detail page (currentTime persisted).
 *   - `stop`     — destroy the player state entirely; returning to the page
 *                  starts from the beginning.
 *
 * The setting key is `playbackOnNavigate`. Persisted via the standard
 * settings table; the renderer mirrors it into the player zustand slice.
 */
export type PlaybackOnNavigate = 'floating' | 'pause' | 'stop'

export const PLAYBACK_ON_NAVIGATE_VALUES = [
  'floating',
  'pause',
  'stop'
] as const satisfies readonly PlaybackOnNavigate[]

export const DEFAULT_PLAYBACK_ON_NAVIGATE: PlaybackOnNavigate = 'floating'

/**
 * Setting key constants — keeps renderer + main + tests in sync.
 *
 * Co-located here for historical reasons (this file pre-dates the broader
 * preference surface). All persisted preferences register their key here;
 * type definitions and validators live in their own module
 * (`preferences.ts` for theme/language, this file for `playbackOnNavigate`).
 */
export const SETTING_KEYS = {
  rootPath: 'rootPath',
  playbackOnNavigate: 'playbackOnNavigate',
  theme: 'theme',
  language: 'language',
  hasCompletedOnboarding: 'hasCompletedOnboarding',
  miniPlayerCorner: 'miniPlayerCorner'
} as const

/** Validator for `hasCompletedOnboarding` (string-encoded boolean). */
export function isBooleanString(value: unknown): value is 'true' | 'false' {
  return value === 'true' || value === 'false'
}

export function isPlaybackOnNavigate(value: unknown): value is PlaybackOnNavigate {
  return value === 'floating' || value === 'pause' || value === 'stop'
}
