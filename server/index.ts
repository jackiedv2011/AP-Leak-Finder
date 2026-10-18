import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createApp } from './app.ts'
import { loadConfig, type ServerConfig } from './config.ts'
import { installHealthCheck } from './health.ts'

let config: ServerConfig
try {
  config = loadConfig()
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}
mkdirSync(dirname(resolve(config.databasePath)), { recursive: true })
const app = createApp({ config, staticDir: config.production ? resolve('dist') : null })
installHealthCheck(app.server, app.db)
const port = await app.listen()
console.log(`Reclaim API listening on http://localhost:${port}`)
console.log(`  email delivery: ${app.mailer.kind}${config.devMailbox ? ' (dev mailbox at /api/dev/mailbox)' : ''}`)
console.log(`  google sign-in: ${config.google ? 'configured' : 'not configured'}`)
console.log(`  ai drafting:    ${config.anthropicApiKey ? config.anthropicModel : 'not configured'}`)
console.log(`  billing:        ${config.stripe ? `Stripe ${config.stripe.secretKey.includes('_live_') ? 'LIVE' : 'test mode'}${config.stripe.webhookSecret ? '' : ' (no STRIPE_WEBHOOK_SECRET: events refused)'}` : 'not configured'}`)
console.log(`  quickbooks:     ${config.quickbooks ? `sandbox, read-only (redirect URI ${config.appOrigin}/api/integrations/quickbooks/callback)` : 'not configured'}`)

// Containers stop with SIGTERM: finish in-flight requests, then close SQLite so
// the WAL is checkpointed into the main file. Ten seconds, then exit regardless.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    console.log(`${signal} received, shutting down`)
    setTimeout(() => process.exit(1), 10_000).unref()
    app
      .close()
      .catch(() => {})
      .finally(() => {
        app.db.close()
        process.exit(0)
      })
  })
}
