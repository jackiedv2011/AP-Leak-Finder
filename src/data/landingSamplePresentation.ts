export interface LandingSampleRecord {
  rowIndex: number
  vendor: string
  invoiceNumber: string
  paymentDate: Date
  amountPaid: number
}

/** Lightweight, display-only facts mirrored from the canonical sample ledger. */
export const landingSamplePresentation = {
  recordCount: 80,
  recoverableTotal: 11_684,
  records: [
    { rowIndex: 2, vendor: 'Sierra Coffee Supply', invoiceNumber: 'INV-3303', paymentDate: new Date('2025-02-14T00:00:00'), amountPaid: 4_850 },
    { rowIndex: 3, vendor: 'Sierra Coffee Supply', invoiceNumber: 'INV-3305', paymentDate: new Date('2025-02-28T00:00:00'), amountPaid: 6_800 },
    { rowIndex: 4, vendor: 'Sierra Coffee Supply', invoiceNumber: 'INV-3305', paymentDate: new Date('2025-03-15T00:00:00'), amountPaid: 6_800 },
    { rowIndex: 5, vendor: 'Sierra Coffee Supply', invoiceNumber: 'INV-3308', paymentDate: new Date('2025-03-07T00:00:00'), amountPaid: 6_000 },
  ] satisfies LandingSampleRecord[],
} as const
