// Serves the static marketing site under landing-site/ as the app's real routes
// (/, /about, /pricing, /research, /guides, /security, /how-it-works, /what-it-checks
// and their supporting assets) during `vite dev`, ahead of the React app's own
// middleware, so those paths never fall through to the SPA's index.html.
//
// landing-site/ stays the editable source: this plugin builds it once at server
// start and then keeps `node build.cjs --watch` running in the background for the
// life of the dev server, exactly the workflow landing-site/README.md documents —
// it's just started for you. Edit anything under landing-site/src/ and refresh.
//
// The React app (/audit, /scanner, everything else) is untouched: requests that
// don't match a landing-site route just call next() and Vite handles them as before.
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin, ViteDevServer } from 'vite'

const LANDING_ROOT = fileURLToPath(new URL('../landing-site/', import.meta.url))

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
}

// Kept explicit (rather than "serve anything that exists under landing-site/") so
// this can never shadow something unexpected — landing-site/README.md, notes/,
// blender/ and src/ stay unreachable, matching landing-site/serve.cjs's own intent.
const EXACT_ROUTES = new Set(['/', '/about', '/pricing', '/research', '/security', '/guides', '/how-it-works', '/what-it-checks'])
const PREFIX_ROUTES = ['/research/', '/guides/']
const ASSET_PREFIXES = ['/assets/', '/media/']
const ASSET_FILES = new Set(['/styles.css', '/pages.css', '/main.js', '/reels.js'])

function isLandingSiteRoute(pathname: string): boolean {
  const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  if (EXACT_ROUTES.has(pathname) || EXACT_ROUTES.has(trimmed)) return true
  if (PREFIX_ROUTES.some((p) => pathname.startsWith(p))) return true
  if (ASSET_PREFIXES.some((p) => pathname.startsWith(p))) return true
  return ASSET_FILES.has(pathname)
}

// Same clean-URL resolution as landing-site/serve.cjs: a directory serves its index.html.
function resolveFile(pathname: string): string | null {
  const file = normalize(join(LANDING_ROOT, pathname))
  if (!file.startsWith(normalize(LANDING_ROOT))) return null
  try {
    if (statSync(file).isDirectory()) return join(file, 'index.html')
  } catch {
    /* not a directory, or nothing there yet: fall through to the path as given */
  }
  return file
}

let watcher: ChildProcess | null = null

export function landingSitePlugin(): Plugin {
  return {
    name: 'reclaim-landing-site',
    closeBundle() {
      if (process.env.VITEST) return

      // Vercel runs the production build without Vite's dev middleware. Copy the
      // generated static site into dist so clean landing routes work in production,
      // while retaining the compiled React app for /audit and /scanner.
      const distRoot = join(process.cwd(), 'dist')
      const reactIndex = readFileSync(join(distRoot, 'index.html'))
      execFileSync(process.execPath, ['build.cjs'], { cwd: LANDING_ROOT, stdio: 'inherit' })

      const excluded = new Set(['src', 'blender', 'notes', 'README.md', 'BEFORE-DEPLOY.md', 'build.cjs', 'serve.cjs'])
      for (const entry of readdirSync(LANDING_ROOT, { withFileTypes: true })) {
        if (excluded.has(entry.name)) continue
        cpSync(join(LANDING_ROOT, entry.name), join(distRoot, entry.name), { recursive: true, force: true })
      }

      for (const route of ['audit', 'scanner']) {
        const routeDir = join(distRoot, route)
        mkdirSync(routeDir, { recursive: true })
        writeFileSync(join(routeDir, 'index.html'), reactIndex)
      }
    },
    configureServer(server: ViteDevServer) {
      // Vitest reuses this same Vite config to power its own module server, which
      // also invokes configureServer — without this guard, every `npm test` run
      // spawns a build.cjs --watch child that outlives the test run and hangs it
      // ("Tests closed successfully but something prevents Vite server from
      // exiting"). Nothing under test exercises landing-site's routes, so skip it.
      if (process.env.VITEST) return

      // Build synchronously first so the very first request is never stale.
      execFileSync(process.execPath, ['build.cjs'], { cwd: LANDING_ROOT, stdio: 'inherit' })

      // vite.config.ts can be re-evaluated (e.g. if it's edited) without the Node
      // process restarting, which would call this hook again — guard against a
      // second watcher stacking on top of the first.
      watcher?.kill()
      watcher = spawn(process.execPath, ['build.cjs', '--watch'], { cwd: LANDING_ROOT, stdio: 'inherit' })
      server.httpServer?.once('close', () => watcher?.kill())

      // Registered directly in the hook body (not returned as a post-hook), so this
      // runs before Vite's own middleware, including the SPA index.html fallback.
      server.middlewares.use((req, res, next) => {
        if (!req.url || (req.method !== 'GET' && req.method !== 'HEAD')) return next()
        const pathname = decodeURIComponent(req.url.split('?')[0].split('#')[0])
        if (!isLandingSiteRoute(pathname)) return next()

        const file = resolveFile(pathname)
        if (!file || !existsSync(file) || statSync(file).isDirectory()) return next()

        let buf: Buffer
        try {
          buf = readFileSync(file)
        } catch {
          return next()
        }

        const type = MIME[extname(file)] || 'application/octet-stream'
        // Byte-range support so <video loop> can seek, same as landing-site/serve.cjs.
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
        if (range) {
          const start = range[1] ? Number(range[1]) : Math.max(0, buf.length - Number(range[2]))
          const end = range[1] && range[2] ? Math.min(Number(range[2]), buf.length - 1) : buf.length - 1
          if (start > end || start >= buf.length) {
            res.writeHead(416, { 'Content-Range': `bytes */${buf.length}` })
            return res.end()
          }
          res.writeHead(206, {
            'Content-Type': type,
            'Content-Range': `bytes ${start}-${end}/${buf.length}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
          })
          return res.end(buf.subarray(start, end + 1))
        }

        res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': buf.length })
        res.end(req.method === 'HEAD' ? undefined : buf)
      })
    },
  }
}
