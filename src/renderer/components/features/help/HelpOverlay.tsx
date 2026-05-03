import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@ui/dialog'
import { Kbd, KbdGroup } from '@ui/kbd'
import { GROUPS, shortcutsByGroup } from './shortcut-registry'
import { tokenizeShortcut } from '@/lib/platform-key'

interface HelpOverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HelpOverlay({ open, onOpenChange }: HelpOverlayProps): React.ReactElement {
  const { t } = useTranslation('shortcuts')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { key: '?' })}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {GROUPS.map((group) => {
            const entries = shortcutsByGroup(group)
            return (
              <section key={group} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`groups.${group}`)}
                </h3>
                <ul className="space-y-1.5">
                  {entries.map((entry) => {
                    const tokens = entry.keys === ' '
                      ? ['Space']
                      : tokenizeShortcut(entry.keys)
                    return (
                      <li
                        key={entry.id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="text-foreground">{t(entry.descriptionKey)}</span>
                        <KbdGroup>
                          {tokens.map((token, i) => (
                            <Fragment key={`${entry.id}-${i}`}>
                              <Kbd>{token}</Kbd>
                            </Fragment>
                          ))}
                        </KbdGroup>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
