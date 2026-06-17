import { Fragment } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { PageContainer, PageHeader } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@ui/card'
import { Clapperboard, FolderGit2Icon, Keyboard, Scale, User } from 'lucide-react'
import { Badge } from '@ui/badge'
import { Kbd, KbdGroup } from '@ui/kbd'
import { GROUPS, shortcutsByGroup } from '@/components/features/help/shortcut-registry'
import { tokenizeShortcut } from '@/lib/platform-key'

export const Route = createFileRoute('/about')({
  component: AboutPage
})

function AboutPage(): React.ReactElement {
  const { t } = useTranslation('about')
  const { t: tShortcuts } = useTranslation('shortcuts')
  return (
    <PageContainer>
      <PageHeader title={t('page.title')} description={t('page.description')} />

      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
          <Clapperboard className="size-16 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Klip</h1>
          <Badge variant="secondary">v{__APP_VERSION__}</Badge>
          <p className="max-w-md text-center text-muted-foreground">{t('appDescription')}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="size-4" />
              {t('author.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Lenin Boccardo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Scale className="size-4" />
              {t('license.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t('license.value')}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('builtWith')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {[
            'Electron',
            'React 19',
            'TypeScript',
            'Drizzle ORM',
            'SQLite',
            'Tailwind CSS',
            'shadcn/ui',
            'electron-vite'
          ].map((tech) => (
            <Badge key={tech} variant="outline">
              {tech}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderGit2Icon className="size-4" />
            {t('sourceCode')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">github.com/leninboccardo/klip</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Keyboard className="size-4" />
            {t('shortcuts.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-xs text-muted-foreground">{t('shortcuts.hint')}</p>
          <div className="grid gap-6 sm:grid-cols-2">
            {GROUPS.map((group) => {
              const entries = shortcutsByGroup(group)
              if (entries.length === 0) return null
              return (
                <section key={group} className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {tShortcuts(`groups.${group}`)}
                  </h3>
                  <ul className="space-y-1.5">
                    {entries.map((entry) => {
                      const tokens = entry.keys === ' ' ? ['Space'] : tokenizeShortcut(entry.keys)
                      return (
                        <li
                          key={entry.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span>{tShortcuts(entry.descriptionKey)}</span>
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
        </CardContent>
      </Card>
    </PageContainer>
  )
}
