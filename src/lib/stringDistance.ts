/**
 * Damerau-Levenshtein edit distance (restricted / "optimal string alignment"
 * variant): insertions, deletions, substitutions, and adjacent transpositions
 * each cost 1. An adjacent transposition (e.g. "ab" -> "ba") is a single edit
 * here, whereas plain Levenshtein would require two substitutions.
 */
export function damerauLevenshteinDistance(a: string, b: string): number {
  const al = a.length
  const bl = b.length
  if (al === 0) return bl
  if (bl === 0) return al

  const d: number[][] = Array.from({ length: al + 1 }, () => new Array<number>(bl + 1).fill(0))
  for (let i = 0; i <= al; i++) d[i][0] = i
  for (let j = 0; j <= bl; j++) d[0][j] = j

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let best = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost // substitution
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, d[i - 2][j - 2] + cost)
      }
      d[i][j] = best
    }
  }

  return d[al][bl]
}
