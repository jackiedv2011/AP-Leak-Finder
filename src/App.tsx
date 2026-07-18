import { lazy, Suspense, useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { UploadCard } from '@/components/UploadCard'
import { StatCards } from '@/components/StatCards'
import { FindingsTable } from '@/components/FindingsTable'
import { FindingDialog } from '@/components/FindingDialog'
import { LetterDialog } from '@/components/LetterDialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { parseCsv } from '@/lib/csv'
import { detectFindings } from '@/lib/detection'
import { getSampleLedger } from '@/data/sampleLedger'
import type { APRecord, DetectionResult, Finding, FindingClass } from '@/types'

// Recharts is the heaviest dependency in the bundle — load it only once
// results are shown, instead of in the initial upload-screen chunk.
const ImpactChart = lazy(() => import('@/components/ImpactChart').then((m) => ({ default: m.ImpactChart })))

type ClassFilter = 'all' | FindingClass

interface LoadedLedger {
  records: APRecord[]
  skippedCount: number
  result: DetectionResult
}

function App() {
  const [ledger, setLedger] = useState<LoadedLedger | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [classFilter, setClassFilter] = useState<ClassFilter>('all')
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null)
  const [letterFinding, setLetterFinding] = useState<Finding | null>(null)

  async function handleFileSelected(file: File) {
    setError(null)
    try {
      const text = await file.text()
      const { records, skippedCount } = parseCsv(text)

      if (records.length === 0) {
        setError(
          'No usable rows were found in that file. Make sure it has vendor, payment_date, and amount_paid columns.'
        )
        return
      }

      const result = detectFindings(records)
      setLedger({ records, skippedCount, result })
    } catch {
      setError('Could not read that file. Please upload a valid CSV.')
    }
  }

  function handleLoadSample() {
    setError(null)
    const { records, skippedCount } = getSampleLedger()
    const result = detectFindings(records)
    setLedger({ records, skippedCount, result })
  }

  function handleStartOver() {
    setLedger(null)
    setClassFilter('all')
    setSelectedFinding(null)
    setLetterFinding(null)
    setError(null)
  }

  const filteredFindings = useMemo(() => {
    if (!ledger) return []
    if (classFilter === 'all') return ledger.result.findings
    return ledger.result.findings.filter((f) => f.class === classFilter)
  }, [ledger, classFilter])

  const vendorCount = useMemo(() => {
    if (!ledger) return 0
    return new Set(ledger.records.map((r) => r.vendor)).size
  }, [ledger])

  if (!ledger) {
    return <UploadCard onFileSelected={handleFileSelected} onLoadSample={handleLoadSample} error={error} />
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">AP Leak Finder</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Analyzed {ledger.records.length} payment{ledger.records.length === 1 ? '' : 's'} across{' '}
            {vendorCount} vendor{vendorCount === 1 ? '' : 's'}.
            {ledger.skippedCount > 0 && ` Skipped ${ledger.skippedCount} malformed row${ledger.skippedCount === 1 ? '' : 's'}.`}
          </p>
        </div>
        <Button variant="outline" onClick={handleStartOver}>
          <RotateCcw className="h-4 w-4" />
          Start over
        </Button>
      </header>

      <div className="flex min-w-0 flex-col gap-6">
        <StatCards
          findings={ledger.result.findings}
          recoverableTotal={ledger.result.recoverableTotal}
          reviewTotal={ledger.result.reviewTotal}
          opportunityTotal={ledger.result.opportunityTotal}
        />

        <Suspense fallback={<div className="h-[220px] rounded-lg border border-hairline bg-white" />}>
          <ImpactChart findings={ledger.result.findings} />
        </Suspense>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Findings</h2>
            <Tabs value={classFilter} onValueChange={(v) => setClassFilter(v as ClassFilter)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="recoverable">Recoverable</TabsTrigger>
                <TabsTrigger value="review">Review</TabsTrigger>
                <TabsTrigger value="opportunity">Opportunity</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <FindingsTable findings={filteredFindings} onSelect={setSelectedFinding} />
        </div>
      </div>

      <FindingDialog
        finding={selectedFinding}
        onClose={() => setSelectedFinding(null)}
        onGenerateLetter={(finding) => {
          setSelectedFinding(null)
          // Defer to the next tick so the outgoing dialog's click event fully
          // finishes bubbling before the letter dialog mounts — opening it
          // synchronously makes Radix's outside-click detection see the same
          // click and immediately dismiss the new dialog.
          setTimeout(() => setLetterFinding(finding), 0)
        }}
      />
      <LetterDialog finding={letterFinding} onClose={() => setLetterFinding(null)} />
    </div>
  )
}

export default App
