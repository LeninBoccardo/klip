import { useTranslation } from 'react-i18next'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'
import type { LibraryStats } from '@shared/types'

interface VideosByStatusChartProps {
  byStatus: LibraryStats['videos']['byStatus']
}

const STATUSES: Array<keyof LibraryStats['videos']['byStatus']> = ['active', 'missing', 'deleted']
const COLORS: Record<keyof LibraryStats['videos']['byStatus'], string> = {
  active: 'hsl(var(--primary))',
  missing: 'hsl(var(--warning, 35 90% 50%))',
  deleted: 'hsl(var(--destructive))'
}

export function VideosByStatusChart({
  byStatus
}: VideosByStatusChartProps): React.ReactElement {
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
        <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={11}
          allowDecimals={false}
          width={32}
        />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '0.5rem',
            fontSize: '0.8rem'
          }}
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
