import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Finding } from '@/types'
import { CLASS_LABELS, SEVERITY_LABELS } from '@/lib/labels'
import { formatCurrency, formatDate } from '@/lib/format'
import { FileText } from 'lucide-react'

interface FindingDialogProps {
  finding: Finding | null
  onClose: () => void
  onGenerateLetter: (finding: Finding) => void
}

export function FindingDialog({ finding, onClose, onGenerateLetter }: FindingDialogProps) {
  const actionLabel = finding?.class === 'recoverable' ? 'Draft recovery request' : 'Create internal review note'

  return (
    <Dialog open={finding !== null} onOpenChange={(open) => !open && onClose()}>
      {finding && (
        <DialogContent>
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={finding.severity}>{SEVERITY_LABELS[finding.severity]} severity</Badge>
              <Badge variant={finding.class}>{CLASS_LABELS[finding.class]}</Badge>
            </div>
            <DialogTitle>{finding.title}</DialogTitle>
            <DialogDescription className="text-ink/80">{finding.explanation}</DialogDescription>
          </DialogHeader>

          <div className="flex items-baseline justify-between rounded-md bg-secondary px-4 py-3">
            <span className="text-sm text-muted-foreground">Potential impact</span>
            <span className="text-xl font-semibold tabular-nums text-ink">
              {formatCurrency(finding.dollarImpact)}
            </span>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium text-ink">Related records</h4>
            <div className="overflow-x-auto rounded-md border border-hairline">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Invoice date</TableHead>
                    <TableHead>Payment date</TableHead>
                    <TableHead className="text-right">Invoice amt</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead>Bank last4</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {finding.relatedRecords.map((record) => (
                    <TableRow key={record.rowIndex}>
                      <TableCell className="font-mono text-xs">{record.invoiceNumber ?? '—'}</TableCell>
                      <TableCell className="text-xs">{formatDate(record.invoiceDate)}</TableCell>
                      <TableCell className="text-xs">{formatDate(record.paymentDate)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {record.invoiceAmount !== null ? formatCurrency(record.invoiceAmount) : '—'}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {formatCurrency(record.amountPaid)}
                      </TableCell>
                      <TableCell className="text-xs">{record.bankAccountLast4 ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => onGenerateLetter(finding)}>
              <FileText className="h-4 w-4" />
              {actionLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
