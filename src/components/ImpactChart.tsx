import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Finding, FindingClass } from '@/types'
import { FINDING_TYPE_LABELS } from '@/lib/labels'
import { formatCurrency } from '@/lib/format'

interface ImpactChartProps {
  findings: Finding[]
}

const CLASS_COLOR: Record<FindingClass, string> = {
  recoverable: '#0F7A4D',
  review: '#B7791F',
  opportunity: '#2563A6',
}

export function ImpactChart({ findings }: ImpactChartProps) {
  const byType = new Map<string, { type: string; label: string; impact: number; class: FindingClass }>()

  for (const f of findings) {
    const existing = byType.get(f.type)
    if (existing) {
      existing.impact += f.dollarImpact
    } else {
      byType.set(f.type, {
        type: f.type,
        label: FINDING_TYPE_LABELS[f.type],
        impact: f.dollarImpact,
        class: f.class,
      })
    }
  }

  const data = Array.from(byType.values()).sort((a, b) => b.impact - a.impact)

  if (data.length === 0) return null

  return (
    <Card className="border-hairline">
      <CardHeader>
        <CardTitle>Dollar impact by finding type</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ width: '100%', height: Math.max(220, data.length * 44) }}>
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4E0D6" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => formatCurrency(v)}
                tick={{ fontSize: 12, fill: '#6b6375' }}
                stroke="#E4E0D6"
              />
              <YAxis
                type="category"
                dataKey="label"
                width={220}
                tick={{ fontSize: 12, fill: '#14213D' }}
                stroke="#E4E0D6"
              />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                contentStyle={{ borderRadius: 8, borderColor: '#E4E0D6', fontSize: 13 }}
              />
              <Bar dataKey="impact" radius={[0, 4, 4, 0]}>
                {data.map((entry) => (
                  <Cell key={entry.type} fill={CLASS_COLOR[entry.class]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
