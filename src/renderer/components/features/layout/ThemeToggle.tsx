import { useTranslation } from 'react-i18next'
import { Sun, Moon } from 'lucide-react'
import { Button } from '@ui/button'
import { useThemePreference } from '@/hooks/use-theme-preference'

/**
 * One-click sun/moon flip in the header. Toggles strictly between `light`
 * and `dark` (never lands on `system`) — users who want OS-follow behaviour
 * use the Settings page radio. The icon shown is whichever theme would be
 * applied on click, matching standard sun/moon affordances.
 */
export function ThemeToggle(): React.ReactElement {
  const { t } = useTranslation('settings')
  const { resolvedTheme, setTheme } = useThemePreference()

  const next = resolvedTheme === 'dark' ? 'light' : 'dark'

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(next)}
      aria-label={t('appearance.toggleAria')}
      className="size-8 p-0"
    >
      {resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}
