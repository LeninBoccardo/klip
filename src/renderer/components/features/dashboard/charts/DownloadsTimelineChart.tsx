import { useTranslation } from 'react-i18next'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts'

interface DownloadsTimelineChartProps {
  data: { date: string; count: number }[]
}

export function DownloadsTimelineChart({ data }: DownloadsTimelineChartProps): React.ReactElement {
  const { t } = useTranslation('dashboard')
  const hasAny = data.some((d) => d.count > 0)

  if (!hasAny) {
    return (
      <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        {t('charts.noData')}
      </p>
    )
  }

  // Compact day label: drop the year, keep MM-DD. The full ISO date is on
  // the tooltip for precision.
  const formatTick = (iso: string): string => iso.slice(5)

  // CSS tokens are stored as fully-resolved `oklch(...)` values (Tailwind
  // v4 convention), so they must be referenced as `var(--name)` directly
  // — wrapping in `hsl(var(--name))` produces invalid CSS that browsers
  // silently drop, leaving chart elements rendered with default
  // transparent/black colors. (Was the bug across all three dashboard
  // charts before this fix.)
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tickFormatter={formatTick}
          stroke="var(--muted-foreground)"
          fontSize={11}
          interval="preserveStartEnd"
        />
        <YAxis
          stroke="var(--muted-foreground)"
          fontSize={11}
          allowDecimals={false}
          width={32}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--popover)',
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
            fontSize: '0.8rem',
            color: 'var(--popover-foreground)'
          }}
          labelStyle={{ color: 'var(--popover-foreground)' }}
        />
        <Line
          type="monotone"
          dataKey="count"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: 'var(--chart-1)' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
