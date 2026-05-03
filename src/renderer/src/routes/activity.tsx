import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuditLogRecent } from '@/hooks/use-audit-log'
import { PageContainer, PageHeader } from '@/components/shared'
import { AuditEntryRow } from '@components/features/activity/AuditEntryRow'
import { Button } from '@ui/button'
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription
} from '@ui/empty'
import { Skeleton } from '@ui/skeleton'
import { Activity as ActivityIcon } from 'lucide-react'

export const Route = createFileRoute('/activity')({
  component: ActivityPage
})

const PAGE_SIZE = 50
const MAX_LIMIT = 1000

function ActivityPage(): React.ReactElement {
  const { t } = useTranslation('activity')
  const navigate = useNavigate()
  const [limit, setLimit] = useState(PAGE_SIZE)
  const { data: entries, isLoading } = useAuditLogRecent(limit)

  const canLoadMore = !!entries && entries.length === limit && limit < MAX_LIMIT

  return (
    <PageContainer>
      <PageHeader title={t('page.title')} description={t('page.description')} />

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {!isLoading && (!entries || entries.length === 0) && (
        <Empty className="min-h-[300px] border rounded-lg">
          <EmptyHeader>
            <EmptyMedia>
              <ActivityIcon className="size-10 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>{t('empty.title')}</EmptyTitle>
            <EmptyDescription>{t('empty.description')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => navigate({ to: '/' })}>
              {t('empty.cta')}
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {!isLoading && entries && entries.length > 0 && (
        <>
          <ul className="space-y-2">
            {entries.map((entry) => (
              <AuditEntryRow key={entry.id} entry={entry} />
            ))}
          </ul>
          {canLoadMore && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => setLimit((prev) => Math.min(prev + PAGE_SIZE, MAX_LIMIT))}
              >
                {t('loadMore')}
              </Button>
            </div>
          )}
        </>
      )}
    </PageContainer>
  )
}
