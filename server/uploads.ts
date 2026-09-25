/**
 * Repeat-upload detection for the Free track, shared by the server (which
 * enforces it) and the browser (which warns before anything is sent).
 *
 * Every payment row becomes a fingerprint of what identifies a payment —
 * vendor, invoice, payment date, amount — so renaming the file, reordering
 * rows or deleting some of them does not make it a new ledger. An upload is a
 * repeat when at least half of its rows were already uploaded to a different
 * audit. A new month's export that shares a few days with the last one is not.
 */
export const REPEAT_UPLOAD_SHARE = 0.5

export interface FingerprintRow {
  vendor: string
  invoiceNumber: string | null
  paymentDate: string | Date
  amountPaid: number
}

function isoDay(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** cyrb53 — a stable 53-bit string hash in both runtimes. Identity, not security, so no crypto is needed. */
function hash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export function rowFingerprint(row: FingerprintRow): string {
  const vendor = row.vendor.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  const invoice = (row.invoiceNumber ?? '').toLowerCase().replace(/\s+/g, '')
  return hash(`${vendor}|${invoice}|${isoDay(row.paymentDate)}|${Math.round(row.amountPaid * 100)}`)
}

export interface RepeatCheck {
  repeat: boolean
  /** Rows of this upload already uploaded to another audit. */
  repeatedRows: number
  totalRows: number
}

/** `seenElsewhere` answers whether a fingerprint was already uploaded to a different audit. */
export function checkRepeat(fingerprints: string[], seenElsewhere: (fp: string) => boolean): RepeatCheck {
  const unique = [...new Set(fingerprints)]
  const repeatedRows = unique.filter(seenElsewhere).length
  return { repeat: unique.length > 0 && repeatedRows / unique.length >= REPEAT_UPLOAD_SHARE, repeatedRows, totalRows: unique.length }
}

export function repeatMessage(check: RepeatCheck): string {
  return `This file repeats ${check.repeatedRows} of its ${check.totalRows} payments from a ledger you already uploaded. On the Free plan each ledger can be audited once — uploading it again, or a smaller piece of it, doesn't unlock more findings. Upgrade to Growth or Flat to see every finding in every audit.`
}
