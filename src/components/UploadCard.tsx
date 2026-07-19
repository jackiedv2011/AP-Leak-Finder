import { useRef, useState } from 'react'
import { Upload, Sparkles, Download, HelpCircle, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ReclaimLogo } from '@/components/ReclaimLogo'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface UploadCardProps {
  onFileSelected: (file: File) => void
  onLoadSample: () => void
  error: string | null
}

const REQUIRED_COLUMNS: { name: string; description: string }[] = [
  { name: 'vendor', description: 'Vendor / supplier name' },
  { name: 'invoice_number', description: 'Invoice ID as printed' },
  { name: 'invoice_date', description: 'Date on the invoice (YYYY-MM-DD)' },
  { name: 'payment_date', description: 'Date the business paid (YYYY-MM-DD, required)' },
  { name: 'invoice_amount', description: 'Amount the invoice was for' },
  { name: 'amount_paid', description: 'Amount actually paid (required)' },
  { name: 'terms', description: 'e.g. 2/10 net 30, net 30, net 15, or blank' },
  { name: 'bank_account_last4', description: 'Last 4 digits of the vendor bank account paid to (may be blank)' },
  { name: 'category', description: 'GL category, optional' },
]

export function UploadCard({ onFileSelected, onLoadSample, error }: UploadCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [formatOpen, setFormatOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFileSelected(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFileSelected(file)
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <Card className="w-full max-w-xl border-hairline shadow-sm">
        <CardContent className="flex flex-col items-center gap-6 p-10 text-center">
          <div className="space-y-2">
            <ReclaimLogo size={42} interactive className="justify-center" />
            <p className="text-muted-foreground">
              Identify potential payment errors and review the evidence behind them.
            </p>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`flex w-full flex-col items-center gap-4 rounded-lg border-2 border-dashed p-8 transition-colors ${
              isDragging ? 'border-ink bg-secondary' : 'border-hairline'
            }`}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div className="flex flex-col items-center gap-1">
              <p className="text-sm font-medium text-ink">Drop a CSV here, or choose a file</p>
              <p className="text-xs text-muted-foreground">Accepts .csv exports from QuickBooks, Xero, or your own AP ledger</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Upload CSV
            </Button>
          </div>

          <div className="flex w-full items-center gap-3">
            <div className="h-px flex-1 bg-hairline" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-hairline" />
          </div>

          <Button variant="outline" size="lg" onClick={onLoadSample} className="w-full">
            <Sparkles className="h-4 w-4" />
            Load sample ledger
          </Button>

          {error && (
            <p className="w-full rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
            <a href="/sample-ledger.csv" download className="inline-flex items-center gap-1 text-ink underline-offset-4 hover:underline">
              <Download className="h-3.5 w-3.5" />
              Download sample CSV
            </a>
            <button
              onClick={() => setFormatOpen(true)}
              className="inline-flex items-center gap-1 text-ink underline-offset-4 hover:underline"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              See required format
            </button>
          </div>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            This prototype runs entirely in your browser. Your uploaded data stays on your device until you refresh.
          </p>
        </CardContent>
      </Card>

      <Dialog open={formatOpen} onOpenChange={setFormatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Required CSV format</DialogTitle>
            <DialogDescription>
              Column headers are matched case-insensitively. Currency values may include $ and commas.
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Column</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {REQUIRED_COLUMNS.map((col) => (
                <TableRow key={col.name}>
                  <TableCell className="font-mono text-xs">{col.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{col.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  )
}
