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

/** Strip currency symbols/commas and parse a complete number. Returns null for blank/na. */
export function parseCurrency(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed.toLowerCase() === 'na' || trimmed.toLowerCase() === 'n/a') return null
  const cleaned = trimmed.replace(/[$,]/g, '')
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

/** Parse a YYYY-MM-DD date string as a local date (avoids UTC off-by-one). */
export function parseDate(raw: string | null | undefined): Date | null {
  if (raw === null || raw === undefined) return null
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed.toLowerCase() === 'na' || trimmed.toLowerCase() === 'n/a') return null
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  if (Number.isNaN(date.getTime())) return null
  return date.getFullYear() === Number(y) && date.getMonth() === Number(m) - 1 && date.getDate() === Number(d)
    ? date
    : null
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

/** Parse terms like "2/10 net 30" into discount %, discount window, and net days. */
export function parseTerms(raw: string | null): ParsedTerms | null {
  if (!raw) return null
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+)\s+net\s+(\d+)$/i)
  if (!match) return null
  const [, pct, discountDays, netDays] = match
  return {
    discountPct: parseFloat(pct),
    discountDays: parseInt(discountDays, 10),
    netDays: parseInt(netDays, 10),
  }
}
