import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
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

function LibraryPage() {
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

  const handleDelete = (id: string, name: string) => {
    deleteCreator.mutate(id, {
      onSuccess: () => toast.success(`"${name}" deleted`),
      onError: (err) => toast.error(`Failed to delete: ${err.message}`)
    })
  }

  const handleRestore = (id: string, name: string) => {
    restoreCreator.mutate(id, {
      onSuccess: () => toast.success(`"${name}" restored`),
      onError: (err) => toast.error(`Failed to restore: ${err.message}`)
    })
  }

  return (
    <PageContainer>
      <PageHeader title="Library" description="Browse and manage your creator library" />

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
            <EmptyTitle>No creators found</EmptyTitle>
            <EmptyDescription>
              {search
                ? 'Try a different search term.'
                : 'Download a video or add creator folders to your root directory to get started.'}
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
