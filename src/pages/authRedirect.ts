/** Where to send someone after they log in: the page that redirected them, or the dashboard. */
export function nextAfterAuth(): string {
  return safeNextPath(new URLSearchParams(window.location.search).get('next')) ?? '/audit'
}

/**
 * A same-origin path, or null. Only same-origin paths, so a crafted link can't
 * bounce a fresh log-in elsewhere. Browsers read `\` as `/`, so `/\evil.com`
 * would leave the site; anything that resolves to another origin is refused.
 */
export function safeNextPath(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\') || [...next].some((c) => c.charCodeAt(0) < 0x20)) return null
  const url = new URL(next, window.location.origin)
  if (url.origin !== window.location.origin) return null
  return `${url.pathname}${url.search}${url.hash}`
}

/** The login URL that will bring the user back to the page they were on. */
export function loginUrlFor(pathnameAndSearch: string): string {
  const next = pathnameAndSearch && pathnameAndSearch !== '/audit' ? `?next=${encodeURIComponent(pathnameAndSearch)}` : ''
  return `/login${next}`
}

/** A full navigation that replaces the current history entry, so "back" never returns to a gate. */
export function redirectTo(to: string): void {
  window.location.replace(to)
}
