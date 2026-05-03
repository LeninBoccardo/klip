import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreatorsPaginated, useDeleteCreator, useRestoreCreator } from '@/hooks/use-creators'
import { CreatorCard } from '@components/features/creators/CreatorCard'
import { CreatorContextMenu } from '@components/features/creators/CreatorContextMenu'
import { CreatorFilters } from '@components/features/creators/CreatorFilters'
import { RegisterCreatorDialog } from '@components/features/creators/RegisterCreatorDialog'
import {
  PageContainer,
  PageHeader,
  ResponsiveGrid,
  PaginationControls
} from '@/components/shared'
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav'
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
import { Plus, Users, Download } from 'lucide-react'
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
  const [registerOpen, setRegisterOpen] = useState(false)

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

  const items = data?.data ?? []
  const { getItemProps } = useListKeyboardNav({
    count: items.length,
    onOpen: (i) => {
      const c = items[i]
      if (c) navigate({ to: '/creators/$creatorId', params: { creatorId: c.id } })
    },
    onDelete: (i) => {
      const c = items[i]
      if (c && c.status !== 'deleted') handleDelete(c.id, c.name)
    },
    enabled: !registerOpen
  })

  return (
    <PageContainer>
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
        actions={
          <Button onClick={() => setRegisterOpen(true)}>
            <Plus className="mr-2 size-4" />
            {t('page.newButton')}
          </Button>
        }
      />

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
          <EmptyContent>
            {search ? (
              <Button variant="outline" onClick={() => setSearch('')}>
                {t('empty.ctaClearSearch')}
              </Button>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Button onClick={() => setRegisterOpen(true)}>
                  <Plus className="mr-2 size-4" />
                  {t('empty.ctaRegister')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/downloads' })}>
                  <Download className="mr-2 size-4" />
                  {t('empty.ctaDownload')}
                </Button>
              </div>
            )}
          </EmptyContent>
        </Empty>
      )}

      {!isLoading && data && data.data.length > 0 && (
        <>
          <ResponsiveGrid columns="wide">
            {data.data.map((creator, i) => (
              <div
                key={creator.id}
                {...getItemProps(i)}
                className="rounded-xl outline-none ring-ring ring-offset-2 ring-offset-background data-[focused=true]:ring-2"
              >
                <CreatorContextMenu
                  creatorId={creator.id}
                  creatorName={creator.name}
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
                </CreatorContextMenu>
              </div>
            ))}
          </ResponsiveGrid>

          <PaginationControls
            page={data.page}
            totalPages={data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      <RegisterCreatorDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onCreated={(id) => navigate({ to: '/creators/$creatorId', params: { creatorId: id } })}
        onOpenExisting={(id) => navigate({ to: '/creators/$creatorId', params: { creatorId: id } })}
      />
    </PageContainer>
  )
}
