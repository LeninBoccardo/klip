import { useEffect } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { usePlayerStore } from '@/hooks/use-player-store'
import {
  DEFAULT_PLAYBACK_ON_NAVIGATE,
  isPlaybackOnNavigate,
  SETTING_KEYS,
  type PlaybackOnNavigate
} from '@shared/types'

/**
 * Reads the persisted `playbackOnNavigate` value, normalising legacy / missing
 * values to the default so the UI always renders a known radio option.
 */
export function usePlaybackOnNavigate(): UseQueryResult<PlaybackOnNavigate, Error> {
  return useQuery({
    queryKey: queryKeys.settings.detail(SETTING_KEYS.playbackOnNavigate),
    queryFn: async () => {
      const raw = await window.api.getSetting(SETTING_KEYS.playbackOnNavigate)
      return isPlaybackOnNavigate(raw) ? raw : DEFAULT_PLAYBACK_ON_NAVIGATE
    }
  })
}

/** Mutator. Caller should pass a validated `PlaybackOnNavigate`. */
export function useSetPlaybackOnNavigate(): UseMutationResult<void, Error, PlaybackOnNavigate> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (value: PlaybackOnNavigate) =>
      window.api.setSetting(SETTING_KEYS.playbackOnNavigate, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings.all })
  })
}

/**
 * Mirror the persisted preference into the player zustand slice.
 *
 * The route-change effect needs the latest behavior synchronously and React
 * Query's data has its own refresh cadence — keeping a copy in zustand avoids
 * a stale-closure race between settings invalidation and route navigation.
 *
 * Mount once near the root; safe to mount multiple times.
 */
export function usePlaybackSettingMirror(): void {
  const setting = usePlaybackOnNavigate()
  const setNavBehavior = usePlayerStore((s) => s.setNavBehavior)

  useEffect(() => {
    if (setting.data) setNavBehavior(setting.data)
  }, [setting.data, setNavBehavior])
}
