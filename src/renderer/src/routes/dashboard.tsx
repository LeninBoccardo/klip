import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useLibraryStats } from '@/hooks/use-stats'
import { PageContainer, PageHeader } from '@/components/shared'
import { StatCard } from '@components/features/dashboard/StatCard'
import { DownloadsTimelineChart } from '@components/features/dashboard/charts/DownloadsTimelineChart'
import { VideosByStatusChart } from '@components/features/dashboard/charts/VideosByStatusChart'
import { StorageBreakdownChart } from '@components/features/dashboard/charts/StorageBreakdownChart'
import { TopCreatorsList } from '@components/features/dashboard/TopCreatorsList'
import { Card, CardContent, CardHeader, CardTitle } from '@ui/card'
import { Skeleton } from '@ui/skeleton'
import { Users, Film, Scissors, Captions, HardDrive, Clock } from 'lucide-react'
import { formatFileSize, formatDuration } from '@/lib/format'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage
})

function DashboardPage(): React.ReactElement {
  const { t } = useTranslation('dashboard')
  const { data: stats, isLoading } = useLibraryStats()

  return (
    <PageContainer>
      <PageHeader title={t('page.title')} description={t('page.description')} />

      {isLoading || !stats ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
            <StatCard
              label={t('stats.creators')}
              value={stats.creators.total.toString()}
              icon={<Users className="size-5" />}
            />
            <StatCard
              label={t('stats.videos')}
              value={stats.videos.total.toString()}
              icon={<Film className="size-5" />}
            />
            <StatCard
              label={t('stats.cuts')}
              value={stats.cuts.total.toString()}
              icon={<Scissors className="size-5" />}
            />
            <StatCard
              label={t('stats.transcribed')}
              value={stats.videos.transcribed.toString()}
              hint={`${Math.round((stats.videos.transcribed / Math.max(stats.videos.total, 1)) * 100)}%`}
              icon={<Captions className="size-5" />}
            />
            <StatCard
              label={t('stats.totalDuration')}
              value={formatDuration(stats.videos.totalDuration + stats.cuts.totalDuration)}
              icon={<Clock className="size-5" />}
            />
            <StatCard
              label={t('stats.librarySize')}
              value={formatFileSize(stats.storage.totalBytes)}
              icon={<HardDrive className="size-5" />}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('charts.downloadsByDay')}</CardTitle>
              </CardHeader>
              <CardContent>
                <DownloadsTimelineChart data={stats.downloadsByDay} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('charts.videosByStatus')}</CardTitle>
              </CardHeader>
              <CardContent>
                <VideosByStatusChart byStatus={stats.videos.byStatus} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('charts.storageBreakdown')}</CardTitle>
              </CardHeader>
              <CardContent>
                <StorageBreakdownChart storage={stats.storage} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('charts.topCreators')}</CardTitle>
              </CardHeader>
              <CardContent>
                <TopCreatorsList creators={stats.topCreators} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
