# Reclaim — handoff for a fresh session

Project: `/Users/jaganvenkatraman/Documents/AP Leak Finder` (GitHub: `jackiedv2011/AP-Leak-Finder`, branch `main`).

## 0. Read this first

Everything described below **is committed and pushed** to `origin/main` as of commit `141e4c5`. The working tree is clean except for one stray untracked file in the repo root, `80972494032__467652C4-6048-4193-8321-F02BB5513A6B.MOV` (an old screen recording, never addressed — ignore it or delete it, it isn't referenced anywhere).

**Two people have been pushing to `main` in parallel.** This session did the accounts/recovery/plans backend work (below). A separate person/session did visual design work on top of it — light/dark theming, a "3D object per screen" system, workspace rescaling — in 15 commits merged into `main` most recently. Both sets of work coexist cleanly (merged with no conflicts; 279/279 tests pass, `tsc` clean, build clean) but **no one has visually reviewed the combined result yet**. Do that before doing much else — open `/audit`, toggle light/dark in Settings, and check nothing from the accounts/plans UI (locked findings, the upgrade dialog, the onboarding tour) clashes with the new theme system.

## 1. Run it

Two processes, in two terminals:

```bash
cd "/Users/jaganvenkatraman/Documents/AP Leak Finder"
npm run dev:server        # API — reads ./.env, defaults to :8787
```

```bash
cd "/Users/jaganvenkatraman/Documents/AP Leak Finder"
npm run dev                # Vite — reads VITE_PORT from .env, proxies /api to the server
```

- Both ports are pinned by `.env` (**not committed** — see §2). This machine's `.env` has `PORT=8790` and `VITE_PORT=5174`, because `8787`/`5173` are already used by another project on this Mac. If you're on a different machine, either copy those exact values or pick free ports and update both `PORT`/`VITE_PORT` together — `vite.config.ts` reads the API's `PORT` straight out of the `.env` file to build its proxy target, so the two must agree.
- `.claude/launch.json` has `ap-leak-finder-dev` (port 5174) and `reclaim-api` (port 8790) entries for `preview_start`, matching this machine's `.env`.
- If you ever see `ECONNREFUSED`/`EAGAIN` proxy errors from Vite, it's almost always a stale process still holding the port from a previous session — `lsof -nP -iTCP:5174 -sTCP:LISTEN` (swap the port) and kill it.
- One `npm run dev` serves both the static marketing site (`landing-site/`, at `/`, `/about`, `/pricing`, …) and the React app (`/audit`, `/login`, `/signup`, …).

Checks that currently pass:

```bash
npx tsc -b && npx vitest run     # 28 files, 279 tests
npm run build                    # production build incl. dist/<route>/index.html copies
```

## 2. `.env` — who has what, and what each thing unlocks

**`.env` is git-ignored and has never been committed.** Only `.env.example` (placeholders, safe) is in the repo. This means:

- **A fresh clone has none of this working** until someone creates a `.env`. Signup/login/audits/findings/recoveries/plans all work with **zero config** — those don't need secrets.
- **Google sign-in** needs `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (this Mac has both, from a real Google Cloud OAuth client already registered for `http://localhost:5174/api/auth/google/callback`). Without them, the button is simply hidden (`/api/auth/providers` reports `google: false`) — nothing breaks.
- **"Draft with AI"** needs `ANTHROPIC_API_KEY` — **not set anywhere yet**. The button is always visible (Free plan shows it as an upgrade prompt, Pro shows it live), but clicking it on Pro without a key just returns "AI drafting is not configured on this server." Nobody has tested a real draft end-to-end.
- **Real email** needs `RESEND_API_KEY` + `EMAIL_FROM` — **not set**. Without them, verification/reset emails go to an in-app "dev mailbox" (the UI shows the link directly instead of sending anything). Fine for dev, must be set before anyone outside the two of you signs up for real.

If you hand your co-founder your `.env` verbatim: they get everything working identically to you, **as long as they run on the same ports** (`APP_ORIGIN=http://localhost:5174` is baked into the Google redirect URI registered in Google Cloud — a different port means Google rejects the callback). Longer-term, each dev should have their own Google OAuth client and API keys rather than sharing one secret across two people — not urgent, just don't let it become permanent.

## 3. What this session built (Phase 1 + Phase 2, commits `1ae4875` and `b5df1da`→merged as `141e4c5`)

**Phase 1 — audited and stress-tested the existing detection engine.** Built a 68-row messy AP fixture (`src/test/fixtures/messy-ap-ledger.csv`) with 12 true-positive and 12 false-positive scenarios, expectations written before running the engine. Found and fixed real bugs: instalments were flagged as duplicates, overpayments included the whole extra payment instead of just the overshoot, refunds weren't netted against duplicate findings, credit/zero-dollar rows were treated as payments, recurring same-amount series (rent, subscriptions) were flagged as near-duplicates, the dashboard's potential/verified/in-recovery/recovered numbers weren't mutually exclusive (a recovered case still counted as "potential"). Parser now accepts `MM/DD/YYYY`, `YYYY/MM/DD`, ISO timestamps, and `(150.00)`-style negatives.

**Phase 2 — built the parts of the product spec that didn't exist yet:**

- **Real accounts**, server-side (`server/`, plain Node + `node:sqlite`, no framework). Signup with email verification, login, logout, forgot/reset password (single-use hashed tokens), scrypt-hashed passwords, HttpOnly session cookies. Per-account data isolation — audits live in SQLite keyed by `user_id`, the browser keeps a localStorage *cache* of the signed-in account's data that's wiped on logout.
- **Google sign-in** — server-side OAuth code flow, identity scopes only (`openid email profile`, no Gmail access). Handles first-time users, linking to an existing password account by verified email, cancelled/denied/tampered callbacks.
- **Pre-account data migration** — a browser with audits saved before accounts existed gets asked, once per session, whether to import them into the account that just logged in, defer, or delete. Never auto-imported.
- **Full recovery workflow** — partial/full/zero recovery amounts (validated against what was requested), refund/credit/offset methods, an append-only audit trail on every case (who did what, when, previous state → new state), a reopen path for decisions (until a request is sent) and outcomes (any time).
- **Letter generation wired in** — the existing generator now drafts from the real case data, is editable/copyable/downloadable, and "Mark request sent" only records that *you* sent it — Reclaim never emails anyone.
- **AI drafting** — `POST /api/ai/draft`, server-held Anthropic key, a strict allow-listed request shape (zod-validated) so nothing beyond the specific case's data reaches the model.
- **Free/Pro plans**, enforced server-side: `users.plan` column, `/api/account/entitlements`, a hard 3-audits/month cap on Free enforced by the API (not just the UI), AI drafting gated to Pro. Free shows the 3 lowest-value findings per audit in full and blurs the rest behind an upgrade prompt. Upgrading is honestly "coming soon" — `POST /api/account/upgrade` returns 501, no payment processing exists, no Stripe.
- **UX pass**: a proper decision dialog (Review this finding → This is real / needs more detail / not an issue, replacing three bare buttons), an "Audits" page that actually explains what an audit is, a six-step first-run onboarding tour (shown once per account, reachable again from Settings).

279 tests across 28 files (up from 232 at the start of this session), `tsc -b` clean, lint clean, production build clean. Full account+recovery+plan flow verified end-to-end in a real headless browser against the real server (not mocked) — signup → verify → upload → decide → request → partial recovery → dashboard totals → logout → re-login → same totals → forgot password → reset → login with new password.

## 4. What the other session/person built on top (commits `ae69ab1`…`67bd1ae`)

Visual/design work, not yet reviewed by me against the accounts/plans UI added above:

- `src/workspace/theme.ts` — light/dark/system appearance, resolved (not media-query-driven) so an explicit choice and the OS default share one code path. Stored in `localStorage` under `reclaim.theme.v1`.
- `src/workspace/objects.ts` + `WorkObject.tsx` — a small set of "3D object" still images (`landing-site/media/stills/*.webp`: tower, cluster, fan, apart, hex, stack, ring), one per workspace screen, described as "the only colour in the workspace" — everything else is meant to stay monochrome so the product reads as continuous with the marketing site's look.
- Rescaled/restyled `workspace.css` (601 lines changed), touched `Dashboard.tsx`, `Reports.tsx`, `Settings.tsx`, `AuditApp.tsx`, `index.css`.
- `demo/` + `vite.demo.config.ts` — a standalone build of just the workspace (bypasses the real app's pathname-based routing and tolerates being iframed on an opaque origin) "for review only." **No npm script wires this up yet** — check `vite.demo.config.ts` for how it's meant to be invoked, or add a `dev:demo`/`build:demo` script if one doesn't exist.

## 5. Immediate next steps, in order

1. **Visually review the merged result.** Load `/audit`, sign in, look at the dashboard, findings (locked/blurred state on Free), the decision dialog, the upgrade dialog, Settings (plan panel + appearance toggle), and the onboarding tour — in both light and dark mode. This is the first time these two bodies of work have been looked at together.
2. **Decide on `.env` sharing** with your co-founder (see §2) — either hand them this Mac's values over a secure channel, or have them create their own Google OAuth client. Either way they need `npm install` + both `npm run dev:server` and `npm run dev` running.
3. If you want AI drafting to actually work for anyone, someone needs to add `ANTHROPIC_API_KEY` to a `.env` and click "Draft with AI" once to confirm the whole path (nobody has yet).
4. Decide whether the `demo/` build is meant to be published somewhere (Netlify/Vercel preview?) or is just a local review tool — right now it exists but nothing runs or deploys it.
5. Delete or relocate the stray `.MOV` file in the repo root if it's not needed.
6. Commit is one push behind decisions on real payments/Stripe — explicitly out of scope until told otherwise; the Upgrade button is a placeholder by design.

## 6. Do NOT touch without a reason

- `src/lib/detection.ts`, `src/lib/vendorResolution.ts`, `server/auth.ts`'s password/session/token handling — all covered by the stress-test fixture and the server integration tests; changing them without adding a regression test is how Phase 1's bugs got in in the first place.
- `.env` itself — never commit it, never paste real secrets into chat/Slack/email in plaintext.
- The `.wk-*` CSS class names in `workspace.css` — the UI test suite (`AuditApp.test.tsx`, `accountFlow.test.tsx`) reads state by querying these classes directly.
