# Deploying Reclaim (supervised pilots)

Reclaim is one Node 24 process. It serves the API, the React app and the
landing site (all built into `dist/` by `npm run build`), and keeps everything
in one SQLite file. Any host that runs a container with a persistent volume and
HTTPS in front works. The provider is not chosen yet; nothing below depends on
which one it is.

- **Image:** `Dockerfile` (multi-stage, runs as the unprivileged `node` user).
- **State:** one volume at `/data`, holding `reclaim.sqlite` (plus its `-wal`/`-shm` while running).
- **Health:** `GET /healthz` → `200 {"ok":true,"database":"ok"}`, or `503` when SQLite can't be queried.
- **Startup checks:** in production the server refuses to start, listing every problem, when settings are missing or unsafe (`server/config.ts`).

## 1. Environment variables

Set these in the host's secret/environment settings. Never bake them into the
image, commit them, or pass them as build arguments. The image ignores `.env`
files entirely (`.dockerignore`), so a container only sees what the host gives it.

| Variable | Secret? | Required | Notes |
|---|---|---|---|
| `NODE_ENV` | no | set by image | `production` in the image. Turns on Secure cookies, HSTS, static serving and the startup checks. |
| `APP_ORIGIN` | no | **yes** | Public address, e.g. `https://app.reclaim.example`. Must be `https://` with no path. Used in email links and both OAuth redirect URIs. |
| `PORT` | no | set by image | `8787`. Point the host's HTTP routing at it. |
| `DATABASE_PATH` | no | set by image | `/data/reclaim.sqlite`. Keep it on the volume. |
| `RESEND_API_KEY` | **secret** | one provider **required** | With `EMAIL_FROM`. Resend needs a domain you own and have verified with them. |
| `EMAIL_FROM` | no | with Resend | e.g. `Reclaim <no-reply@reclaim.example>`. |
| `GMAIL_USER` | no | or this provider | Sends from that Gmail account. Used only when Resend isn't set. |
| `GMAIL_APP_PASSWORD` | **secret** | with Gmail | A Google app password (2-Step Verification → App passwords). |
| `CONTACT_EMAIL` | no | no | Where the landing site's contact form goes. Default `reclaimbusiness1@gmail.com`. |
| `REQUIRE_EMAIL_VERIFICATION` | no | no | Default `true`. Leave it on for pilots. |
| `SESSION_DAYS` / `REMEMBER_ME_DAYS` | no | no | Default 1 and 30. |
| `GOOGLE_CLIENT_ID` | no (public id) | no | Both Google values set → "Continue with Google" appears. |
| `GOOGLE_CLIENT_SECRET` | **secret** | with the id | |
| `ANTHROPIC_API_KEY` | **secret** | no | Without it, "Draft with AI" reports itself unavailable. |
| `ANTHROPIC_MODEL` | no | no | Default `claude-opus-5`. |
| `QBO_CLIENT_ID` | no (public id) | no | QuickBooks Online, **sandbox only**, read-only. All three `QBO_*` or none: the server refuses a partial set. |
| `QBO_CLIENT_SECRET` | **secret** | with the id | |
| `QBO_TOKEN_KEY` | **secret** | with the id | 32 random bytes, base64: `openssl rand -base64 32`. Seals stored QuickBooks tokens (AES-256-GCM). See §6. |
| `VITE_STRIPE_PUBLISHABLE_KEY` | no (public by design) | no | **Build argument**, not a runtime variable: it is compiled into the browser bundle. Must come from the **same Stripe account** as `STRIPE_SECRET_KEY` (card ids from another account are refused). Without it checkout runs on Stripe's demo test key and can't subscribe against a real account. |
| `STRIPE_SECRET_KEY` | **secret** | no | `sk_test_…` for pilots. Turns on paid plans (§7). Without it, subscribing answers "paid plans aren't switched on" and nothing is charged. |
| `STRIPE_WEBHOOK_SECRET` | **secret** | with the key | `whsec_…` of the webhook endpoint (§7). The server refuses to start with only one of the two. |
| `DEV_MAILBOX` | — | **must be unset** | Exposes reset links to anyone. The server refuses to start in production unless it is unset or `false`. |
| `SESSION_COOKIE_SECURE_OK` | — | never on a server | Lets a production build run over plain http, and only on a `localhost` origin, for local checks. |
| `BACKUP_DIR` | no | no | Where `server/backup.ts` writes. Default `/data/backups`. |

## 2. Build and run the container

```bash
docker build -t reclaim .
```

With a Stripe publishable key (public, safe as a build argument):

```bash
docker build --build-arg VITE_STRIPE_PUBLISHABLE_KEY=pk_live_xxx -t reclaim .
```

Run it with a named volume for `/data` and the settings from an env file kept
**outside** the repository (or the host's secret store):

```bash
docker volume create reclaim-data
docker run -d --name reclaim --restart unless-stopped -p 8787:8787 -v reclaim-data:/data --env-file /etc/reclaim/reclaim.env reclaim
curl -s http://127.0.0.1:8787/healthz
```

- The process runs as `node` (uid 1000). A named volume picks up the right
  owner from the image. If the host mounts a **directory** instead, it must be
  writable by uid 1000 (`chown 1000:1000 <dir>`), or the server can't create the database.
- First start creates the database and runs migrations. Later starts run any
  additive migrations automatically.
- `docker stop` sends SIGTERM: the server finishes in-flight requests, closes
  SQLite (folding the WAL into the main file) and exits within 10 seconds.
- **Run exactly one container per volume.** SQLite takes one writer; two
  instances on one file, or on a network filesystem (NFS, SMB, EFS), will corrupt it.
  Use a block volume (the host's "persistent disk").
- The image has a `HEALTHCHECK` on `/healthz`. If the host does its own health
  checks, point them at `/healthz` too.

If a start fails, the log names every problem, for example:

```
Refusing to start in production:
  - APP_ORIGIN must be an https:// origin with no path (session cookies are marked Secure).
  - No email provider. Set RESEND_API_KEY and EMAIL_FROM (or GMAIL_USER and GMAIL_APP_PASSWORD); ...
```

## 3. HTTPS and the domain

The container speaks plain HTTP on port 8787. HTTPS ends at the host's load
balancer or a reverse proxy (Caddy, nginx, the platform's router) that forwards to it.

1. Pick the app domain (e.g. `app.reclaim.example`) and point DNS at the host.
2. Turn on the host's managed certificate, or let Caddy fetch one.
3. Set `APP_ORIGIN` to exactly `https://` plus that domain, with no trailing path.
4. Redirect plain `http://` to `https://` at the proxy. The server sends HSTS
   (`max-age=31536000; includeSubDomains`) on every response, so browsers stay on HTTPS after the first visit.
   `includeSubDomains` covers every subdomain of the app's host: make sure they all serve HTTPS.
5. Email from Resend needs its DNS records (SPF/DKIM) on the sending domain.

**Known gap behind a proxy:** sign-up, login, reset and contact-form rate limits
key on the connecting address (`server/http.ts`), which behind a proxy is the
proxy. Every visitor then shares one budget: 20 failed logins from anyone
briefly lock out everyone. Fine for a small supervised pilot; fix it (trust
`X-Forwarded-For` from the known proxy only) before opening sign-ups widely.

## 4. Google sign-in and the Intuit redirect URI

Both are built from `APP_ORIGIN`, so they must match it character for character.

**Google** (console.cloud.google.com → APIs & Services → Credentials → the OAuth client):
- Authorized JavaScript origin: `<APP_ORIGIN>`
- Authorized redirect URI: `<APP_ORIGIN>/api/auth/google/callback`
- Publish the OAuth consent screen (scopes: `openid email profile` only), or only listed test users can sign in.

**Intuit** (developer.intuit.com → the app → Settings → Redirect URIs):
- Add `<APP_ORIGIN>/api/integrations/quickbooks/callback`.
- The connection is **sandbox only** today (Development keys). Production
  QuickBooks keys need Intuit's app assessment first; don't put production keys in until that's done.

The server prints the QuickBooks redirect URI it expects at startup.

## 5. Backups and restore

`server/backup.ts` takes a consistent copy while the server keeps running
(`VACUUM INTO` reads one snapshot, WAL included), then integrity-checks the copy.

```bash
docker exec reclaim node server/backup.ts
# backup written: /data/backups/reclaim-2026-10-17T09-30-00-123Z.sqlite (412 KB, integrity ok)
```

A backup on the same volume is not a backup. Copy each one off the server, then
delete it from the volume:

```bash
docker cp reclaim:/data/backups/reclaim-2026-10-17T09-30-00-123Z.sqlite ./
docker exec reclaim rm /data/backups/reclaim-2026-10-17T09-30-00-123Z.sqlite
```

- Schedule it at least daily (host cron, or the platform's scheduled job), and keep 30 days.
- The file holds every account, audit and sealed QuickBooks token. Store
  backups encrypted at rest, with access limited to the founders.
- Test a restore once before the pilot starts and once a month.
- A volume snapshot from the host is a good second layer, but take it after a
  `server/backup.ts` run or with the container stopped. A snapshot of a live
  SQLite file can catch it mid-write.

**Restore**

1. `docker stop reclaim`
2. Keep the current file in case you need it back: `docker run --rm -v reclaim-data:/data alpine mv /data/reclaim.sqlite /data/reclaim.sqlite.before-restore`
3. Remove any leftover `/data/reclaim.sqlite-wal` and `/data/reclaim.sqlite-shm`. They belong to the old file and must not be replayed onto the restored one.
4. Copy the backup in as `/data/reclaim.sqlite`, owned by uid 1000 (`docker cp` then `chown 1000:1000`, or a helper container).
5. `docker start reclaim` and check `curl -s <APP_ORIGIN>/healthz`, then sign in with a known account.

Anything written after the backup was taken is lost. Tell affected pilot customers.

## 6. Rotating `QBO_TOKEN_KEY`

The key seals each customer's QuickBooks tokens. There's no re-encryption
step: tokens sealed with the old key can't be opened with the new one.

**Rotating it disconnects every QuickBooks user. Each one reconnects from
Settings.** No audits or other data are lost. Rotate when the key may have
leaked, or someone who had it leaves.

1. Generate a new key: `openssl rand -base64 32`.
2. Replace `QBO_TOKEN_KEY` in the host's secret store and restart the container.
3. Tell pilot customers who had QuickBooks connected to reconnect it.
4. Destroy every copy of the old key. Backups taken before the rotation still
   hold tokens sealed with it, so a leaked old key plus an old backup exposes
   them until those tokens expire. If the key leaked, also revoke the app's tokens in the Intuit developer portal.

`QBO_CLIENT_SECRET` and the other secrets rotate in their own consoles: issue
the new value, update the host, restart, then revoke the old one.

## 7. Paid plans (Stripe)

Billing lives in `server/billing.ts`; the REST client is `server/stripe.ts` (no SDK).

- **Prices:** two monthly USD prices found by lookup key, `reclaim_growth_monthly` ($15) and `reclaim_flat_monthly` ($50). Create them once per Stripe account (test and live are separate) with `npm run stripe:setup` (reads `STRIPE_SECRET_KEY` from `.env`; safe to re-run; a live key needs `--live`). The server refuses to sell a plan whose price isn't exactly what the site says.
- **Source of truth:** `users.plan` is only set from a subscription read back from Stripe. Checkout and Settings read it right after a change so the app switches at once; the webhook keeps it right afterwards (renewals, failed payments, the end of a cancelled period). Webhook payloads are treated as pointers: the subscription is re-fetched with the pinned API version (`2024-06-20`).
- **Transitions:** Free → Growth/Flat (card, 3-D Secure supported); Growth ↔ Flat (prorated, charged now; if that charge fails the plan doesn't change); Cancel (paid features stay on until the period ends, then Free); Keep plan (undo a cancel). `past_due` keeps access while Stripe retries; when retries run out Stripe cancels and the account returns to Free. Configure retries in Stripe → Settings → Billing → Subscriptions and emails → "Manage failed payments" (recommended: cancel the subscription after the last retry).
- **Stored:** only Stripe's customer and subscription ids (`billing_accounts`). Card data never reaches the server.
- **Growth's 10% success fee:** each settlement the recovery workflow records (settled refund, or a credit/offset applied to a named bill) gets one row in `recovery_fees` the first time the server sees it, with the plan at that moment. Only rows recorded on Growth carry a fee; each becomes one Stripe invoice item on the next subscription invoice (or a final invoice when a cancelled plan ends). Findings, vendor promises and unapplied credits are never settlements. A settlement removed later is voided: the pending item is deleted, or credited back if it was already invoiced. Money recorded on Free or Flat, or in imported guest audits, is never billed. Fees only cover USD findings; other currencies are recorded with reason `not_usd` and not billed.

**Webhook endpoint.** Stripe Dashboard → Developers → Webhooks → Add endpoint:
URL `https://<APP_ORIGIN host>/api/billing/webhook`, events `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

**Locally,** with the [Stripe CLI](https://docs.stripe.com/stripe-cli):

```bash
stripe login
stripe listen --forward-to localhost:8790/api/billing/webhook
```

`stripe listen` prints a `whsec_…` for this session: put it in `.env` as `STRIPE_WEBHOOK_SECRET` and restart the API.

**Without keys,** `node server/devFakeBilling.ts` runs the API against an in-memory fake Stripe (same as the tests) with its events delivered to the webhook; see the header of that file. Test cards: 4242 4242 4242 4242 succeeds, 4000 0000 0000 9995 declines, 4000 0025 0000 3155 asks for 3-D Secure.

## 8. Pre-launch checklist

- [ ] `docker build` succeeds from a clean checkout. The image has no `.env` or `data/`: `docker run --rm reclaim ls -a /app` shows no `.env`.
- [ ] Domain resolves, HTTPS works, `http://` redirects to `https://`.
- [ ] `APP_ORIGIN` matches the domain exactly. The container starts with no "Refusing to start" lines.
- [ ] `GET /healthz` returns 200 through the public URL. The host's health check uses it.
- [ ] Volume mounted at `/data` and survives a container restart: sign up, restart, sign in.
- [ ] Email works end to end: sign up with a fresh address, get the verification email, follow the link, run a password reset.
- [ ] `DEV_MAILBOX` is unset. `GET /api/dev/mailbox?to=x` returns 404.
- [ ] Google sign-in works on the real domain (origin and redirect URI set, consent screen published).
- [ ] QuickBooks: either all three `QBO_*` set with the redirect URI registered at Intuit, or none set.
- [ ] Daily backup scheduled and copied off the server. One restore tested.
- [ ] Secrets live only in the host's secret store. Nobody has pasted them in chat, tickets or the repo.
- [ ] One container per volume. No autoscaling to more than one instance.
- [ ] Pilot customers know it's supervised: billing is test-mode only, and QuickBooks is sandbox only.
- [ ] Stripe: prices created (`npm run stripe:setup`), webhook endpoint added with the five events, both `STRIPE_*` secrets set, `VITE_STRIPE_PUBLISHABLE_KEY` from the same account baked into the build. One test subscription started, switched, cancelled.
- [ ] Rate limiting behind the proxy (§3): accepted for this pilot, or fixed.

## Running a production build locally

To check the production build on this Mac without real email or the main checkout's `.env`:

```bash
npm run build
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=production SESSION_COOKIE_SECURE_OK=1 PORT=8799 APP_ORIGIN=http://localhost:8799 DATABASE_PATH=/tmp/reclaim-qa.sqlite RESEND_API_KEY=re_not_real EMAIL_FROM=qa@localhost node server/index.ts
```

The dummy Resend key gets past the startup check. Any email the server tries to send fails, which is fine for browsing.
