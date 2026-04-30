import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreatorsPaginated, useDeleteCreator, useRestoreCreator } from '@/hooks/use-creators'
import { CreatorCard } from '@components/features/creators/CreatorCard'
import { CreatorFilters } from '@components/features/creators/CreatorFilters'
import {
  PageContainer,
  PageHeader,
  ResponsiveGrid,
  PaginationControls,
  EntityContextMenu
} from '@/components/shared'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@ui/empty'
import { Skeleton } from '@ui/skeleton'
import { Users } from 'lucide-react'
import { toast } from 'sonner'
import type { EntityStatus } from '@shared/types'

export const Route = createFileRoute('/')({
  component: LibraryPage
})

function LibraryPage(): React.ReactElement {
  const { t } = useTranslation('library')
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<EntityStatus[] | undefined>(undefined)

  const { data, isLoading } = useCreatorsPaginated({
    page,
    pageSize: 24,
    search: search || undefined,
    status: statusFilter
  })

  const deleteCreator = useDeleteCreator()
  const restoreCreator = useRestoreCreator()

  const handleDelete = (id: string, name: string): void => {
    deleteCreator.mutate(id, {
      onSuccess: () => toast.success(t('toasts.deleted', { name })),
      onError: (err) => toast.error(t('toasts.deleteFailed', { message: err.message }))
    })
  }

  const handleRestore = (id: string, name: string): void => {
    restoreCreator.mutate(id, {
      onSuccess: () => toast.success(t('toasts.restored', { name })),
      onError: (err) => toast.error(t('toasts.restoreFailed', { message: err.message }))
    })
  }

  return (
    <PageContainer>
      <PageHeader title={t('page.title')} description={t('page.description')} />

      <CreatorFilters
        search={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        statusFilter={statusFilter}
        onStatusFilterChange={(v) => {
          setStatusFilter(v)
          setPage(1)
        }}
      />

      {isLoading && (
        <ResponsiveGrid columns="wide">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </ResponsiveGrid>
      )}

      {!isLoading && data && data.data.length === 0 && (
        <Empty className="min-h-[300px] border rounded-lg">
          <EmptyHeader>
            <EmptyMedia>
              <Users className="size-10 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>{t('empty.title')}</EmptyTitle>
            <EmptyDescription>
              {search ? t('empty.withSearch') : t('empty.withoutSearch')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!isLoading && data && data.data.length > 0 && (
        <>
          <ResponsiveGrid columns="wide">
            {data.data.map((creator) => (
              <EntityContextMenu
                key={creator.id}
                status={creator.status}
                onDelete={() => handleDelete(creator.id, creator.name)}
                onRestore={() => handleRestore(creator.id, creator.name)}
              >
                <CreatorCard
                  creator={creator}
                  onClick={() =>
                    navigate({ to: '/creators/$creatorId', params: { creatorId: creator.id } })
                  }
                />
              </EntityContextMenu>
            ))}
          </ResponsiveGrid>

          <PaginationControls
            page={data.page}
            totalPages={data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </PageContainer>
  )
}
