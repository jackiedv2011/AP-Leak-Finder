import { describe, expect, it } from 'vitest'
import { damerauLevenshteinDistance } from '@/lib/stringDistance'

describe('damerauLevenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(damerauLevenshteinDistance('acme', 'acme')).toBe(0)
  })

  it('returns the length of the other string when one side is empty', () => {
    expect(damerauLevenshteinDistance('', '')).toBe(0)
    expect(damerauLevenshteinDistance('abc', '')).toBe(3)
    expect(damerauLevenshteinDistance('', 'abc')).toBe(3)
  })

  it('matches classic Levenshtein distance when no transposition is involved', () => {
    expect(damerauLevenshteinDistance('kitten', 'sitting')).toBe(3)
  })

  it('counts a single adjacent transposition as one edit, unlike plain Levenshtein', () => {
    // Plain Levenshtein would need 2 substitutions here; Damerau-Levenshtein
    // recognizes the adjacent swap as a single edit.
    expect(damerauLevenshteinDistance('ab', 'ba')).toBe(1)
  })

  it('counts two independent adjacent transpositions as two edits', () => {
    // Plain Levenshtein distance for this pair is 4 (two substitutions per swap).
    expect(damerauLevenshteinDistance('abcd', 'badc')).toBe(2)
  })

  it('does not treat non-adjacent swaps as a single transposition', () => {
    // 'abc' -> 'cba' is a full reversal, not an adjacent transposition.
    expect(damerauLevenshteinDistance('abc', 'cba')).toBe(2)
  })
})
