/**
 * Hostile and messy CSV input. The parser's contract: a row it keeps has the
 * value the file meant; a row it cannot read correctly is skipped and counted,
 * never guessed at; nothing crashes.
 */
import { describe, expect, it } from 'vitest'
import { parseCsv } from '@/lib/csv'
import { parseCurrency, parseDate } from '@/lib/format'

const HEADER = 'vendor,invoice_number,invoice_date,payment_date,invoice_amount,amount_paid,terms,bank_account_last4,category'

describe('parseCurrency — never a silently wrong amount', () => {
  it('reads US-formatted money exactly', () => {
    expect(parseCurrency('$1,234.56')).toBe(1234.56)
    expect(parseCurrency('1,234,567.89')).toBe(1234567.89)
    expect(parseCurrency(' $ 12 ')).toBe(12)
    expect(parseCurrency('-$150.00')).toBe(-150)
    expect(parseCurrency('$-150.00')).toBe(-150)
    expect(parseCurrency('(1,234.00)')).toBe(-1234)
    expect(parseCurrency('.50')).toBe(0.5)
    expect(parseCurrency('0')).toBe(0)
  })

  it('rejects European or misplaced grouping instead of misreading it', () => {
    // "1.234,56" must not become 1.23456, and "1,23" must not become 123.
    expect(parseCurrency('1.234,56')).toBeNull()
    expect(parseCurrency('1,23')).toBeNull()
    expect(parseCurrency('12,34,567')).toBeNull()
    expect(parseCurrency('1,2345.00')).toBeNull()
  })

  it('rejects formulas, words, and currencies it cannot convert', () => {
    for (const raw of ['=1+1', '=SUM(A1:A2)', '+1000', '@100', 'USD 100', '100 EUR', '€100', 'twelve', '1e5', 'NaN', 'Infinity', '--5', '$']) {
      expect(parseCurrency(raw), raw).toBeNull()
    }
  })
})

describe('parseDate', () => {
  it('reads a two-digit year the way a US spreadsheet writes it (1/5/24 → 2024)', () => {
    const date = parseDate('1/5/24')
    expect(date?.getFullYear()).toBe(2024)
    expect(date?.getMonth()).toBe(0)
    expect(date?.getDate()).toBe(5)
  })

  it('still rejects impossible or ambiguous dates rather than guessing', () => {
    for (const raw of ['13/13/2024', '2/30/2024', '2024-02-30', '31/12/2024', '12/31', 'yesterday', '45292', '2024-1-1T']) {
      expect(parseDate(raw), raw).toBeNull()
    }
  })

  it('handles a leap day', () => {
    expect(parseDate('2024-02-29')?.getDate()).toBe(29)
    expect(parseDate('2023-02-29')).toBeNull()
  })
})

describe('parseCsv — structure', () => {
  it('an empty file, a header-only file, and whitespace-only rows produce no records and no crash', () => {
    for (const text of ['', '\n\n', HEADER, `${HEADER}\n`, `${HEADER}\n,,,,,,,,\n   ,  ,,,,,,,\n`]) {
      const parsed = parseCsv(text)
      expect(parsed.records).toHaveLength(0)
    }
  })

  it('strips a UTF-8 byte-order mark so the first column is still recognized', () => {
    const parsed = parseCsv(`﻿${HEADER}\nAcme,A1,2025-01-01,2025-01-05,100,100,,,\n`)
    expect(parsed.detectedColumns).toContain('vendor')
    expect(parsed.records).toHaveLength(1)
  })

  it('does not care about column order, header case or spacing, and keeps unknown columns out of the way', () => {
    const text = [
      'Amount Paid,  PAYMENT DATE ,Memo,Vendor,Invoice Number',
      '"1,500.00",03/04/2025,paid by check,"Smith, Jones & Co",SJ-1',
    ].join('\n')
    const parsed = parseCsv(text)
    expect(parsed.records).toHaveLength(1)
    const [r] = parsed.records
    expect(r.vendor).toBe('Smith, Jones & Co')
    expect(r.amountPaid).toBe(1500)
    expect(r.invoiceNumber).toBe('SJ-1')
    expect(r.paymentDate.getMonth()).toBe(2)
    expect(parsed.unrecognizedHeaders).toEqual(['Memo'])
  })

  it('recognizes the column names common accounting exports use', () => {
    const text = ['Vendor Name,Invoice No,Invoice Date,Date Paid,Invoice Total,Payment Amount', 'Acme,A-1,2025-01-01,2025-01-10,100,100'].join('\n')
    const parsed = parseCsv(text)
    expect(parsed.detectedColumns.sort()).toEqual(['amount_paid', 'invoice_amount', 'invoice_date', 'invoice_number', 'payment_date', 'vendor'])
    expect(parsed.records).toHaveLength(1)
  })

  it('a quoted field with a newline, a stray quote, rows with too many or too few cells — none crash', () => {
    const text = [
      HEADER,
      '"Multi\nLine Vendor",M1,2025-01-01,2025-01-02,10,10,,,',
      'Short Row,S1,2025-01-01,2025-01-02',
      'Long Row,L1,2025-01-01,2025-01-02,10,10,,,,extra,extra',
      'Bad "quote,Q1,2025-01-01,2025-01-02,10,10,,,',
    ].join('\n')
    expect(() => parseCsv(text)).not.toThrow()
    const parsed = parseCsv(text)
    expect(parsed.records.length + parsed.skippedCount).toBeGreaterThanOrEqual(3)
  })

  it('a row whose amount cannot be read is skipped and counted, not stored as a wrong number', () => {
    const text = [HEADER, 'Euro Co,E1,2025-01-01,2025-01-02,"1.234,56","1.234,56",,,', 'Good Co,G1,2025-01-01,2025-01-02,10,10,,,'].join('\n')
    const parsed = parseCsv(text)
    expect(parsed.records.map((r) => r.vendor)).toEqual(['Good Co'])
    expect(parsed.skippedCount).toBe(1)
  })

  it('a formula in a vendor cell is kept as text — never evaluated, never interpreted as an amount', () => {
    const parsed = parseCsv([HEADER, '"=HYPERLINK(""http://x"",""y"")",F1,2025-01-01,2025-01-02,10,10,,,'].join('\n'))
    expect(parsed.records[0].vendor).toContain('=HYPERLINK')
    expect(parsed.records[0].amountPaid).toBe(10)
  })

  it('an extremely long field does not hang the parser or vendor resolution', () => {
    const long = 'A'.repeat(20000)
    const rows = [HEADER, `${long},X1,2025-01-01,2025-01-02,10,10,,,`, `${long}B,X2,2025-01-01,2025-01-02,10,10,,,`, `${long}C D,X3,2025-01-01,2025-01-02,10,10,,,`]
    const started = performance.now()
    const parsed = parseCsv(rows.join('\n'))
    expect(parsed.records).toHaveLength(3)
    expect(performance.now() - started).toBeLessThan(2000)
  })

  it('an .xlsx file read as text is rejected with nothing recognized, not half-parsed', () => {
    // First bytes of every .xlsx: a ZIP local-file header.
    const parsed = parseCsv('PK\u0003\u0004\u0014\u0000\u0006\u0000\b\u0000\u0000\u0000!\u0000[Content_Types].xml')
    expect(parsed.records).toHaveLength(0)
    expect(parsed.detectedColumns).toHaveLength(0)
  })
})
