import { useTranslation } from 'react-i18next'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { formatFileSize } from '@/lib/format'
import type { StorageStats } from '@shared/types'

interface StorageBreakdownChartProps {
  storage: StorageStats
}

export function StorageBreakdownChart({ storage }: StorageBreakdownChartProps): React.ReactElement {
  const { t } = useTranslation('dashboard')
  const data = [
    {
      key: 'videos',
      label: t('storage.videos'),
      value: storage.videosBytes,
      color: 'hsl(var(--primary))'
    },
    {
      key: 'cuts',
      label: t('storage.cuts'),
      value: storage.cutsBytes,
      color: 'hsl(var(--accent-foreground))'
    }
  ].filter((d) => d.value > 0)

  if (data.length === 0) {
    return (
      <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        {t('charts.noData')}
      </p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
        >
          {data.map((d) => (
            <Cell key={d.key} fill={d.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => formatFileSize(Number(value ?? 0))}
          contentStyle={{
            background: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '0.5rem',
            fontSize: '0.8rem'
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
