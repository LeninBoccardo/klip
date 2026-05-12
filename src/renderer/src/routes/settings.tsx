import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useSetting } from '@/hooks/use-settings'
import { useAuditLogRecent } from '@/hooks/use-audit-log'
import { useAppStore } from '@/hooks/use-app-store'
import { RootPathDisplay } from '@components/features/settings/RootPathDisplay'
import { MigrateRootButton } from '@components/features/settings/MigrateRootButton'
import { StorageStatsCard } from '@components/features/settings/StorageStatsCard'
import { ReconcileButton } from '@components/features/settings/ReconcileButton'
import { EnrichVideosButton } from '@components/features/settings/EnrichVideosButton'
import { UpdatesCard } from '@components/features/settings/UpdatesCard'
import { PlaybackSettings } from '@components/features/settings/PlaybackSettings'
import { AppearanceSettings } from '@components/features/settings/AppearanceSettings'
import { LanguageSettings } from '@components/features/settings/LanguageSettings'
import { DateFormatSettings } from '@components/features/settings/DateFormatSettings'
import { PageContainer, PageHeader } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@ui/table'
import { ScrollArea } from '@ui/scroll-area'
import { Skeleton } from '@ui/skeleton'
import { formatDistanceToNow } from 'date-fns'
import { useDateLocale } from '@renderer/i18n/date-locale'

export const Route = createFileRoute('/settings')({
  component: SettingsPage
})

function SettingsPage(): React.ReactElement {
  const { t } = useTranslation('settings')
  const { data: rootPath, isLoading: rootLoading } = useSetting('rootPath')
  const { data: auditEntries, isLoading: auditLoading } = useAuditLogRecent(30)
  const isBlocking = useAppStore((s) => s.blockingOperation !== null)
  const dateLocale = useDateLocale()

  return (
    <PageContainer>
      <PageHeader title={t('page.title')} description={t('page.description')} />

      <Card>
        <CardHeader>
          <CardTitle>{t('appearance.title')}</CardTitle>
          <CardDescription>{t('appearance.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <AppearanceSettings />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('language.title')}</CardTitle>
          <CardDescription>{t('language.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <LanguageSettings />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('dateFormat.title')}</CardTitle>
          <CardDescription>{t('dateFormat.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <DateFormatSettings />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('storage.title')}</CardTitle>
          <CardDescription>{t('storage.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rootLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <>
              <RootPathDisplay rootPath={rootPath} />
              <MigrateRootButton currentRootPath={rootPath} />
              <StorageStatsCard />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('maintenance.title')}</CardTitle>
          <CardDescription>{t('maintenance.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ReconcileButton disabled={isBlocking} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('metadata.title')}</CardTitle>
          <CardDescription>{t('metadata.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <EnrichVideosButton disabled={isBlocking} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('playback.title')}</CardTitle>
          <CardDescription>{t('playback.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <PlaybackSettings />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('updates.title')}</CardTitle>
          <CardDescription>{t('updates.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <UpdatesCard />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('auditLog.title')}</CardTitle>
          <CardDescription>{t('auditLog.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : auditEntries && auditEntries.length > 0 ? (
            <ScrollArea className="max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('auditLog.columns.action')}</TableHead>
                    <TableHead>{t('auditLog.columns.entity')}</TableHead>
                    <TableHead>{t('auditLog.columns.entityId')}</TableHead>
                    <TableHead>{t('auditLog.columns.when')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.action}</TableCell>
                      <TableCell>{entry.entityType}</TableCell>
                      <TableCell className="max-w-[200px] truncate font-mono text-xs">
                        {entry.entityId}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(entry.createdAt), {
                          addSuffix: true,
                          locale: dateLocale
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          ) : (
            <p className="text-sm text-muted-foreground">{t('auditLog.empty')}</p>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  )
}
