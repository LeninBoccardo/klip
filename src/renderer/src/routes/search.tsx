import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchTranscripts } from '@/hooks/use-search'
import { PageContainer, PageHeader } from '@/components/shared'
import { TranscriptSnippet } from '@components/features/search/TranscriptSnippet'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@ui/input-group'
import { Button } from '@ui/button'
import { Skeleton } from '@ui/skeleton'
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription
} from '@ui/empty'
import { Search as SearchIcon, Captions } from 'lucide-react'
import { z } from 'zod'

const searchSchema = z.object({
  q: z.string().optional()
})

export const Route = createFileRoute('/search')({
  component: SearchPage,
  validateSearch: searchSchema
})

const PAGE_SIZE = 25
const MAX_OFFSET = 1000

function SearchPage(): React.ReactElement {
  const { t } = useTranslation('search')
  const navigate = useNavigate()
  const { q } = Route.useSearch()
  const [query, setQuery] = useState(q ?? '')
  const [offset, setOffset] = useState(0)

  const { data, isLoading } = useSearchTranscripts(query, {
    limit: PAGE_SIZE,
    offset
  })

  const trimmed = query.trim()
  const onChange = (next: string): void => {
    setQuery(next)
    setOffset(0)
    navigate({
      to: '/search',
      search: { q: next || undefined },
      replace: true
    })
  }

  const total = data?.totalApproximate ?? 0
  const hits = data?.hits ?? []
  const canLoadMore = hits.length === PAGE_SIZE && offset + PAGE_SIZE < MAX_OFFSET

  return (
    <PageContainer>
      <PageHeader
        title={t('transcripts.pageTitle')}
        description={t('transcripts.pageDescription')}
      />

      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>
            <SearchIcon />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          autoFocus
          placeholder={t('transcripts.placeholder')}
          value={query}
          onChange={(e) => onChange(e.target.value)}
        />
      </InputGroup>

      {trimmed.length > 0 && data && (
        <p className="text-sm text-muted-foreground">
          {total >= 1000
            ? t('transcripts.totalCapped')
            : t('transcripts.totalApproximate', { count: total })}
        </p>
      )}

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!isLoading && trimmed.length > 0 && hits.length === 0 && (
        <Empty className="min-h-[300px] border rounded-lg">
          <EmptyHeader>
            <EmptyMedia>
              <Captions className="size-10 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>{t('transcripts.noResults', { query: trimmed })}</EmptyTitle>
            <EmptyDescription>{t('transcripts.pageDescription')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => onChange('')}>
              {t('transcripts.noResultsCta')}
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {!isLoading && hits.length > 0 && (
        <ul className="space-y-2">
          {hits.map((hit) => (
            <li
              key={hit.videoId}
              className="rounded-lg border bg-card transition-colors hover:bg-accent/30"
            >
              <button
                type="button"
                onClick={() =>
                  navigate({ to: '/videos/$videoId', params: { videoId: hit.videoId } })
                }
                className="flex w-full flex-col gap-1 p-3 text-left"
              >
                <span className="font-medium">{hit.title}</span>
                {hit.snippet && (
                  <TranscriptSnippet
                    snippet={hit.snippet}
                    className="text-sm text-muted-foreground"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {canLoadMore && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={() => setOffset((prev) => prev + PAGE_SIZE)}>
            {t('transcripts.loadMore')}
          </Button>
        </div>
      )}
    </PageContainer>
  )
}
