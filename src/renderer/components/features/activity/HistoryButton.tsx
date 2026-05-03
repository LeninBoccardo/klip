import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@ui/sheet'
import { Button } from '@ui/button'
import { Skeleton } from '@ui/skeleton'
import { ScrollArea } from '@ui/scroll-area'
import { History } from 'lucide-react'
import { useAuditLogByEntity } from '@/hooks/use-audit-log'
import { AuditEntryRow } from './AuditEntryRow'

interface HistoryButtonProps {
  entityType: 'creator' | 'video' | 'cut' | 'collection'
  entityId: string
  entityName: string
}

export function HistoryButton({
  entityType,
  entityId,
  entityName
}: HistoryButtonProps): React.ReactElement {
  const { t } = useTranslation('activity')
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <History className="mr-2 size-4" />
        {t('history.buttonLabel')}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex flex-col">
          <SheetHeader>
            <SheetTitle>{t('history.sheetTitle', { name: entityName })}</SheetTitle>
            <SheetDescription>
              {t('history.sheetDescription', { kind: t(`entity.${entityType}` as const) })}
            </SheetDescription>
          </SheetHeader>
          {/* Mount the query hook only when the sheet is open — keeps closed
              sheets from coupling to QueryClientProvider in unit tests and
              avoids unnecessary IPC roundtrips. */}
          {open && <HistoryContent entityType={entityType} entityId={entityId} />}
        </SheetContent>
      </Sheet>
    </>
  )
}

function HistoryContent({
  entityType,
  entityId
}: {
  entityType: HistoryButtonProps['entityType']
  entityId: string
}): React.ReactElement {
  const { t } = useTranslation('activity')
  const { data: entries, isLoading } = useAuditLogByEntity(entityType, entityId)

  return (
    <ScrollArea className="flex-1 px-4 pb-4">
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {!isLoading && (!entries || entries.length === 0) && (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('history.empty')}</p>
      )}
      {!isLoading && entries && entries.length > 0 && (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <AuditEntryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </ScrollArea>
  )
}
