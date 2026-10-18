/**
 * Local only: the Reclaim API with an in-memory fake Stripe, for trying plan
 * changes in a browser without Stripe keys. Events the fake produces are
 * signed and delivered to the app's own webhook, as `stripe listen` would.
 *
 *   DATABASE_PATH=/tmp/reclaim-billing.sqlite PORT=8791 APP_ORIGIN=http://localhost:5175 node server/devFakeBilling.ts
 *
 * Controls (127.0.0.1, PORT + 1000):
 *   POST /end-period     every subscription renews, or ends if cancelled
 *   POST /fail-renewal   the newest subscription's renewal fails (past_due)
 *   GET  /state          subscriptions and invoice items, as JSON
 *
 * Checkout's card field still runs on Stripe.js; any `pm_…` id it returns is
 * accepted by the fake (pm_card_chargeDeclined declines).
 */
import { createServer } from 'node:http'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { FakeStripe } from './fakeStripe.ts'

if (process.env.NODE_ENV === 'production') {
  console.error('devFakeBilling is for local testing only.')
  process.exit(1)
}
const WHSEC = 'whsec_dev_fake'
const config = loadConfig({ ...process.env, STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_WEBHOOK_SECRET: WHSEC })
mkdirSync(dirname(resolve(config.databasePath)), { recursive: true })
const stripe = new FakeStripe()
const app = createApp({ config, stripe })
const port = await app.listen()

async function deliver(): Promise<void> {
  for (const { body, signature } of stripe.drainSigned(WHSEC)) {
    const res = await fetch(`http://127.0.0.1:${port}/api/billing/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature }, body })
    console.log(`webhook ${JSON.parse(body).type} → ${res.status}`)
  }
}
setInterval(() => void deliver().catch((err) => console.error('delivery failed:', err)), 500)

createServer(async (req, res) => {
  const newest = [...stripe.subscriptions.values()].at(-1)
  if (req.method === 'POST' && req.url === '/end-period') stripe.endPeriod()
  else if (req.method === 'POST' && req.url === '/fail-renewal' && newest) stripe.failRenewal(newest.id)
  else if (!(req.method === 'GET' && req.url === '/state')) {
    res.statusCode = 404
    res.end()
    return
  }
  await deliver()
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ subscriptions: [...stripe.subscriptions.values()], invoiceItems: [...stripe.invoiceItems.values()], invoices: stripe.invoices }, null, 2))
}).listen(port + 1000, '127.0.0.1')

console.log(`Reclaim API with fake Stripe on http://localhost:${port} (controls on http://127.0.0.1:${port + 1000})`)
