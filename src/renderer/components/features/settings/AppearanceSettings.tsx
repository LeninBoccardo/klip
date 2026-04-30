import { useTranslation } from 'react-i18next'
import { RadioGroup, RadioGroupItem } from '@ui/radio-group'
import { Label } from '@ui/label'
import { useThemePreference } from '@/hooks/use-theme-preference'
import { THEME_VALUES, isTheme } from '@shared/types'
import { Sun, Moon, Monitor } from 'lucide-react'
import type { Theme } from '@shared/types'

const ICONS: Record<Theme, React.ComponentType<{ className?: string }>> = {
  light: Sun,
  dark: Moon,
  system: Monitor
}

/**
 * Radio group control for the `theme` preference. Mirrors the visual shape
 * of `PlaybackSettings` so the Settings page has one consistent card style.
 */
export function AppearanceSettings(): React.ReactElement {
  const { t } = useTranslation('settings')
  const { theme, setTheme } = useThemePreference()

  const handleChange = (next: string): void => {
    if (!isTheme(next)) return
    setTheme(next)
  }

  return (
    <RadioGroup value={theme} onValueChange={handleChange}>
      {THEME_VALUES.map((value) => {
        const Icon = ICONS[value]
        return (
          <Label
            key={value}
            htmlFor={`theme-${value}`}
            className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-muted/50"
          >
            <RadioGroupItem id={`theme-${value}`} value={value} />
            <Icon className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t(`appearance.options.${value}` as const)}</span>
          </Label>
        )
      })}
    </RadioGroup>
  )
}
