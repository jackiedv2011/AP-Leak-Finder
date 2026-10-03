/**
 * Standalone review build of onboarding, for review only. It runs the real
 * workspace as a guest (no server): onboarding first, then the ledger choice,
 * and "Run the sample" lands on the dashboard. Like demo/main.tsx, it tolerates
 * a host that refuses the History API or browser storage. src/ is untouched.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuditApp } from '@/AuditApp'
import { AuthProvider, useAuth } from '@/lib/auth/AuthContext'
import '@/index.css'

// A framed snapshot may refuse storage; the workspace keeps everything in memory then.
function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  }
}
for (const name of ['localStorage', 'sessionStorage'] as const) {
  try {
    window[name].setItem('__probe', '1')
    window[name].removeItem('__probe')
  } catch {
    Object.defineProperty(window, name, { value: memoryStorage(), configurable: true })
  }
}

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

// The workspace's 3D stills are authored as site-absolute /media/ paths.
addEventListener(
  'error',
  (event) => {
    const el = event.target
    if (!(el instanceof HTMLVideoElement) && !(el instanceof HTMLImageElement)) return
    if (!el.src.includes('/media/') || el.dataset.retried) return
    el.dataset.retried = '1'
    el.src = new URL(el.src.slice(el.src.indexOf('/media/') + 1), document.baseURI).href
  },
  true
)

// Always a guest: this build has no server to hold an account.
if (!sessionStorage.getItem('reclaim.auth.guest.v1')) sessionStorage.setItem('reclaim.auth.guest.v1', `guest_${Date.now().toString(36)}`)

function restart() {
  for (const store of [sessionStorage, localStorage]) {
    for (let i = store.length - 1; i >= 0; i--) {
      const key = store.key(i)
      if (key?.startsWith('reclaim.') && key !== 'reclaim.theme.v1') store.removeItem(key)
    }
  }
  location.reload()
}

function Gate() {
  const auth = useAuth()
  return (
    <>
      {auth.status === 'ready' && auth.user ? <AuditApp key={auth.user.id} /> : null}
      <button type="button" className="review-restart" onClick={restart}>
        Restart onboarding
      </button>
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Gate />
    </AuthProvider>
  </StrictMode>
)
