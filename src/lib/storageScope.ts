/**
 * Every localStorage key that holds account data is prefixed with the account
 * it belongs to. With no scope set (tests, and ledgers saved before accounts
 * existed) keys are the bare "legacy" names. Guests get their own scope so a
 * guest session never reads or writes a real account's cache.
 *
 * This is a cache boundary, not a security boundary: the server is the source
 * of truth for account data, and an account's cache is wiped on log-out.
 */
let scope: string | null = null

export function setStorageScope(next: string | null): void {
  scope = next
}

export function getStorageScope(): string | null {
  return scope
}

export function storageKey(base: string): string {
  return scope ? `reclaim.u.${scope}.${base}` : base
}

/** The unscoped name — where data saved before accounts existed still lives. */
export function legacyKey(base: string): string {
  return base
}

/** Remove everything cached for one scope (used on log-out). */
export function clearStorageScope(id: string): void {
  if (typeof window === 'undefined') return
  const prefix = `reclaim.u.${id}.`
  const doomed: string[] = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i)
    if (key && key.startsWith(prefix)) doomed.push(key)
  }
  doomed.forEach((key) => window.localStorage.removeItem(key))
}
