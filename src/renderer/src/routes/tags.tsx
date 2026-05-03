import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAllDistinctTags } from '@/hooks/use-tags'
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav'
import { PageContainer, PageHeader } from '@/components/shared'
import { RenameTagDialog } from '@components/features/tags/RenameTagDialog'
import { DeleteTagDialog } from '@components/features/tags/DeleteTagDialog'
import { TagContextMenu } from '@components/features/tags/TagContextMenu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@ui/table'
import { Button } from '@ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@ui/input-group'
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription
} from '@ui/empty'
import { Skeleton } from '@ui/skeleton'
import { Search, Pencil, Trash2, Tags as TagsIcon } from 'lucide-react'
import type { TagAggregation } from '@shared/types'

export const Route = createFileRoute('/tags')({
  component: TagsPage
})

type SortKey = 'tag' | 'videoCount' | 'cutCount' | 'total'

function TagsPage(): React.ReactElement {
  const { t } = useTranslation('tags')
  const navigate = useNavigate()
  const { data: tags, isLoading } = useAllDistinctTags()
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'total', desc: true })
  const [renameTarget, setRenameTarget] = useState<TagAggregation | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TagAggregation | null>(null)

  const existingTagNames = useMemo(() => new Set((tags ?? []).map((t) => t.tag)), [tags])

  const visible = useMemo(() => {
    if (!tags) return []
    const trimmed = filter.trim().toLowerCase()
    const filtered = trimmed
      ? tags.filter((t) => t.tag.toLowerCase().includes(trimmed))
      : tags.slice()
    const dir = sort.desc ? -1 : 1
    return filtered.sort((a, b) => {
      if (sort.key === 'tag') return a.tag.localeCompare(b.tag) * dir
      const aVal = sort.key === 'total' ? a.videoCount + a.cutCount : a[sort.key]
      const bVal = sort.key === 'total' ? b.videoCount + b.cutCount : b[sort.key]
      return (aVal - bVal) * dir
    })
  }, [tags, filter, sort])

  const toggleSort = (key: SortKey): void => {
    setSort((prev) => (prev.key === key ? { key, desc: !prev.desc } : { key, desc: true }))
  }

  const sortIndicator = (key: SortKey): string => {
    if (sort.key !== key) return ''
    return sort.desc ? ' ↓' : ' ↑'
  }

  const hasFilter = filter.trim().length > 0

  const { getItemProps } = useListKeyboardNav({
    count: visible.length,
    onOpen: (i) => {
      const tag = visible[i]
      if (tag) setRenameTarget(tag)
    },
    onDelete: (i) => {
      const tag = visible[i]
      if (tag) setDeleteTarget(tag)
    },
    enabled: renameTarget === null && deleteTarget === null
  })

  return (
    <PageContainer>
      <PageHeader title={t('manage.pageTitle')} description={t('manage.pageDescription')} />

      <InputGroup className="max-w-md">
        <InputGroupAddon>
          <InputGroupText>
            <Search />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          placeholder={t('manage.searchPlaceholder')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </InputGroup>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {!isLoading && visible.length === 0 && (
        <Empty className="min-h-[300px] border rounded-lg">
          <EmptyHeader>
            <EmptyMedia>
              <TagsIcon className="size-10 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>{t('manage.empty.title')}</EmptyTitle>
            <EmptyDescription>
              {hasFilter ? t('manage.empty.withFilters') : t('manage.empty.withoutFilters')}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {hasFilter ? (
              <Button variant="outline" onClick={() => setFilter('')}>
                {t('manage.empty.ctaClearFilter')}
              </Button>
            ) : (
              <Button variant="outline" onClick={() => navigate({ to: '/' })}>
                {t('manage.empty.ctaBrowse')}
              </Button>
            )}
          </EmptyContent>
        </Empty>
      )}

      {!isLoading && visible.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button
                    type="button"
                    className="font-medium hover:underline"
                    onClick={() => toggleSort('tag')}
                  >
                    {t('manage.table.tag')}
                    {sortIndicator('tag')}
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    className="font-medium hover:underline"
                    onClick={() => toggleSort('videoCount')}
                  >
                    {t('manage.table.videos')}
                    {sortIndicator('videoCount')}
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    className="font-medium hover:underline"
                    onClick={() => toggleSort('cutCount')}
                  >
                    {t('manage.table.cuts')}
                    {sortIndicator('cutCount')}
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    className="font-medium hover:underline"
                    onClick={() => toggleSort('total')}
                  >
                    {t('manage.table.total')}
                    {sortIndicator('total')}
                  </button>
                </TableHead>
                <TableHead className="w-32 text-right">{t('manage.table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((tag, i) => (
                <TagContextMenu
                  key={tag.tag}
                  tag={tag.tag}
                  onRename={() => setRenameTarget(tag)}
                  onDelete={() => setDeleteTarget(tag)}
                >
                  <TableRow
                    {...getItemProps(i)}
                    className="data-[focused=true]:bg-accent/50"
                  >
                    <TableCell className="font-mono text-sm">{tag.tag}</TableCell>
                  <TableCell className="text-right tabular-nums">{tag.videoCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{tag.cutCount}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {tag.videoCount + tag.cutCount}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRenameTarget(tag)}
                        aria-label={t('manage.actions.rename')}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(tag)}
                        aria-label={t('manage.actions.delete')}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                  </TableRow>
                </TagContextMenu>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <RenameTagDialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null)
        }}
        tag={renameTarget}
        existingTags={existingTagNames}
      />
      <DeleteTagDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        tag={deleteTarget}
      />
    </PageContainer>
  )
}
