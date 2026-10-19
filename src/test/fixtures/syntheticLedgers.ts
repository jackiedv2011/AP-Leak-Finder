/**
 * Seeded synthetic small-business ledgers: a year of ordinary payments (rent,
 * SaaS, utilities, weekly deliveries, card purchases with no invoice number,
 * instalments, credits and refunds, vendor-name variants) with a handful of
 * real errors planted in them. Each ledger is CSV text, run through the same
 * import path as an upload, plus the planted errors keyed by data-row index,
 * so a test can score hits, false alarms and misses per check.
 *
 * Everything is deterministic for a given seed.
 */
import type { Finding, FindingType } from '@/types'

export type PlantKind =
  | 'exact_duplicate'
  | 'reference_variant_duplicate'
  | 'name_variant_duplicate'
  | 'card_double_charge'
  | 'overpayment'
  | 'bank_account_change'
  | 'unclaimed_discount'
  | 'missed_discount'
  | 'amount_outlier'

/** The check that should catch each kind of planted error. */
export const PLANT_FINDING_TYPE: Record<PlantKind, FindingType> = {
  exact_duplicate: 'exact_duplicate',
  reference_variant_duplicate: 'near_duplicate',
  name_variant_duplicate: 'exact_duplicate',
  card_double_charge: 'near_duplicate',
  overpayment: 'overpayment',
  bank_account_change: 'bank_account_change',
  unclaimed_discount: 'unclaimed_discount',
  missed_discount: 'missed_discount',
  amount_outlier: 'amount_outlier',
}

export interface Plant {
  kind: PlantKind
  /** Data-row indexes (0 = first row after the header) a catching finding must include. */
  rows: number[]
  note: string
}

export interface SyntheticLedger {
  name: string
  csv: string
  rowCount: number
  plants: Plant[]
}

interface Row {
  vendor: string
  invoice: string | null
  invoiceDate: Date | null
  invoiceAmount: number | null
  paymentDate: Date
  amount: number
  terms: string | null
  account: string | null
  category: string
}

const YEAR = 2025
const HEADER = 'vendor,invoice_number,invoice_date,invoice_amount,payment_date,amount_paid,terms,bank_account_last4,category,currency'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const money = (n: number) => Math.round(n * 100) / 100
const day = (month: number, d: number) => new Date(YEAR, month - 1, d)
const addDays = (date: Date, n: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n)
const iso = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '')
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const inYear = (d: Date) => d.getFullYear() === YEAR

class LedgerBuilder {
  readonly rows: Row[] = []
  private readonly planted: Array<{ kind: PlantKind; rows: Row[]; note: string }> = []
  /** Rows a plant has already used, so two plants never alter the same payment. */
  private readonly used = new Set<Row>()
  readonly rand: () => number

  constructor(seed: number) {
    this.rand = mulberry32(seed)
  }

  between(min: number, max: number) {
    return min + this.rand() * (max - min)
  }
  int(min: number, max: number) {
    return Math.floor(this.between(min, max + 1))
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.rand() * items.length)]
  }
  chance(p: number) {
    return this.rand() < p
  }

  add(row: Row): Row {
    if (inYear(row.paymentDate)) this.rows.push(row)
    return row
  }
  plant(kind: PlantKind, rows: Row[], note: string) {
    this.planted.push({ kind, rows, note })
  }

  /**
   * A payment this ledger has already added, matching the filter, chosen at random.
   * Never a credit, a row another plant used, or a payment on an invoice that has a
   * credit or refund against it (the refund would rightly cancel the planted error).
   */
  any(filter: (r: Row) => boolean): Row {
    const credited = new Set(this.rows.filter((r) => r.amount < 0 && r.invoice).map((r) => `${r.vendor}|${r.invoice!.replace(/^CM-/, '')}`))
    const candidates = this.rows.filter((r) => r.amount > 0 && !this.used.has(r) && !(r.invoice && credited.has(`${r.vendor}|${r.invoice}`)) && filter(r))
    if (!candidates.length) throw new Error('No row matches the plant filter')
    const row = this.pick(candidates)
    this.used.add(row)
    return row
  }

  build(name: string): SyntheticLedger {
    const ordered = [...this.rows].sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime())
    const index = new Map(ordered.map((r, i) => [r, i]))
    const lines = ordered.map((r) =>
      [r.vendor, r.invoice ?? '', iso(r.invoiceDate), r.invoiceAmount === null ? '' : r.invoiceAmount.toFixed(2), iso(r.paymentDate), r.amount.toFixed(2), r.terms ?? '', r.account ?? '', r.category, 'USD']
        .map(csvCell)
        .join(',')
    )
    return {
      name,
      csv: [HEADER, ...lines].join('\n'),
      rowCount: ordered.length,
      plants: this.planted.map((p) => ({
        kind: p.kind,
        rows: p.rows.map((r) => {
          const i = index.get(r)
          if (i === undefined) throw new Error(`Planted row is outside ${YEAR}: ${p.note}`)
          return i
        }),
        note: p.note,
      })),
    }
  }
}

// ── Ordinary activity ──────────────────────────────────────────────────────

interface MonthlyBill {
  vendor: string | string[]
  amount: number | [number, number]
  prefix: string
  dueDay: number
  category: string
  account?: string | null
  terms?: string | null
  /** From this month on the price changes (a SaaS plan change). */
  change?: { month: number; amount: number }
  /** No invoice number: charged to a card. */
  card?: boolean
}

function monthly(b: LedgerBuilder, bill: MonthlyBill) {
  for (let month = 1; month <= 12; month++) {
    const fixed = typeof bill.amount === 'number'
    let amount = fixed ? (bill.amount as number) : money(b.between(...(bill.amount as [number, number])))
    if (bill.change && month >= bill.change.month) amount = bill.change.amount
    const invoiceDate = day(month, bill.dueDay)
    b.add({
      vendor: Array.isArray(bill.vendor) ? b.pick(bill.vendor) : bill.vendor,
      invoice: bill.card ? null : `${bill.prefix}-${YEAR}${String(month).padStart(2, '0')}`,
      invoiceDate: bill.card ? null : invoiceDate,
      invoiceAmount: bill.card ? null : amount,
      paymentDate: addDays(invoiceDate, bill.card ? 0 : b.int(0, 4)),
      amount,
      terms: bill.terms ?? null,
      account: bill.account ?? null,
      category: bill.category,
    })
  }
}

interface Supplier {
  vendor: string | string[]
  /** Typical delivery value and how far it wanders, as a fraction. */
  base: number
  spread: number
  /** Days between deliveries. */
  cadence: number
  prefix: string
  firstNumber: number
  terms: string
  account?: string | null
  category: string
  /** Chance of paying a discount-terms invoice late at full price, and of paying in the window at full price. */
  lateRate?: number
  fullInWindowRate?: number
}

/** Delivery invoices on a fixed cadence, paid on their terms. Discounts are mostly taken. */
function supplier(b: LedgerBuilder, s: Supplier): Row[] {
  const rows: Row[] = []
  let number = s.firstNumber
  for (let date = day(1, b.int(1, s.cadence)); inYear(date); date = addDays(date, s.cadence)) {
    const invoiceAmount = money(s.base * (1 + b.between(-s.spread, s.spread)))
    const vendor = Array.isArray(s.vendor) ? b.pick(s.vendor) : s.vendor
    const discount = s.terms.match(/^(\d+)\/(\d+)/)
    let paymentDate: Date
    let amount = invoiceAmount
    let plant: PlantKind | null = null
    if (discount) {
      const [pct, window] = [Number(discount[1]), Number(discount[2])]
      if (b.chance(s.lateRate ?? 0)) {
        paymentDate = addDays(date, b.int(window + 5, 30))
        plant = 'missed_discount'
      } else {
        paymentDate = addDays(date, b.int(3, window))
        if (b.chance(s.fullInWindowRate ?? 0)) plant = 'unclaimed_discount'
        else amount = money(invoiceAmount * (1 - pct / 100))
      }
    } else {
      const net = Number(s.terms.match(/net (\d+)/)?.[1] ?? 30)
      paymentDate = addDays(date, b.int(Math.max(0, net - 5), net + 3))
    }
    const row = b.add({ vendor, invoice: `${s.prefix}${number++}`, invoiceDate: date, invoiceAmount, paymentDate, amount, terms: s.terms, account: s.account ?? null, category: s.category })
    if (!inYear(paymentDate)) continue
    if (plant) b.plant(plant, [row], `${vendor} ${row.invoice}`)
    rows.push(row)
  }
  return rows
}

/** Identical amount on every delivery, each with its own invoice number (a standing order). */
function standingOrder(b: LedgerBuilder, o: { vendor: string; amount: number; weekdays: number[]; prefix: string; category: string }) {
  let number = 1
  for (let date = day(1, 1); inYear(date); date = addDays(date, 1)) {
    if (!o.weekdays.includes(date.getDay())) continue
    b.add({ vendor: o.vendor, invoice: `${o.prefix}${String(number++).padStart(4, '0')}`, invoiceDate: date, invoiceAmount: o.amount, paymentDate: addDays(date, 7), amount: o.amount, terms: 'net 7', account: null, category: o.category })
  }
}

interface CardVendor {
  names: string[]
  perMonth: [number, number]
  /** Random amounts in a range, or a fixed menu of prices (fuel fill-ups, parking, a usual coffee order). */
  range?: [number, number]
  prices?: number[]
  category: string
}

function cardPurchases(b: LedgerBuilder, vendors: CardVendor[]) {
  for (const v of vendors) {
    for (let month = 1; month <= 12; month++) {
      const count = b.int(...v.perMonth)
      for (let i = 0; i < count; i++) {
        const date = day(month, b.int(1, 28))
        const amount = v.prices ? b.pick(v.prices) : money(b.between(...v.range!))
        b.add({ vendor: b.pick(v.names), invoice: null, invoiceDate: null, invoiceAmount: null, paymentDate: date, amount, terms: null, account: null, category: v.category })
      }
    }
  }
}

/** Larger jobs billed once and paid in two or three instalments that add up to the invoice. */
function instalments(b: LedgerBuilder, o: { vendor: string; count: number; range: [number, number]; prefix: string; category: string; showInvoiceAmount: boolean }) {
  for (let i = 0; i < o.count; i++) {
    const invoiceDate = day(b.int(1, 10), b.int(1, 28))
    const total = money(b.between(...o.range))
    const parts = b.int(2, 3)
    const first = money(total * (parts === 2 ? 0.5 : 0.4))
    const second = parts === 2 ? money(total - first) : money(total * 0.3)
    const amounts = parts === 2 ? [first, second] : [first, second, money(total - first - second)]
    const invoice = `${o.prefix}${100 + i}`
    amounts.forEach((amount, k) =>
      b.add({ vendor: o.vendor, invoice, invoiceDate, invoiceAmount: o.showInvoiceAmount ? total : null, paymentDate: addDays(invoiceDate, 14 + k * 30), amount, terms: 'net 30', account: null, category: o.category })
    )
  }
}

/** Returned goods: a partial refund booked against a delivery's invoice, and stand-alone credit memos. */
function creditsAndRefunds(b: LedgerBuilder, deliveries: Row[], count: number) {
  for (let i = 0; i < count; i++) {
    const original = b.pick(deliveries.filter((r) => r.invoiceAmount !== null))
    const refund = money(original.invoiceAmount! * b.between(0.05, 0.3))
    if (b.chance(0.5)) {
      b.add({ ...original, amount: -refund, paymentDate: addDays(original.paymentDate, b.int(7, 20)), terms: null })
    } else {
      b.add({ ...original, invoice: `CM-${original.invoice}`, invoiceAmount: -refund, amount: -refund, paymentDate: addDays(original.paymentDate, b.int(7, 20)), terms: null })
    }
  }
}

// ── Planted errors ─────────────────────────────────────────────────────────

function plantExactDuplicate(b: LedgerBuilder, filter: (r: Row) => boolean, vendorSpelling?: string) {
  const original = b.any((r) => filter(r) && r.paymentDate.getMonth() < 11)
  const copy = b.add({ ...original, vendor: vendorSpelling ?? original.vendor, paymentDate: addDays(original.paymentDate, b.int(9, 25)) })
  b.plant(vendorSpelling ? 'name_variant_duplicate' : 'exact_duplicate', [original, copy], `${original.vendor} ${original.invoice} paid twice${vendorSpelling ? ` (as "${vendorSpelling}")` : ''}`)
}

function plantReferenceVariant(b: LedgerBuilder, filter: (r: Row) => boolean) {
  const original = b.any((r) => filter(r) && r.paymentDate.getMonth() < 11)
  const keyed = original.invoice!.replace(/^([A-Za-z]+)-?/, (_, letters: string) => `${letters.toLowerCase()} `)
  const copy = b.add({ ...original, invoice: keyed, paymentDate: addDays(original.paymentDate, b.int(4, 15)) })
  b.plant('reference_variant_duplicate', [original, copy], `${original.vendor} ${original.invoice} paid again as "${keyed}"`)
}

function plantCardDoubleCharge(b: LedgerBuilder, vendorNames: string[]) {
  const original = b.any((r) => r.invoice === null && vendorNames.includes(r.vendor) && r.paymentDate.getMonth() < 11)
  const copy = b.add({ ...original, paymentDate: addDays(original.paymentDate, 1) })
  b.plant('card_double_charge', [original, copy], `${original.vendor} card charge of ${original.amount} repeated next day`)
}

/** Paid more than the invoice. With `refunded`, the vendor later sends the difference back, so nothing should be flagged. */
function plantOverpayment(b: LedgerBuilder, filter: (r: Row) => boolean, refunded = false) {
  const row = b.any((r) => filter(r) && !r.terms?.match(/^\d+\//) && r.paymentDate.getMonth() < 11)
  const over = money(b.between(80, 600))
  row.amount = money(row.invoiceAmount! + over)
  if (refunded) b.add({ ...row, amount: -over, paymentDate: addDays(row.paymentDate, b.int(10, 30)), terms: null })
  else b.plant('overpayment', [row], `${row.vendor} ${row.invoice} paid ${over} over the invoice`)
}

function plantBankChange(b: LedgerBuilder, vendor: (name: string) => boolean, fromMonth: number, newAccount: string) {
  const later = b.rows.filter((r) => vendor(r.vendor) && r.account && r.amount > 0 && r.paymentDate.getMonth() + 1 >= fromMonth).sort((x, y) => x.paymentDate.getTime() - y.paymentDate.getTime())
  later.forEach((r) => (r.account = newAccount))
  b.plant('bank_account_change', [later[0]], `${later[0].vendor} paid to new account ${newAccount} from month ${fromMonth}`)
}

function plantOutlier(b: LedgerBuilder, filter: (r: Row) => boolean) {
  const row = b.any((r) => filter(r) && r.paymentDate.getMonth() < 11)
  row.invoiceAmount = money(row.invoiceAmount! * 10)
  row.amount = money(row.amount * 10)
  b.plant('amount_outlier', [row], `${row.vendor} ${row.invoice} keyed at ten times its usual value`)
}

// ── The three businesses ───────────────────────────────────────────────────

const FUEL = [40, 45, 50, 55, 60, 75]

/** A café: weekly food deliveries, a twice-weekly bread order, lots of small card purchases. ~1,400 rows. */
export function cafeLedger(seed = 11): SyntheticLedger {
  const b = new LedgerBuilder(seed)
  monthly(b, { vendor: 'Harbor Street Properties', amount: 4200, prefix: 'RENT', dueDay: 1, category: 'Rent', account: '3381', terms: 'net 0' })
  monthly(b, { vendor: 'Square', amount: 60, prefix: 'SQ', dueDay: 5, category: 'Software', card: true })
  monthly(b, { vendor: 'Toast POS', amount: 165, prefix: 'TST', dueDay: 12, category: 'Software', change: { month: 7, amount: 189 } })
  monthly(b, { vendor: 'City Power & Light', amount: [610, 980], prefix: 'CPL', dueDay: 18, category: 'Utilities', account: '7720', terms: 'net 15' })
  monthly(b, { vendor: 'Metro Water', amount: [140, 260], prefix: 'MW', dueDay: 22, category: 'Utilities', terms: 'net 20' })
  const sysco = supplier(b, { vendor: ['Sysco', 'SYSCO', 'Sysco Corp'], base: 2400, spread: 0.2, cadence: 7, prefix: 'SYS-', firstNumber: 48100, terms: '2/10 net 30', account: '5521', category: 'COGS-Food', lateRate: 0.04, fullInWindowRate: 0.02 })
  const produce = supplier(b, { vendor: 'Valley Fresh Produce', base: 640, spread: 0.25, cadence: 7, prefix: 'VF', firstNumber: 9001, terms: 'net 14', account: '1029', category: 'COGS-Produce' })
  supplier(b, { vendor: ['ACME Inc', 'Acme, Inc.', 'Acme Inc.'], base: 380, spread: 0.3, cadence: 14, prefix: 'AC-', firstNumber: 3300, terms: 'net 30', account: '0457', category: 'Packaging' })
  supplier(b, { vendor: 'Blue Ridge Coffee Roasters', base: 1150, spread: 0.15, cadence: 14, prefix: 'BR', firstNumber: 701, terms: '1/10 net 30', account: '6650', category: 'COGS-Coffee', lateRate: 0.08, fullInWindowRate: 0.02 })
  supplier(b, { vendor: 'Dairy Fresh Farms', base: 210, spread: 0.15, cadence: 2, prefix: 'DF', firstNumber: 60001, terms: 'net 14', account: '3147', category: 'COGS-Dairy' })
  standingOrder(b, { vendor: 'Sunrise Bakery', amount: 186.4, weekdays: [2, 5], prefix: 'SB', category: 'COGS-Bakery' })
  cardPurchases(b, [
    { names: ['Amazon', 'AMAZON.COM', 'Amazon.com'], perMonth: [15, 25], range: [8.5, 320], category: 'Supplies' },
    { names: ['Costco'], perMonth: [6, 10], range: [45, 480], category: 'Supplies' },
    { names: ['Restaurant Depot'], perMonth: [8, 14], range: [60, 900], category: 'COGS-Food' },
    { names: ['WebstaurantStore'], perMonth: [3, 6], range: [25, 640], category: 'Supplies' },
    { names: ['Shell'], perMonth: [6, 10], prices: FUEL, category: 'Fuel' },
    { names: ['Home Depot', 'HOME DEPOT', 'The Home Depot'], perMonth: [2, 6], range: [12, 260], category: 'Repairs' },
    { names: ['Uber Eats'], perMonth: [6, 12], range: [18, 95], category: 'Meals' },
  ])
  creditsAndRefunds(b, [...sysco, ...produce], 10)

  plantExactDuplicate(b, (r) => r.vendor === 'Valley Fresh Produce')
  plantExactDuplicate(b, (r) => r.vendor === 'ACME Inc', 'Acme, Inc.')
  plantReferenceVariant(b, (r) => r.vendor === 'Valley Fresh Produce')
  plantCardDoubleCharge(b, ['Costco'])
  plantOverpayment(b, (r) => r.vendor === 'Valley Fresh Produce')
  plantOverpayment(b, (r) => r.vendor === 'Valley Fresh Produce', true)
  plantBankChange(b, (v) => v === 'Valley Fresh Produce', 10, '8890')
  plantOutlier(b, (r) => r.vendor === 'Blue Ridge Coffee Roasters')
  return b.build('cafe')
}

/** A builder: subcontractors paid in instalments, sequential invoice numbers that collide across vendors, fuel. ~1,600 rows. */
export function contractorLedger(seed = 23): SyntheticLedger {
  const b = new LedgerBuilder(seed)
  monthly(b, { vendor: 'Northgate Yard Leasing', amount: 6500, prefix: 'LEASE', dueDay: 1, category: 'Rent', account: '1180', terms: 'net 0' })
  monthly(b, { vendor: 'Procore', amount: 549, prefix: 'PC', dueDay: 3, category: 'Software', card: true })
  monthly(b, { vendor: 'QuickBooks Online', amount: 90, prefix: 'QB', dueDay: 9, category: 'Software', card: true, change: { month: 4, amount: 99 } })
  monthly(b, { vendor: 'Verizon Wireless', amount: [410, 470], prefix: 'VZ', dueDay: 14, category: 'Phone', terms: 'net 20' })
  monthly(b, { vendor: 'Pacific Gas', amount: [220, 640], prefix: 'PG', dueDay: 20, category: 'Utilities', terms: 'net 15' })
  const lumber = supplier(b, { vendor: ['Builders FirstSource', 'BUILDERS FIRSTSOURCE INC'], base: 5200, spread: 0.45, cadence: 7, prefix: 'BFS-', firstNumber: 220400, terms: '2/10 net 30', account: '4410', category: 'Materials', lateRate: 0.1, fullInWindowRate: 0.02 })
  const concrete = supplier(b, { vendor: 'Granite Ready Mix', base: 3100, spread: 0.35, cadence: 10, prefix: 'GRM', firstNumber: 5100, terms: 'net 30', account: '2290', category: 'Materials' })
  // Small trades number their invoices from 1001, so numbers collide across vendors.
  supplier(b, { vendor: 'Ortiz Plumbing', base: 1800, spread: 0.5, cadence: 12, prefix: '', firstNumber: 1001, terms: 'net 15', account: '7734', category: 'Subcontractors' })
  supplier(b, { vendor: 'Brightline Electric LLC', base: 2400, spread: 0.5, cadence: 15, prefix: '', firstNumber: 1001, terms: 'net 15', account: '3012', category: 'Subcontractors' })
  supplier(b, { vendor: 'Hernandez Drywall', base: 1300, spread: 0.4, cadence: 9, prefix: 'HD', firstNumber: 40, terms: 'net 10', account: null, category: 'Subcontractors' })
  supplier(b, { vendor: 'Ferguson Supply', base: 1900, spread: 0.5, cadence: 7, prefix: 'FS-', firstNumber: 880100, terms: 'net 30', account: '6120', category: 'Materials' })
  supplier(b, { vendor: 'ABC Supply Co', base: 2600, spread: 0.4, cadence: 5, prefix: 'ABC', firstNumber: 31000, terms: 'net 30', account: '5508', category: 'Materials' })
  instalments(b, { vendor: 'Summit Steel Fabrication', count: 8, range: [8000, 26000], prefix: 'SSF-', category: 'Subcontractors', showInvoiceAmount: true })
  instalments(b, { vendor: 'Coastal Roofing', count: 6, range: [6000, 18000], prefix: 'CR', category: 'Subcontractors', showInvoiceAmount: false })
  cardPurchases(b, [
    { names: ['Home Depot', 'HOME DEPOT', 'The Home Depot'], perMonth: [45, 70], range: [6, 900], category: 'Materials' },
    { names: ["Lowe's", 'LOWES'], perMonth: [8, 15], range: [9, 600], category: 'Materials' },
    { names: ['Chevron'], perMonth: [25, 40], prices: FUEL, category: 'Fuel' },
    { names: ['United Rentals'], perMonth: [3, 8], range: [150, 2200], category: 'Equipment' },
    { names: ['Sunbelt Rentals'], perMonth: [2, 5], range: [120, 1400], category: 'Equipment' },
    { names: ['Grainger'], perMonth: [3, 6], range: [25, 700], category: 'Tools' },
  ])
  creditsAndRefunds(b, [...lumber, ...concrete], 14)

  plantExactDuplicate(b, (r) => r.vendor === 'Granite Ready Mix')
  plantExactDuplicate(b, (r) => r.vendor === 'Hernandez Drywall')
  plantExactDuplicate(b, (r) => r.vendor === 'Builders FirstSource', 'BUILDERS FIRSTSOURCE INC')
  plantReferenceVariant(b, (r) => r.vendor === 'Granite Ready Mix')
  plantCardDoubleCharge(b, ['Sunbelt Rentals'])
  plantOverpayment(b, (r) => r.vendor === 'Granite Ready Mix')
  plantOverpayment(b, (r) => r.vendor === 'Ortiz Plumbing')
  plantBankChange(b, (v) => v === 'Granite Ready Mix', 9, '9917')
  plantOutlier(b, (r) => r.vendor === 'Hernandez Drywall')
  return b.build('contractor')
}

/** A dental clinic: few large suppliers, many SaaS subscriptions, lab work, card purchases. ~1,000 rows. */
export function clinicLedger(seed = 37): SyntheticLedger {
  const b = new LedgerBuilder(seed)
  monthly(b, { vendor: 'Lakeside Medical Plaza', amount: 7800, prefix: 'LMP', dueDay: 1, category: 'Rent', account: '6610', terms: 'net 0' })
  monthly(b, { vendor: 'Dentrix', amount: 459, prefix: 'DTX', dueDay: 2, category: 'Software', terms: 'net 10' })
  monthly(b, { vendor: 'Weave', amount: 399, prefix: 'WV', dueDay: 6, category: 'Software', card: true })
  monthly(b, { vendor: 'Google Workspace', amount: 84, prefix: 'GW', dueDay: 1, category: 'Software', card: true, change: { month: 3, amount: 98 } })
  monthly(b, { vendor: 'Zoom', amount: 15.99, prefix: 'ZM', dueDay: 11, category: 'Software', card: true })
  monthly(b, { vendor: 'Adobe', amount: 59.99, prefix: 'AD', dueDay: 11, category: 'Software', card: true })
  monthly(b, { vendor: 'Comcast Business', amount: [189, 214], prefix: 'CB', dueDay: 16, category: 'Utilities', terms: 'net 20' })
  monthly(b, { vendor: 'Lakeside Electric Coop', amount: [520, 840], prefix: 'LEC', dueDay: 19, category: 'Utilities', account: '4402', terms: 'net 15' })
  const henry = supplier(b, { vendor: ['Henry Schein', 'Henry Schein, Inc.', 'HENRY SCHEIN INC'], base: 3200, spread: 0.3, cadence: 14, prefix: 'HS-', firstNumber: 771200, terms: '2/15 net 45', account: '5150', category: 'Dental supplies', lateRate: 0.06, fullInWindowRate: 0.04 })
  const patterson = supplier(b, { vendor: 'Patterson Dental', base: 1400, spread: 0.35, cadence: 14, prefix: 'PD', firstNumber: 33000, terms: 'net 30', account: '7810', category: 'Dental supplies' })
  supplier(b, { vendor: 'Precision Dental Lab', base: 210, spread: 0.6, cadence: 3, prefix: 'PDL-', firstNumber: 5000, terms: 'net 30', account: '2201', category: 'Lab fees' })
  supplier(b, { vendor: 'Benco Dental', base: 900, spread: 0.4, cadence: 7, prefix: 'BEN', firstNumber: 120400, terms: 'net 30', account: '3390', category: 'Dental supplies' })
  supplier(b, { vendor: 'Glidewell Laboratories', base: 160, spread: 0.5, cadence: 3, prefix: 'GL-', firstNumber: 900100, terms: 'net 30', account: '8124', category: 'Lab fees' })
  supplier(b, { vendor: 'Stericycle', base: 285, spread: 0.02, cadence: 28, prefix: 'STC', firstNumber: 9100, terms: 'net 30', account: null, category: 'Waste' })
  cardPurchases(b, [
    { names: ['Amazon', 'Amazon.com'], perMonth: [18, 28], range: [9, 260], category: 'Office' },
    { names: ['Costco'], perMonth: [3, 6], range: [30, 420], category: 'Office' },
    { names: ['Staples'], perMonth: [1, 4], range: [14, 180], category: 'Office' },
    { names: ['DoorDash'], perMonth: [4, 8], range: [35, 180], category: 'Meals' },
    { names: ['USPS'], perMonth: [4, 8], prices: [9.85, 14.4, 28.75], category: 'Postage' },
    { names: ['Starbucks'], perMonth: [3, 6], prices: [24.5, 31.5, 38.75], category: 'Meals' },
    { names: ['ParkMobile'], perMonth: [2, 5], prices: [10, 15, 20], category: 'Travel' },
  ])
  creditsAndRefunds(b, [...henry, ...patterson], 8)

  plantExactDuplicate(b, (r) => r.vendor === 'Patterson Dental')
  plantExactDuplicate(b, (r) => r.vendor === 'Henry Schein', 'HENRY SCHEIN INC')
  plantReferenceVariant(b, (r) => r.vendor === 'Precision Dental Lab')
  plantCardDoubleCharge(b, ['Staples'])
  plantOverpayment(b, (r) => r.vendor === 'Patterson Dental')
  plantOverpayment(b, (r) => r.vendor === 'Precision Dental Lab', true)
  plantBankChange(b, (v) => v.toLowerCase().startsWith('henry schein'), 8, '6031')
  plantOutlier(b, (r) => r.vendor === 'Patterson Dental')
  return b.build('clinic')
}

// ── Scoring ────────────────────────────────────────────────────────────────

export interface CheckScore {
  hits: number
  falseAlarms: Finding[]
  misses: Plant[]
}

/**
 * A finding is a hit when it is the check that should catch a planted error
 * and covers all of that plant's rows; any other finding is a false alarm. A
 * plant no finding covers is a miss. `rowOf` maps a record id to its data-row index.
 */
export function scoreFindings(ledger: SyntheticLedger, findings: Finding[], rowOf: (recordId: string) => number): Record<FindingType, CheckScore> {
  const types: FindingType[] = ['exact_duplicate', 'near_duplicate', 'overpayment', 'unclaimed_discount', 'missed_discount', 'bank_account_change', 'amount_outlier', 'shared_invoice_number']
  const score = Object.fromEntries(types.map((t) => [t, { hits: 0, falseAlarms: [], misses: [] }])) as unknown as Record<FindingType, CheckScore>
  const caught = new Set<Plant>()
  for (const finding of findings) {
    const rows = new Set(finding.relatedRecords.map((r) => rowOf(r.id)))
    const plants = ledger.plants.filter((p) => PLANT_FINDING_TYPE[p.kind] === finding.type && p.rows.every((row) => rows.has(row)))
    if (plants.length) {
      score[finding.type].hits += 1
      plants.forEach((p) => caught.add(p))
    } else score[finding.type].falseAlarms.push(finding)
  }
  for (const plant of ledger.plants) if (!caught.has(plant)) score[PLANT_FINDING_TYPE[plant.kind]].misses.push(plant)
  return score
}
