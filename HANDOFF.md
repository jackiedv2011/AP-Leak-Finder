# Reclaim — handoff for a fresh session

Project: `/Users/jaganvenkatraman/Documents/AP Leak Finder` (GitHub: `jackiedv2011/AP-Leak-Finder`, branch `main`). Updated 2026-09-24.

## 0. Read this first — nothing from the last session is committed

- `HEAD` is `2a113e4` "Add end-to-end recovery workflow" (pulled from `origin/main`, authored by the co-founder, Terminalds / dr.mintcurry@gmail.com). Local `main` = `origin/main`.
- **All of the last session's work sits on top as uncommitted changes** — ~77 modified files and 15 new ones (see §3). The owner asked for nothing to be committed or pushed until they say so. **Don't commit, push, stash or reset without asking.**
- Before committing, re-run the full check in §1. When it's time: one commit for the work, then `git push` — confirm with the owner first, and check `git fetch` for new co-founder commits before pushing.
- Still untracked and intentionally ignored: `80972494032__467652C4-6048-4193-8321-F02BB5513A6B.MOV` (old screen recording, unreferenced). Three old stashes exist from earlier sessions — leave them alone.

## 1. Run it and check it

```bash
cd "/Users/jaganvenkatraman/Documents/AP Leak Finder"
npm run dev:server     # API — reads ./.env (PORT=8790 on this Mac)
npm run dev            # Vite — VITE_PORT=5174, proxies /api to the API
```

- Ports live in `.env` (git-ignored). `PORT` and `VITE_PORT` must agree with `vite.config.ts`'s proxy; `APP_ORIGIN=http://localhost:5174` is baked into the Google OAuth redirect.
- Stale process holding a port → `lsof -nP -iTCP:8790 -sTCP:LISTEN` and kill it.
- **Restart the API after any `server/` change** — it doesn't hot-reload. Starting it runs additive DB migrations on `./data/reclaim.sqlite`.
- The owner's real account (`j…@gmail.com`, Free) is signed in on this Mac. **Don't run test uploads in it** — use a guest session, or an isolated production copy:
  ```bash
  npm run build
  NODE_ENV=production SESSION_COOKIE_SECURE_OK=1 PORT=8799 APP_ORIGIN=http://localhost:8799 DATABASE_PATH=/tmp/reclaim-qa.sqlite node server/index.ts
  ```

Checks (all passing at handoff):

```bash
npx tsc -b && npx vitest run   # 41 files, 456 tests
npx oxlint                     # 0 errors; 12 pre-existing warnings (mostly landing-site/main.js)
npm run build                  # includes dist/<route>/index.html for app routes, incl. /checkout
```

## 2. `.env` — what each thing unlocks

| Variable | State | Without it |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `_SECRET` | Set on this Mac | Google button hidden |
| `ANTHROPIC_API_KEY` | **Not set** | "Draft with AI" says it isn't configured. Never tested live. Default model `claude-opus-5`. |
| `RESEND_API_KEY` / `EMAIL_FROM` | **Not set** | Verification/reset emails go to the dev mailbox. In production they go nowhere → **real users can't verify. Must be set before launch.** Resend needs a domain you own (not Gmail). |
| `VITE_STRIPE_PUBLISHABLE_KEY` | **Not set** | Checkout runs on Stripe's public demo test key (`pk_test_TYooMQ…`). |
| `DEV_MAILBOX` | unset | Dev mailbox is only on for a localhost origin; `DEV_MAILBOX=true` forces it on. Never on in production. |

Never commit `.env` or paste secrets. A full git-history scan found no committed secrets.

## 3. What the last session did (all uncommitted)

### Merged the co-founder's recovery workflow (`2a113e4`)
Their commit adds: customer approval before outreach (with contact hold and "already known" disclosure), business-day follow-ups, logged vendor responses, settlements that each need a reference (credits must name the bill applied to; multiple partial settlements; duplicate references refused), reopening an unpaid remainder, reconciliation with root cause, the Recovery Journey screen, redesigned Dashboard/Recoveries, and stricter AI payloads (no reviewer notes or bank digits sent). Our work was layered onto it, not the other way round — their workflow and screens were kept wherever both sides changed a file.

### QA and hardening
- **Detection engine** (`src/lib/detection.ts`) — fixed over-claims (a split-payment invoice could claim 2× what was overpaid; refunds subtracted per cluster; refunded overpayments still claimed; `100/10 net 30` claimed a whole invoice as a discount), false positives (weekly standing orders; `****1234` vs `1234` bank accounts; alternating known accounts), and false negatives (outliers impossible below 9 payments — now median/MAD, ≥5 payments, ≥3× median; many terms spellings ignored). All money is whole cents.
- **Vendor resolution** — numbered locations ("Station 1042" vs "1043") no longer merge; long names no longer freeze the page (25 s → ms).
- **CSV parser** — `1.234,56` no longer silently becomes $1.23 (row skipped instead); two-digit years; common header aliases; BOM; clear messages for `.xlsx`, binaries and files over 50 MB.
- **Honest money** — `src/lib/claims.ts` is the one definition of what counts as a claim. "Potential recovery" excludes missed discounts (prevention) and bank-change / shared-invoice alerts (reported separately as "payments to verify"). Non-claim findings go through "Close internal review" and can never be recorded as money back. Letters keep the stated facts when a smaller amount is requested. Recovery requests are capped at what the records support, in the model itself.
- **Server security** — dev mailbox (which exposes reset links) only on localhost; static files served as bytes (images/fonts were corrupted in production); security headers + `no-store` on API; malformed URLs no longer 500; projects shape-validated; AI errors become a clean 502 and any draft containing an amount not in the case data is rejected.
- **Scale** — 50k rows: detection 118 s → 1.3 s. Stored payload shrunk; when browser storage is full the app keeps working in memory with a notice.
- **UI** — restored the lost Light/System/Dark control (Settings); dashboard figures never clip; Findings rows of locked findings show placeholders (a blur was not access control); Free-plan locked content is no longer readable in the page source; tour tip styling; sticky dialog footers; `.wk-linklike` style; "Account" email no longer overlaps (wraps after `@`).

### New pricing (three tracks) — `server/plans.ts` is the source of truth
| | Free | Growth | Flat |
|---|---|---|---|
| Price | $0 | $19.99/mo + 15% of what's recovered | $100/mo, no fee |
| Uploads | Unlimited | Unlimited, re-audits allowed | same as Growth |
| Findings | 3 lowest-value per upload | all | all |
| Extras | — | AI drafts, full recovery workflow, reports, "Gmail sending — coming soon" | same as Growth |

- **Free repeat-upload rule** (`server/uploads.ts`, shared by server and browser): each payment row is fingerprinted (vendor, invoice, date, amount). An upload is a repeat when ≥50% of its rows already went to a *different* audit → flagged before it runs and refused by the server (`409 repeat_upload`). Catches renamed copies, reordered rows, trimmed pieces, delete-and-reupload, and the import endpoint. A new month with a little overlap is allowed. Guests get the browser check only (`src/ledger/uploadRegistry.ts`).
- The old 3-audits-a-month cap is gone. Old `pro` accounts migrate to `growth`. `FLAT_BREAK_EVEN` = $533.40/month recovered.
- **"Automatic Gmail sending" does not exist** — it is always labelled "coming soon". Don't remove that label unless it's built.
- Pitch copy: `src/lib/plans.ts` (`PLAN_PITCH`), public page `landing-site/src/pages/pricing.html` (rebuilt with `node landing-site/build.cjs`; old $99/$249/$599 tiers and claims about accounting connections, SSO, vendor outreach removed).

### Plans section and checkout
- Sidebar → **Plans** (`src/workspace/views/Plans.tsx`): three cards + comparison table; works even before a first audit. Free → "You're all set on Free" confirmation; Growth/Flat → `/checkout?plan=…` (guests go via sign-up with `next=`).
- **`/checkout`** (`src/pages/CheckoutPage.tsx`): order summary, contact, card (Stripe's hosted field — the card number never touches Reclaim), country/ZIP, consent, Subscribe. Test-mode banner. A verified card shows "nothing was charged, your plan hasn't changed". Invalid plan → back to Plans.
- **No real billing exists.** To go live: set `VITE_STRIPE_PUBLISHABLE_KEY`, then build a server endpoint holding `STRIPE_SECRET_KEY` that creates the subscription, plus a webhook that sets `users.plan` from Stripe events (never from the client). Growth's 15% fee is calculated and shown (Settings) but not billed. `src/billing/*` and `src/components/billing/*` are older unused prototypes.

### Testing done
456 automated tests (from 279), including adversarial suites for the engine, parser, letters and server, and a seeded random walk over the recovery workflow (12k actions per run; also run once at 60k). A browser stress run of 130 rounds (127 generated messy uploads, 313 cases, 1,125 recovery actions) produced zero JS errors and zero inconsistent cases. Account email: `reclaimbusiness1@gmail.com` is now the public contact (footer, Terms/Privacy).

## 4. Open items, in priority order

1. **Owner decision: commit & push** this work (see §0).
2. **Before real users:** configure Resend with a domain; build real Stripe billing (§3); decide deployment (none exists yet — the production server path is `npm start`, which needs `NODE_ENV=production` and an `https` `APP_ORIGIN`).
3. Test "Draft with AI" once with a real `ANTHROPIC_API_KEY`.
4. Gmail sending — build it, or keep it labelled "coming soon".
5. Pro-only (now Growth/Flat) UI flows were tested by automated tests, not by clicking — a manual pass on a paid dev account (Settings → "Dev: switch to Growth") is worthwhile.
6. Smaller: no Content-Security-Policy (marketing pages use inline scripts); near-duplicates have no path to a vendor letter; daily same-amount orders can still flag as near-duplicates; guests lose audits over ~10k rows on reload; "Seven checks" in marketing vs eight in the app; `demo/` build has no npm script; the stray `.MOV`.

## 5. Don't touch without a reason (and a regression test)

- `src/lib/detection.ts`, `src/lib/vendorResolution.ts`, `src/lib/claims.ts`, `src/recovery/model.ts`, `server/plans.ts`, `server/uploads.ts`, `server/auth.ts` — every rule here has adversarial tests; change a rule only with a test that states the new expectation.
- The `.wk-*` CSS class names — UI tests query them directly.
- Never report a figure as "recovered" unless it's recorded as settled, and never add "potential", "in recovery" and "recovered" together.
