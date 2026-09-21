# Reclaim — handoff for a fresh session

Project: `/Users/jaganvenkatraman/Documents/AP Leak Finder` (GitHub: `jackiedv2011/AP-Leak-Finder`, branch `main`).

## 0. Read this first

**All the work described below is UNCOMMITTED.** It lives only in the working tree of this folder. `git status` will show ~50 modified/added/deleted files. Do not `git checkout .`, `git stash`, `git reset --hard`, or `git clean` — you will lose it. Before doing anything destructive, commit or stash-with-message first.

There is also an old stash entry (`local retheme + get-started flow, superseded by …`) that is obsolete and safe to drop, and an untracked `80972494032__…MOV` screen recording in the repo root that has never been addressed — ignore it or ask the owner.

## 1. Run the server

```bash
cd "/Users/jaganvenkatraman/Documents/AP Leak Finder" && npm run dev
```

- Deps are already installed (`node_modules` exists). No `npm install` needed unless `package.json` changes.
- Vite picks the first free port from **5173** upward. Port 5173 is often taken by an unrelated project (`Vibe-Coded-Website-for-AI-Class-JV`) — leave that process alone. Read the actual port from Vite's "Local:" line (last time it was **http://localhost:5174**).
- `.claude/launch.json` has `ap-leak-finder-dev` with `autoPort: true`, but the desktop app's `preview_start` may look in the wrong folder for it. If it errors, just start with the command above and open the printed URL.
- One `npm run dev` serves everything: the static marketing site (`landing-site/`, served at `/`, `/about`, `/pricing`, …) and the React app (`/audit`, `/login`, `/signup`, `/privacy`, `/terms`, …). A Vite plugin (`scripts/landingSitePlugin.ts`) rebuilds `landing-site/src/**` on change.

Checks that all pass right now:

```bash
npx tsc -b && npx vitest run     # 21 files, 162 tests
npm run build                    # production build incl. dist/<route>/index.html copies
```

## 2. What the product is

Reclaim reviews a CSV of AP payments and flags recoverable money (duplicate payments, overpayments, unused credits, …). Everything is **browser-only**: no backend, no server storage. Accounts, sessions, and audits live in `localStorage`/`sessionStorage`.

Intended flow: **Log in → Dashboard → Start an audit → Findings → Finding detail → Recovery**.

## 3. What was just done (this session)

### Auth (was dead code; now wired in)
- `src/App.tsx` mounts `AuthProvider` and routes `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/privacy`, `/terms`. `/audit` and `/scanner` are wrapped in `RequireAuth` → redirect to `/login?next=…`. Logged-in users hitting `/login` or `/signup` bounce to `/audit`.
- `src/lib/auth/localAuthService.ts`: sign-up takes first name, last name, email, password, confirm, company, `acceptedTerms`. Records `termsAcceptedAt` + `termsVersion` (from `src/legal/terms.ts`). Login has `rememberMe` (localStorage vs sessionStorage). Per-field validation via `validateSignUp` / `validateLogIn`. Wrong password and unknown email return the same message on purpose.
- `src/lib/auth/AuthContext.tsx` exports `useAuth` and `useOptionalAuth` (the latter so `WorkspaceShell`/`Settings` render in tests without a provider).
- Pages in `src/pages/`: `AuthLayout.tsx` (+ `Field` helper), `LoginPage`, `SignupPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `LegalLayout`, `PrivacyPage`, `TermsPage`, `authRedirect.ts` (`nextAfterAuth`, `loginUrlFor`, `redirectTo` — mocked in tests).
- Guest mode is kept: "Try the sample audit without an account" on the login page. That's what the landing site's "Get Started" (`/audit?entry=sample`) relies on.

### Dashboard / workspace
- Six sections (`src/audit/useAuditRoute.ts` `RouteMode`): `dashboard | audits | findings | recoveries | reports | settings`. Old names (`overview`, `opportunities`, `vendors`, `data`, `recovery`) map onto their replacements.
- `src/workspace/WorkspaceShell.tsx`: sidebar nav + account block (name/company, Log out). Exports `Mark` (the hexagon logo SVG).
- Views in `src/workspace/views/`: `Dashboard.tsx` (4 stat tiles: Potential recovery, Findings, Audits run, Recovered; Next-step CTA; pipeline strip; Recent findings; Where the money went), `Audits.tsx` (every saved audit + what the open one read + sources), `Findings.tsx`, `Recoveries.tsx`, `Reports.tsx` (by-check + every vendor; exports `Facts`), `Settings.tsx` (account, legal w/ terms-acceptance record, delete audit), `CaseDetail.tsx`, `Launch.tsx` (the "Start your first audit" screen shown when no audit exists), `Strength.tsx`.
- `src/AuditApp.tsx` orchestrates. "Start an audit" opens `ImportDialog` with `intent="new"` (creates a **separate** saved audit); "Add records to this audit" uses `intent="add"` (merges).
- `src/components/audit/ImportDialog.tsx`, `ImportPanel.tsx`, `ClearLedgerDialog.tsx` — dialogs, all styled by `workspace.css` (`.wk-overlay`/`.wk-panel`).

### Design system
- Single stylesheet: `src/workspace/workspace.css`. Tokens on `.wk`: `--bg #f7f4ee` (warm white), `--surface #fff`, `--text #171716`, `--accent #1f5f43` (dark green — buttons, active nav, key figures only), `--line #e4dfd5`, quiet shadows, `--radius 12px`, font Inter only. Every product surface (workspace, dialogs, auth pages, legal pages) carries the `wk` class so tokens travel with it.
- `index.html` preloads Inter and sets the warm-white body background before hydration.

### Landing site (`landing-site/`)
- Edit `landing-site/src/**` (pages/partials); the built HTML at `landing-site/*/index.html` is generated — don't hand-edit it.
- Added "Log in" to the nav (`src/partials/nav.html`, mobile menu in `main.js`) and a Legal footer group (Privacy Policy, Terms of Service) in `src/partials/footer.html`.

### Not touched (keep it that way)
`src/lib/detection.ts`, `src/ledger/*` (store, projects, caseState, views), `src/audit/dataReadiness.ts`, CSV parsing. These are the audit engine and are well tested.

### Deleted (superseded)
`src/components/app/AccountMenu.tsx`, `src/pages/auth.css`, `src/workspace/views/{Overview,Opportunities,Vendors,Simple}.tsx`.

## 4. Test conventions (so you don't break them)
- `src/AuditApp.test.tsx` drives the real UI: it reads stat tiles via `.wk-ladder > div` (label in `.wk-label`, value in `.wk-figure`, `data-accent` when green), the pipeline via `.wk-pipeline > div` / `.wk-pipeline-figure`, tables via `.wk-table tbody tr`, `<dl>` facts via `dt`/`dd`. Keep those class names if you restyle.
- Dashboard readiness signal in tests: the `Recent findings` heading.
- `src/App.test.tsx` mocks `redirectTo` from `src/pages/authRedirect.ts` — jsdom won't let you spy on `window.location.replace`.

## 5. Out of scope (owner's explicit instruction)
No QuickBooks/Xero integrations, no recovery-fee/take-rate billing, no accountant features, no new product functionality. Legal pages stay marked as drafts until reviewed by a lawyer.

## 6. Open decisions the owner hasn't made yet
- Pricing (competitor is $7/mo; owner floated $5/mo + 1% of recoveries; the codebase has no live pricing copy in the new UI — old `$299/mo + 3%` copy was removed with the old views).
- Whether to keep guest mode long-term.

---

## 7. NEXT TASK: animated background art on the auth + launch screens

Add slowly-moving background imagery to three screens, without touching their forms/content:

1. `/login` (`src/pages/LoginPage.tsx` → `AuthLayout`)
2. `/signup` (`src/pages/SignupPage.tsx` → `AuthLayout`)
3. The "Start your first audit" launch screen (`src/workspace/views/Launch.tsx`) — the one with the headline *"Upload a payment ledger. Reclaim finds the money that should still be yours."* and the 1-2-3 cards.

### What the owner wants
- **Several separate images scattered** around the background (not one hero image, not a grid) — e.g. 5–8 cards at different sizes/positions, mostly toward the edges so the form/card in the middle stays readable.
- The images are **screenshots / mock screenshots of Reclaim itself**: the dashboard stat tiles, the findings table, a finding detail with the evidence table, the recovery pipeline strip, the audits list. Either capture real screenshots of the running app (preferred — put PNG/WebP files under `public/art/`), or generate faithful mock-ups (small HTML/SVG renders of the same components using the `.wk` tokens). Don't use stock imagery or made-up UI that doesn't match the product.
- Each image **drifts slowly** in the background, **moving clockwise** — i.e. each card travels around a small circular/orbital path clockwise (translate along a circle, ~40–90 s per revolution), optionally with a very slight clockwise rotation (±2–3°). Slow, calm, premium; nothing bouncy. Different cards should have different radii/durations/phase offsets so they don't move in lockstep.
- Keep it subtle: low opacity (~0.35–0.5), soft shadow, slight blur or scale-down for the ones "further back", so the login/signup card still dominates. The warm-white background (`--bg`) stays; no dark overlays.
- Must not capture pointer events (`pointer-events: none`), must not cause horizontal scroll (`overflow: hidden` on the layer), must sit behind the form (`z-index`), and must respect `prefers-reduced-motion: reduce` (freeze in place).
- Mobile: fewer/smaller cards (or hide most of them below ~700px) so the form isn't cluttered.

### Suggested implementation
- New component `src/components/art/ScreenshotDrift.tsx` that renders a fixed, full-viewport layer with N absolutely-positioned `<img>` cards, each given CSS custom properties (`--x`, `--y`, `--r`, `--dur`, `--delay`, `--scale`) and a shared keyframe:
  ```css
  @keyframes wk-orbit {           /* clockwise circle of radius var(--r) */
    from { transform: rotate(0deg)   translateX(var(--r)) rotate(0deg)    scale(var(--scale)); }
    to   { transform: rotate(360deg) translateX(var(--r)) rotate(-360deg) scale(var(--scale)); }
  }
  ```
  (rotating a parent while counter-rotating the child keeps the card upright while it orbits clockwise; drop the counter-rotation partially if a slight tilt is wanted.)
- Styles go in `src/workspace/workspace.css` under a new `/* ---------- background art ---------- */` block, using existing tokens only.
- Mount it in `AuthLayout` (covers login/signup/forgot/reset) and in `Launch`. Don't add it to the workspace itself or the legal pages.
- Add a small test that `AuthLayout` renders the layer with `aria-hidden="true"` and that it's absent when `prefers-reduced-motion` is emulated, if practical.

### Verify before finishing
Open `/login`, `/signup`, and (logged out → log in → with no audits) the launch screen at desktop and 375px width; confirm the form is fully readable, nothing overlaps interactive elements, no horizontal scrollbar, and `npx tsc -b && npx vitest run` still pass.
