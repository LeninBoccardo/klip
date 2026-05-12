/**
 * Persisted corner anchor for the floating mini-player.
 *
 *   TL — top-left
 *   TR — top-right
 *   BL — bottom-left
 *   BR — bottom-right (default; matches the previous hardcoded position)
 *
 * Stored in the `settings` table under {@link SETTING_KEYS.miniPlayerCorner}.
 * The renderer snaps the mini-player to the nearest corner after each drag
 * and writes the chosen corner here so the next session opens at the same
 * spot.
 */
export type MiniPlayerCorner = 'TL' | 'TR' | 'BL' | 'BR'

export const MINI_PLAYER_CORNER_VALUES = ['TL', 'TR', 'BL', 'BR'] as const satisfies readonly MiniPlayerCorner[]

export const DEFAULT_MINI_PLAYER_CORNER: MiniPlayerCorner = 'BR'

export function isMiniPlayerCorner(value: unknown): value is MiniPlayerCorner {
  return value === 'TL' || value === 'TR' || value === 'BL' || value === 'BR'
}
