/**
 * Standalone build of the workspace, for review only.
 *
 * The real app routes on pathname (`/audit`) and is served from the site root.
 * A published snapshot is neither, so this entry does two things the app
 * itself must not do: it mounts the workspace regardless of path, and it
 * tolerates a host that refuses the History API. Nothing here changes the
 * product — src/ is untouched.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuditApp } from '@/AuditApp'
import '@/index.css'

// A snapshot may be framed on an opaque origin, where pushState throws and
// would otherwise take the whole screen down on the first click.
for (const name of ['pushState', 'replaceState'] as const) {
  const original = history[name].bind(history)
  history[name] = (...args: Parameters<History['pushState']>) => {
    try {
      original(...args)
    } catch {
      /* host refused the history write — the UI still re-renders from state */
    }
  }
}

// Launch's video is authored as a site-absolute path; resolve it against this
// bundle instead if the host doesn't serve from its origin root.
addEventListener(
  'error',
  (event) => {
    const el = event.target
    if (el instanceof HTMLVideoElement && el.src.includes('/media/') && !el.dataset.retried) {
      el.dataset.retried = '1'
      el.src = new URL('media/find.webm', document.baseURI).href
      el.load()
    }
  },
  true
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuditApp />
  </StrictMode>
)
