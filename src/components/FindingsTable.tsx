import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { Finding } from '@/types'
import { CLASS_LABELS, SEVERITY_LABELS } from '@/lib/labels'
import { formatCurrency } from '@/lib/format'

interface FindingsTableProps {
  findings: Finding[]
  onSelect: (finding: Finding) => void
}

export function FindingsTable({ findings, onSelect }: FindingsTableProps) {
  if (findings.length === 0) {
    return (
      <div className="rounded-lg border border-hairline bg-white p-8 text-center text-sm text-muted-foreground">
        No findings in this category.
      </div>
    )
  }

  return (
    <div className="min-w-0 rounded-lg border border-hairline bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Severity</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Issue</TableHead>
            <TableHead>Class</TableHead>
            <TableHead className="text-right">Impact</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {findings.map((finding) => (
            <TableRow key={finding.id}>
              <TableCell>
                <Badge variant={finding.severity}>{SEVERITY_LABELS[finding.severity]}</Badge>
              </TableCell>
              <TableCell className="font-medium text-ink">{finding.vendor}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                <button
                  type="button"
                  className="rounded-sm text-left underline-offset-4 transition-colors hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() => onSelect(finding)}
                  aria-label={`View evidence for ${finding.title}`}
                >
                  {finding.title}
                </button>
              </TableCell>
              <TableCell>
                <Badge variant={finding.class}>{CLASS_LABELS[finding.class]}</Badge>
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums text-ink">
                {formatCurrency(finding.dollarImpact)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
