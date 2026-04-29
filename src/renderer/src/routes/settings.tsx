import { createFileRoute } from '@tanstack/react-router'
import { useSetting } from '@/hooks/use-settings'
import { useAuditLogRecent } from '@/hooks/use-audit-log'
import { useAppStore } from '@/hooks/use-app-store'
import { RootPathDisplay } from '@components/features/settings/RootPathDisplay'
import { MigrateRootButton } from '@components/features/settings/MigrateRootButton'
import { ReconcileButton } from '@components/features/settings/ReconcileButton'
import { EnrichVideosButton } from '@components/features/settings/EnrichVideosButton'
import { UpdatesCard } from '@components/features/settings/UpdatesCard'
import { PlaybackSettings } from '@components/features/settings/PlaybackSettings'
import { PageContainer, PageHeader } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@ui/table'
import { ScrollArea } from '@ui/scroll-area'
import { Skeleton } from '@ui/skeleton'
import { formatDistanceToNow } from 'date-fns'

export const Route = createFileRoute('/settings')({
  component: SettingsPage
})

function SettingsPage(): React.ReactElement {
  const { data: rootPath, isLoading: rootLoading } = useSetting('rootPath')
  const { data: auditEntries, isLoading: auditLoading } = useAuditLogRecent(30)
  const isBlocking = useAppStore((s) => s.blockingOperation !== null)

  return (
    <PageContainer>
      <PageHeader title="Settings" description="Application configuration and maintenance" />

      <Card>
        <CardHeader>
          <CardTitle>Storage</CardTitle>
          <CardDescription>Where Klip stores your media files on disk.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rootLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <>
              <RootPathDisplay rootPath={rootPath} />
              <MigrateRootButton currentRootPath={rootPath} />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Maintenance</CardTitle>
          <CardDescription>Reconcile the database index with files on disk.</CardDescription>
        </CardHeader>
        <CardContent>
          <ReconcileButton disabled={isBlocking} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Metadata Enrichment</CardTitle>
          <CardDescription>
            Fetch extended metadata (likes, comments, transcripts) for indexed videos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EnrichVideosButton disabled={isBlocking} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Playback</CardTitle>
          <CardDescription>
            What happens to the player when you navigate away from a video.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlaybackSettings />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Updates</CardTitle>
          <CardDescription>Stay up to date with the latest version of Klip.</CardDescription>
        </CardHeader>
        <CardContent>
          <UpdatesCard />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Audit Log</CardTitle>
          <CardDescription>Last 30 entity mutations tracked by the system.</CardDescription>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : auditEntries && auditEntries.length > 0 ? (
            <ScrollArea className="max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>When</TableHead>
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
                        {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          ) : (
            <p className="text-sm text-muted-foreground">No audit entries yet.</p>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  )
}
