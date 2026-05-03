import { useState } from 'react'
import { useSetting, useSetSetting } from '@/hooks/use-settings'
import { SETTING_KEYS } from '@shared/types'

/**
 * Reads/writes the `hasCompletedOnboarding` setting and gates the wizard
 * UI. Returns `shouldShow=true` only after the setting query has resolved
 * — we don't want to flash the wizard on top of the app while the value
 * is still loading. Once the user completes or skips, the setting flips
 * to `'true'` and the wizard self-dismisses.
 *
 * The Settings page exposes a `replay` action that flips the setting back
 * to `'false'` so users can re-discover the tour.
 */
export function useOnboardingState(): {
  shouldShow: boolean
  isLoading: boolean
  complete: () => void
  replay: () => void
} {
  const { data: setting, isLoading } = useSetting(SETTING_KEYS.hasCompletedOnboarding)
  const setSetting = useSetSetting()
  // Local override lets the caller dismiss optimistically without waiting
  // for the mutation to settle. The next launch reads the persisted value.
  const [dismissed, setDismissed] = useState(false)

  const completed = setting === 'true' || dismissed
  return {
    shouldShow: !isLoading && !completed,
    isLoading,
    complete: () => {
      setDismissed(true)
      setSetting.mutate({ key: SETTING_KEYS.hasCompletedOnboarding, value: 'true' })
    },
    replay: () => {
      setDismissed(false)
      setSetting.mutate({ key: SETTING_KEYS.hasCompletedOnboarding, value: 'false' })
    }
  }
}
