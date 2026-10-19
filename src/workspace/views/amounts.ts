const plainAmount = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * A per-check total for display: USD as money, a ledger with no currency column
 * as a plain number (it is not known to be dollars), anything else with its code.
 */
export function formatCauseValue(value: number, currency: string, money: (value: number) => string): string {
  if (currency === 'USD') return money(value)
  return currency === 'Unknown' ? plainAmount.format(value) : `${plainAmount.format(value)} ${currency}`
}

/** "Flagged exposure · Unknown" reads as an error; say what it means. */
export function currencyLabel(currency: string): string {
  return currency === 'Unknown' ? 'no currency in file' : currency
}

/** Dollars as typed ("6,800" or "$6800.50") to whole cents, without floating point. 0 when it isn't an amount. */
export function dollarsToCents(text: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.replace(/[$,\s]/g, ''))
  if (!match) return 0
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : 0
}
