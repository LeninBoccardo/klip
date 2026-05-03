import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { LibraryStats } from '@shared/types'

interface TopCreatorsListProps {
  creators: LibraryStats['topCreators']
}

export function TopCreatorsList({ creators }: TopCreatorsListProps): React.ReactElement {
  const { t } = useTranslation('dashboard')
  const navigate = useNavigate()

  if (creators.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('charts.noData')}</p>
  }

  const max = creators[0]?.videoCount ?? 1

  return (
    <ol className="space-y-2">
      {creators.map((creator, index) => (
        <li key={creator.creatorId}>
          <button
            type="button"
            onClick={() =>
              navigate({ to: '/creators/$creatorId', params: { creatorId: creator.creatorId } })
            }
            className="group flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/40"
          >
            <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
              {index + 1}.
            </span>
            <span className="min-w-0 flex-1 truncate group-hover:text-foreground">
              {creator.name}
            </span>
            <div className="flex w-32 items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(creator.videoCount / max) * 100}%` }}
                />
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {t('topCreators.videoCount', { count: creator.videoCount })}
              </span>
            </div>
          </button>
        </li>
      ))}
    </ol>
  )
}
