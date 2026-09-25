const VENDOR_SUFFIXES = new Set(['inc', 'llc', 'ltd', 'co', 'corp'])

/** Lowercase, trim, collapse whitespace, strip trailing punctuation and common
 * legal suffixes so the same vendor matches across minor spelling variants. */
export function normalizeVendor(vendor: string): string {
  const cleaned = vendor
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,]+$/g, '')

  const words = cleaned.split(' ')
  while (words.length > 1 && VENDOR_SUFFIXES.has(words[words.length - 1].replace(/[.,]/g, ''))) {
    words.pop()
  }
  return words.join(' ').trim()
}

/**
 * Strip currency symbols/commas and parse a complete number. Returns null for
 * blank/na. Accounting-style "(150.00)" is read as a negative, since that is
 * how most ledgers export credits.
 */
export function parseCurrency(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed.toLowerCase() === 'na' || trimmed.toLowerCase() === 'n/a') return null
  const parenthesized = /^\((.*)\)$/.exec(trimmed)
  const unsigned = (parenthesized ? `-${parenthesized[1]}` : trimmed).replace(/[$\s]/g, '')
  // Commas are only accepted as US thousands separators. "1.234,56" or "1,23"
  // is some other convention, and reading it as 1.23456 or 123 would put a
  // wrong amount in the ledger without anyone noticing — so the row is skipped.
  if (!/^-?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)$/.test(unsigned)) return null
  const value = Number(unsigned.replace(/,/g, ''))
  return Number.isFinite(value) ? value : null
}

/** Whole cents, so two amounts compare the way a bookkeeper reads them rather than as floats. */
export function toCents(value: number): number {
  return Math.round(value * 100)
}

function buildLocalDate(y: number, m: number, d: number): Date | null {
  const date = new Date(y, m - 1, d)
  if (Number.isNaN(date.getTime())) return null
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null
}

/**
 * Parse a date cell as a local date (avoids UTC off-by-one). Accepts the
 * formats accounting exports actually use: ISO `YYYY-MM-DD` (with or without a
 * time suffix), `YYYY/MM/DD`, and US `MM/DD/YYYY` / `M/D/YYYY` / `M/D/YY`. A
 * slash date is always read month-first; anything else is null so the row is
 * reported as skipped rather than guessed at.
 */
export function parseDate(raw: string | null | undefined): Date | null {
  if (raw === null || raw === undefined) return null
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed.toLowerCase() === 'na' || trimmed.toLowerCase() === 'n/a') return null

  const iso = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/)
  if (iso) return buildLocalDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const us = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})$/)
  if (us) {
    // Two-digit years are how Excel writes m/d/yy; 00–69 are 2000s, 70–99 are 1900s.
    const year = us[3].length === 2 ? (Number(us[3]) < 70 ? 2000 : 1900) + Number(us[3]) : Number(us[3])
    return buildLocalDate(year, Number(us[1]), Number(us[2]))
  }

  return null
}

export function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((b.getTime() - a.getTime()) / msPerDay)
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatDate(date: Date | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export interface ParsedTerms {
  discountPct: number
  discountDays: number
  netDays: number
}

/** Above this an "early-payment discount" is almost certainly a keying error, and claiming it would ask a vendor for most of an invoice back. */
const MAX_DISCOUNT_PCT = 10

/**
 * Parse early-payment terms into discount %, discount window, and net days.
 * Accepts the spellings exports actually use — "2/10 net 30", "2/10, n/30",
 * "2% 10 net 30", "2/10 N30" — and rejects terms that cannot be real
 * (0% or implausibly large discounts, a window no shorter than the net period).
 */
export function parseTerms(raw: string | null): ParsedTerms | null {
  if (!raw) return null
  const match = raw
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*%?\s*(?:\/\s*|\s+)(\d+)\s*(?:days?)?\s*[,/]?\s*(?:net|n)\s*\/?\s*(\d+)$/i)
  if (!match) return null
  const [, pct, discountDays, netDays] = match
  const terms = {
    discountPct: parseFloat(pct),
    discountDays: parseInt(discountDays, 10),
    netDays: parseInt(netDays, 10),
  }
  if (!(terms.discountPct > 0 && terms.discountPct <= MAX_DISCOUNT_PCT)) return null
  if (!(terms.discountDays > 0 && terms.discountDays < terms.netDays)) return null
  return terms
}

/**
 * The last four digits of a bank account, however the export wrote them:
 * "****1234", "x1234", "acct ending 1234", or "457" after a spreadsheet
 * dropped the leading zero. Null when there are no digits at all.
 */
export function normalizeAccountLast4(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  return digits.slice(-4).padStart(4, '0')
}

/**
 * `1 payment` / `2 payments`. Finding explanations are read by a controller who
 * is deciding whether to chase a vendor for money — "1 extra payment(s)" reads
 * like a machine wrote it, which is exactly the wrong impression to give.
 */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm
}
