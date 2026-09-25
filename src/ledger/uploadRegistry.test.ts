import { beforeEach, describe, expect, it } from 'vitest'
import { parseCsv } from '@/lib/csv'
import { sampleLedgerCsv } from '@/data/sampleLedger'
import { checkRepeatUpload, rememberUpload } from '@/ledger/uploadRegistry'
import { setStorageScope } from '@/lib/storageScope'

const rows = (csv: string) => parseCsv(csv).records
const lines = sampleLedgerCsv.trim().split('\n')
const header = lines[0]

describe('repeat-upload check in the browser (the only check a guest has)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setStorageScope('guest')
  })

  it('a first upload is fine; the same file again, renamed or reordered, is a repeat', () => {
    const records = rows(sampleLedgerCsv)
    expect(checkRepeatUpload(records, null).repeat).toBe(false)
    rememberUpload(records, 'p1')
    const shuffled = rows([header, ...lines.slice(1).reverse()].join('\n'))
    expect(checkRepeatUpload(shuffled, null)).toMatchObject({ repeat: true, repeatedRows: records.length })
  })

  it('a trimmed piece of an uploaded file is a repeat', () => {
    rememberUpload(rows(sampleLedgerCsv), 'p1')
    expect(checkRepeatUpload(rows([header, ...lines.slice(1, 6)].join('\n')), null).repeat).toBe(true)
  })

  it('adding the same rows back into the audit they came from is not a repeat', () => {
    const records = rows(sampleLedgerCsv)
    rememberUpload(records, 'p1')
    expect(checkRepeatUpload(records, 'p1').repeat).toBe(false)
    expect(checkRepeatUpload(records, 'p2').repeat).toBe(true)
  })

  it('a different ledger is not a repeat, even if a couple of payments overlap', () => {
    rememberUpload(rows(sampleLedgerCsv), 'p1')
    const other = [header, 'New Vendor A,N-1,2026-01-01,2026-01-05,100,100,,,', 'New Vendor B,N-2,2026-01-01,2026-01-06,200,200,,,', 'New Vendor C,N-3,2026-01-02,2026-01-07,300,300,,,', lines[1]].join('\n')
    expect(checkRepeatUpload(rows(other), null)).toMatchObject({ repeat: false, repeatedRows: 1 })
  })
})
