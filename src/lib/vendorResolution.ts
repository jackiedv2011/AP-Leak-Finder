import { damerauLevenshteinDistance } from '@/lib/stringDistance'
import { normalizeAccountLast4 } from '@/lib/format'

export type ConfidenceTier = 'auto_merge' | 'needs_review' | 'no_match'

export interface VendorMatch {
  vendorA: string
  vendorB: string
  tier: ConfidenceTier
  score: number
  reasons: string[]
}

export interface VendorGroup {
  canonicalName: string
  members: string[]
  tier: ConfidenceTier
}

export interface VendorResolutionResult {
  groups: VendorGroup[]
  needsReview: VendorMatch[]
  /** Maps an original vendor string to its resolved canonical name (identity if ungrouped). */
  resolveVendorName: (original: string) => string
}

export interface VendorRecordInput {
  vendor: string
  bankAccountLast4?: string | null
}

const VENDOR_LEGAL_SUFFIXES = new Set(['llc', 'inc', 'corp'])

/** Lowercase, strip all punctuation, and remove trailing legal-entity suffixes (LLC/Inc/Corp). */
export function normalizeVendorName(vendor: string): string {
  const cleaned = vendor
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const words = cleaned.split(' ').filter(Boolean)
  while (words.length > 1 && VENDOR_LEGAL_SUFFIXES.has(words[words.length - 1])) {
    words.pop()
  }
  return words.join(' ')
}

function tokenize(normalized: string): string[] {
  return normalized.split(' ').filter(Boolean)
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a)
  const setB = new Set(b)
  if (setA.size === 0 && setB.size === 0) return 1
  const union = new Set([...setA, ...setB])
  if (union.size === 0) return 0
  let intersection = 0
  for (const token of setA) if (setB.has(token)) intersection++
  return intersection / union.size
}

/**
 * Edit-distance tolerance grows with word length. Short tokens (<=2 chars) require
 * an exact match — otherwise unrelated short codes/numbers (e.g. "Vendor 1" vs
 * "Vendor 2") would be treated as spelling variants of one another.
 */
function wordEditThreshold(word: string): number {
  if (word.length <= 2) return 0
  return word.length <= 4 ? 1 : 2
}

/**
 * Longer than any real word in a vendor name. Past this a token is only ever
 * compared exactly: edit distance is quadratic in length, and a memo pasted
 * into the vendor column must not freeze the import.
 */
const MAX_FUZZY_TOKEN_LENGTH = 64

function tokensNearlyEqual(tokenA: string, tokenB: string): boolean {
  if (tokenA === tokenB) return true
  // Numbers identify: store 1042 and store 1043 are different vendors, not a typo.
  if (/\d/.test(tokenA) || /\d/.test(tokenB)) return false
  if (tokenA.length > MAX_FUZZY_TOKEN_LENGTH || tokenB.length > MAX_FUZZY_TOKEN_LENGTH) return false
  const maxDistance = Math.min(wordEditThreshold(tokenA), wordEditThreshold(tokenB))
  if (Math.abs(tokenA.length - tokenB.length) > maxDistance) return false
  return damerauLevenshteinDistance(tokenA, tokenB) <= maxDistance
}

/** Greedy bipartite match of tokens allowing near-equal words (Damerau-Levenshtein within threshold). */
function fuzzyWordOverlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1
  const remaining = [...b]
  let matched = 0
  for (const tokenA of a) {
    const idx = remaining.findIndex((tokenB) => tokensNearlyEqual(tokenA, tokenB))
    if (idx !== -1) {
      matched++
      remaining.splice(idx, 1)
    }
  }
  return matched / Math.max(a.length, b.length)
}

type BankSignal = 'match' | 'mismatch' | 'unknown'

function bankAccountSignal(accountsA: Set<string>, accountsB: Set<string>): BankSignal {
  if (accountsA.size === 0 || accountsB.size === 0) return 'unknown'
  for (const account of accountsA) {
    if (accountsB.has(account)) return 'match'
  }
  return 'mismatch'
}

const AUTO_MERGE_NAME_SCORE = 0.75
const NEEDS_REVIEW_NAME_SCORE = 0.4
const BANK_ASSISTED_NAME_SCORE = 0.45

function classifyPair(
  normA: string,
  normB: string,
  tokensA: string[],
  tokensB: string[],
  bankSignal: BankSignal
): { tier: ConfidenceTier; score: number; reasons: string[] } {
  if (normA === normB) {
    return { tier: 'auto_merge', score: 1, reasons: ['exact match after normalization'] }
  }

  const jaccard = jaccardSimilarity(tokensA, tokensB)
  const fuzzy = fuzzyWordOverlap(tokensA, tokensB)
  const nameScore = Math.max(jaccard, fuzzy)

  const reasons: string[] = []
  if (jaccard > 0) reasons.push(`token Jaccard similarity ${jaccard.toFixed(2)}`)
  if (fuzzy > jaccard) reasons.push(`fuzzy word similarity ${fuzzy.toFixed(2)} (Damerau-Levenshtein)`)
  if (bankSignal === 'match') reasons.push('shared bank account on record')
  if (bankSignal === 'mismatch') reasons.push('conflicting bank accounts on record')

  // Conflicting bank data is an independent negative signal: block a confident
  // auto-merge unless the names alone are strong enough to stand on their own.
  if (bankSignal === 'mismatch' && nameScore < AUTO_MERGE_NAME_SCORE) {
    return {
      tier: nameScore >= NEEDS_REVIEW_NAME_SCORE ? 'needs_review' : 'no_match',
      score: nameScore,
      reasons,
    }
  }

  if (nameScore >= AUTO_MERGE_NAME_SCORE) {
    return { tier: 'auto_merge', score: nameScore, reasons }
  }
  if (bankSignal === 'match' && nameScore >= BANK_ASSISTED_NAME_SCORE) {
    return { tier: 'auto_merge', score: nameScore, reasons }
  }
  if (nameScore >= NEEDS_REVIEW_NAME_SCORE || bankSignal === 'match') {
    return { tier: 'needs_review', score: nameScore, reasons }
  }
  return { tier: 'no_match', score: nameScore, reasons }
}

class UnionFind {
  private parent: number[]
  private rank: number[]

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i)
    this.rank = new Array(size).fill(0)
  }

  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x])
    return this.parent[x]
  }

  union(a: number, b: number): void {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA === rootB) return
    if (this.rank[rootA] < this.rank[rootB]) {
      this.parent[rootA] = rootB
    } else if (this.rank[rootA] > this.rank[rootB]) {
      this.parent[rootB] = rootA
    } else {
      this.parent[rootB] = rootA
      this.rank[rootA]++
    }
  }
}

/** Groups vendor names that likely refer to the same real vendor. */
export function resolveVendors(records: VendorRecordInput[]): VendorResolutionResult {
  const uniqueNames: string[] = []
  const indexByName = new Map<string, number>()
  const bankAccountsByName: Set<string>[] = []
  const frequencyByName: number[] = []
  const firstSeenOrder: number[] = []

  records.forEach((record, order) => {
    let index = indexByName.get(record.vendor)
    if (index === undefined) {
      index = uniqueNames.length
      indexByName.set(record.vendor, index)
      uniqueNames.push(record.vendor)
      bankAccountsByName.push(new Set())
      frequencyByName.push(0)
      firstSeenOrder.push(order)
    }
    frequencyByName[index]++
    const account = normalizeAccountLast4(record.bankAccountLast4 ?? null)
    if (account) bankAccountsByName[index].add(account)
  })

  const normalizedNames = uniqueNames.map(normalizeVendorName)
  const tokensByName = normalizedNames.map(tokenize)

  const uf = new UnionFind(uniqueNames.length)
  const needsReview: VendorMatch[] = []

  for (let i = 0; i < uniqueNames.length; i++) {
    for (let j = i + 1; j < uniqueNames.length; j++) {
      const bankSignal = bankAccountSignal(bankAccountsByName[i], bankAccountsByName[j])
      const { tier, score, reasons } = classifyPair(
        normalizedNames[i],
        normalizedNames[j],
        tokensByName[i],
        tokensByName[j],
        bankSignal
      )

      if (tier === 'auto_merge') {
        uf.union(i, j)
      } else if (tier === 'needs_review') {
        needsReview.push({ vendorA: uniqueNames[i], vendorB: uniqueNames[j], tier, score, reasons })
      }
    }
  }

  const membersByRoot = new Map<number, number[]>()
  for (let i = 0; i < uniqueNames.length; i++) {
    const root = uf.find(i)
    const members = membersByRoot.get(root)
    if (members) members.push(i)
    else membersByRoot.set(root, [i])
  }

  const canonicalByName = new Map<string, string>()
  const groups: VendorGroup[] = []

  for (const memberIndices of membersByRoot.values()) {
    const members = memberIndices.map((i) => uniqueNames[i])
    const canonicalName = [...memberIndices].sort((a, b) => {
      const frequencyDiff = frequencyByName[b] - frequencyByName[a]
      if (frequencyDiff !== 0) return frequencyDiff
      return firstSeenOrder[a] - firstSeenOrder[b]
    })
      .map((i) => uniqueNames[i])[0]

    for (const member of members) canonicalByName.set(member, canonicalName)
    if (members.length > 1) {
      groups.push({ canonicalName, members, tier: 'auto_merge' })
    }
  }

  // Drop needs_review pairs whose members already ended up in the same auto_merge group.
  const filteredNeedsReview = needsReview.filter(
    (match) => canonicalByName.get(match.vendorA) !== canonicalByName.get(match.vendorB)
  )

  return {
    groups,
    needsReview: filteredNeedsReview,
    resolveVendorName: (original: string) => canonicalByName.get(original) ?? original,
  }
}
