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

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tickFormatter={formatTick}
          stroke="hsl(var(--muted-foreground))"
          fontSize={11}
          interval="preserveStartEnd"
        />
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
        <Line
          type="monotone"
          dataKey="count"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
