import { useTranslation } from 'react-i18next'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'
import type { LibraryStats } from '@shared/types'

interface VideosByStatusChartProps {
  byStatus: LibraryStats['videos']['byStatus']
}

const STATUSES: Array<keyof LibraryStats['videos']['byStatus']> = ['active', 'missing', 'deleted']
// Direct `var(--name)` references — see DownloadsTimelineChart for why
// `hsl(var(--name))` doesn't work with this codebase's oklch tokens.
// `--chart-2` (warm orange) for "missing" matches the design system's
// chart palette instead of the never-defined `--warning` token the old
// fallback referenced.
const COLORS: Record<keyof LibraryStats['videos']['byStatus'], string> = {
  active: 'var(--chart-1)',
  missing: 'var(--chart-2)',
  deleted: 'var(--destructive)'
}

export function VideosByStatusChart({ byStatus }: VideosByStatusChartProps): React.ReactElement {
  const { t } = useTranslation('dashboard')
  const data = STATUSES.map((status) => ({
    status,
    label: t(`status.${status}`),
    count: byStatus[status] ?? 0
  }))

  if (data.every((d) => d.count === 0)) {
    return (
      <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        {t('charts.noData')}
      </p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
        <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
        <YAxis
          stroke="var(--muted-foreground)"
          fontSize={11}
          allowDecimals={false}
          width={32}
        />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
          contentStyle={{
            background: 'var(--popover)',
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
            fontSize: '0.8rem',
            color: 'var(--popover-foreground)'
          }}
          labelStyle={{ color: 'var(--popover-foreground)' }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.status} fill={COLORS[d.status]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
