/** Where to send someone after they log in: the page that redirected them, or the dashboard. */
export function nextAfterAuth(): string {
  const next = new URLSearchParams(window.location.search).get('next')
  // Only same-origin paths, so a crafted link can't bounce a fresh log-in elsewhere.
  if (next && next.startsWith('/') && !next.startsWith('//')) return next
  return '/audit'
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
