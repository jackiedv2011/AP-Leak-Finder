import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'
import type { Finding } from '@/types'
import { CheckCircle2, AlertTriangle, TrendingUp } from 'lucide-react'

interface StatCardsProps {
  findings: Finding[]
  recoverableTotal: number
  reviewTotal: number
  opportunityTotal: number
}

export function StatCards({ findings, recoverableTotal, reviewTotal, opportunityTotal }: StatCardsProps) {
  const recoverableCount = findings.filter((f) => f.class === 'recoverable').length
  const reviewCount = findings.filter((f) => f.class === 'review').length
  const opportunityCount = findings.filter((f) => f.class === 'opportunity').length

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card className="border-hairline">
        <CardContent className="flex flex-col gap-2 p-6">
          <div className="flex items-center gap-2 text-recoverable">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">Recoverable</span>
          </div>
          <span className="text-3xl font-semibold tabular-nums text-ink">{formatCurrency(recoverableTotal)}</span>
          <span className="text-xs text-muted-foreground">
            {recoverableCount} finding{recoverableCount === 1 ? '' : 's'} — likely to get back
          </span>
        </CardContent>
      </Card>

      <Card className="border-hairline">
        <CardContent className="flex flex-col gap-2 p-6">
          <div className="flex items-center gap-2 text-review">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">Needs review</span>
          </div>
          <span className="text-3xl font-semibold tabular-nums text-ink">{formatCurrency(reviewTotal)}</span>
          <span className="text-xs text-muted-foreground">
            {reviewCount} finding{reviewCount === 1 ? '' : 's'} — flagged, not guaranteed
          </span>
        </CardContent>
      </Card>

      <Card className="border-hairline">
        <CardContent className="flex flex-col gap-2 p-6">
          <div className="flex items-center gap-2 text-opportunity">
            <TrendingUp className="h-4 w-4" />
            <span className="text-sm font-medium">Future savings</span>
          </div>
          <span className="text-3xl font-semibold tabular-nums text-ink">{formatCurrency(opportunityTotal)}</span>
          <span className="text-xs text-muted-foreground">
            {opportunityCount} finding{opportunityCount === 1 ? '' : 's'} — process improvement, not past recovery
          </span>
        </CardContent>
      </Card>
    </div>
  )
}
