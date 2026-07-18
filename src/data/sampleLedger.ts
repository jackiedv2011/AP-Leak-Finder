import sampleLedgerCsv from './sample-ledger-source.csv?raw'
import { parseCsv } from '@/lib/csv'

export { sampleLedgerCsv }

export function getSampleLedger() {
  return parseCsv(sampleLedgerCsv)
}
