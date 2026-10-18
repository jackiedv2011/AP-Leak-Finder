import { describe, expect, it } from 'vitest'
import { normalizeVendorName, resolveVendors } from '@/lib/vendorResolution'

describe('normalizeVendorName', () => {
  it('lowercases, strips punctuation, and removes legal suffixes', () => {
    expect(normalizeVendorName('Acme Corp.')).toBe('acme')
    expect(normalizeVendorName('ACME, INC')).toBe('acme')
    expect(normalizeVendorName("O'Brien & Sons LLC")).toBe('o brien sons')
  })
})

describe('resolveVendors', () => {
  it('auto-merges vendor names that are identical after normalization', () => {
    const result = resolveVendors([
      { vendor: 'Acme Corp.', bankAccountLast4: null },
      { vendor: 'ACME CORP', bankAccountLast4: null },
      { vendor: 'Acme, Corp', bankAccountLast4: null },
    ])

    const group = result.groups.find((g) => g.members.includes('Acme Corp.'))
    expect(group).toBeDefined()
    expect(group!.tier).toBe('auto_merge')
    expect(new Set(group!.members)).toEqual(new Set(['Acme Corp.', 'ACME CORP', 'Acme, Corp']))

    const canonical = result.resolveVendorName('Acme Corp.')
    expect(result.resolveVendorName('ACME CORP')).toBe(canonical)
    expect(result.resolveVendorName('Acme, Corp')).toBe(canonical)
  })

  it('auto-merges via token-set Jaccard similarity regardless of word order', () => {
    const result = resolveVendors([
      { vendor: 'Blue Bag Packaging', bankAccountLast4: null },
      { vendor: 'Packaging Blue Bag', bankAccountLast4: null },
    ])

    expect(result.resolveVendorName('Blue Bag Packaging')).toBe(
      result.resolveVendorName('Packaging Blue Bag')
    )
  })

  it('auto-merges via Damerau-Levenshtein word-level similarity when one word has a typo', () => {
    const result = resolveVendors([
      { vendor: 'Sierra Coffee Supply', bankAccountLast4: null },
      { vendor: 'Sierra Coffee Suply', bankAccountLast4: null },
    ])

    expect(result.resolveVendorName('Sierra Coffee Supply')).toBe(
      result.resolveVendorName('Sierra Coffee Suply')
    )
  })

  it('leaves unrelated vendor names unresolved (no_match, no group)', () => {
    const result = resolveVendors([
      { vendor: 'Northline Supply', bankAccountLast4: null },
      { vendor: 'Golden Bean Exports', bankAccountLast4: null },
    ])

    expect(result.resolveVendorName('Northline Supply')).toBe('Northline Supply')
    expect(result.resolveVendorName('Golden Bean Exports')).toBe('Golden Bean Exports')
    expect(result.groups.find((g) => g.members.includes('Northline Supply'))).toBeUndefined()
    expect(
      result.needsReview.some(
        (m) =>
          (m.vendorA === 'Northline Supply' || m.vendorB === 'Northline Supply') &&
          (m.vendorA === 'Golden Bean Exports' || m.vendorB === 'Golden Bean Exports')
      )
    ).toBe(false)
  })

  it('flags a moderately similar pair as needs_review rather than auto-merging it', () => {
    const result = resolveVendors([
      { vendor: 'Riverstone Logistics', bankAccountLast4: null },
      { vendor: 'Riverstone Freight', bankAccountLast4: null },
    ])

    expect(result.resolveVendorName('Riverstone Logistics')).toBe('Riverstone Logistics')
    expect(result.resolveVendorName('Riverstone Freight')).toBe('Riverstone Freight')
    expect(
      result.needsReview.some(
        (m) =>
          (m.vendorA === 'Riverstone Logistics' || m.vendorB === 'Riverstone Logistics') &&
          (m.vendorA === 'Riverstone Freight' || m.vendorB === 'Riverstone Freight')
      )
    ).toBe(true)
  })

  it('uses a shared bank account as an independent signal to elevate a moderate match to auto_merge', () => {
    const withoutBankMatch = resolveVendors([
      { vendor: 'Riverstone Logistics', bankAccountLast4: null },
      { vendor: 'Riverstone Freight', bankAccountLast4: null },
    ])
    expect(withoutBankMatch.resolveVendorName('Riverstone Logistics')).not.toBe(
      withoutBankMatch.resolveVendorName('Riverstone Freight')
    )

    const withBankMatch = resolveVendors([
      { vendor: 'Riverstone Logistics', bankAccountLast4: '4471' },
      { vendor: 'Riverstone Freight', bankAccountLast4: '4471' },
    ])
    expect(withBankMatch.resolveVendorName('Riverstone Logistics')).toBe(
      withBankMatch.resolveVendorName('Riverstone Freight')
    )
  })

  it('groups transitively through Union-Find even when the endpoints are not directly similar enough', () => {
    // A~B and B~C both clear the needs_review/auto_merge bar via bank match,
    // but A and C alone share no tokens and no bank account.
    const result = resolveVendors([
      { vendor: 'Riverstone Logistics', bankAccountLast4: '1111' },
      { vendor: 'Riverstone Freight', bankAccountLast4: '1111' },
      { vendor: 'Freight Solutions', bankAccountLast4: '1111' },
    ])

    const canonicalA = result.resolveVendorName('Riverstone Logistics')
    const canonicalB = result.resolveVendorName('Riverstone Freight')
    const canonicalC = result.resolveVendorName('Freight Solutions')
    expect(canonicalA).toBe(canonicalB)
    expect(canonicalB).toBe(canonicalC)
  })

  it('does not fuzzy-merge distinct short numeric suffixes (e.g. "Vendor 1" vs "Vendor 2")', () => {
    const result = resolveVendors([
      { vendor: 'Vendor 1', bankAccountLast4: null },
      { vendor: 'Vendor 2', bankAccountLast4: null },
    ])

    expect(result.resolveVendorName('Vendor 1')).toBe('Vendor 1')
    expect(result.resolveVendorName('Vendor 2')).toBe('Vendor 2')
    expect(result.groups.find((g) => g.members.includes('Vendor 1'))).toBeUndefined()
  })

  it('picks the most frequently occurring name in a group as the canonical name', () => {
    const result = resolveVendors([
      { vendor: 'Acme Corp.', bankAccountLast4: null },
      { vendor: 'Acme Corp.', bankAccountLast4: null },
      { vendor: 'Acme Corp.', bankAccountLast4: null },
      { vendor: 'ACME CORP', bankAccountLast4: null },
    ])

    expect(result.resolveVendorName('ACME CORP')).toBe('Acme Corp.')
  })
})
