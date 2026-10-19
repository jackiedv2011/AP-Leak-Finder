# Sub pages and the app, brought onto the new landing style

Status: **plan**. Next come the mockups, then the code. Each stage is reviewed before the next one starts.
Inspected 2026-10-19 at 1440×900 and 390×844, light and dark, against `landing-site/` at `3e7c6ca`.

## 0. The reference: what the new landing actually is

The Oct 18 redesign (`55b50c7`) rebuilt the markup of `landing-site/src/pages/index.html` only. What it set:

| | the new landing |
|---|---|
| Display type | Schibsted Grotesk, semibold, **sentence case, never capitals**, tight tracking; one italic word for emphasis ("should *still* have", "*Reclaim keeps going.*") |
| Text / labels | Geist for reading; Geist Mono for small capped eyebrows and step numbers ("WHAT RECLAIM FINDS", "01") |
| Palette | warm grey hero (`--cl-grey-200 #ebe7de`), paper (`#fcfbf7`), green-black ink (`#08100c`) for dark sections, warm greys (`#827d73`…) |
| Green (`#00fd74`) | rationed: money that comes back ($4,280), one CTA per section, status dots. Never a background, never decoration |
| Pastels | only inside exhibit tiles and status chips (green-2, orange-2, purple-2, blue-2) |
| Page rhythm | grey hero with ink type and a 3D object on the right → ink rounded section → paper sections → coin-stack closer → ink footer |
| Nav at the top | light pill, ink "Get Started" (it turns dark/green only over ink sections) |
| 3D | the new matte family: the record-slab stack (hero), four exhibit objects on pastel tiles, the MacBook, the green coin stack (closer) |
| Product | the real app as live HTML on the MacBook, ink caption cards with a mono step label, a step pill |
| Components | numbered columns (01 Upload / 02 Find / 03 Recover), "most tools stop here" track, exhibit tiles with mono captions, white summary card with pastel chips, export tiles, trust strip with line icons |

## 1. Why the sub pages don't look like it (root cause)

The sub pages (How It Works, What It Checks, Pricing, Research + 4 articles, Guides + 4 guides,
Security, About) were built in September from the **previous template family** — `hero-business`,
`hero-solutions`, `hero-generic`, `hero-about`, `hero-article`, `rounded-section` with a sticky side
index. When the landing was redone, only `index.html`'s markup changed; the other pages were just
rebuilt. They picked up the shared nav, footer, fonts and colour tokens from `styles.css`, so they
look *half* new — the right fonts on the old page bodies, heroes, icons, cards and 3D.

## 2. The differences, shared by every sub page

| # | Sub pages today | New landing | Where it lives |
|---|---|---|---|
| D1 | **Black hero** with white type, and no object | Warm grey hero, ink type, 3D on the right | `.hero-business/-solutions/-generic/-about` in `pages.css`; `theme="black"` in each page |
| D2 | Nav starts **dark with a neon-green Get Started** (the hero is black) | Light pill, ink Get Started | follows D1 (`nav-slot data-theme="black"`) |
| D3 | Hero ends in a big **anchor list** (Connect / Find / Evidence… rows with arrow squares) | No such thing | `.hero-business-nav-item`, `.down-right` |
| D4 | Body is a **white rounded card rising over the black hero**, with a sticky left index | Ink rounded sections on grey, then plain paper; no side index | `rounded-section … hide-nav`, `.article-nav` |
| D5 | **Neon-green square icon tiles** mark every section (Connect, Find, Plans, The Recovery Ledger, every Security card, every check) | Mono numbered eyebrows | `.icon` inside each `.article-module` |
| D6 | Green used as **fill everywhere**: icon tiles, tick badges, bullets, bars, tag chips, a full mint hero band on research articles | Green rationed (see §0) | `pages.css` |
| D7 | **Capitals headings**: About hero ("RECLAIM WAS BUILT ON ONE FACT…"), Security ("WHAT RECLAIM READS"), research articles ("SUMMARY", "TAKEAWAYS", "THE BOTTOM LINE"), About "latest updates", pricing plan names in JetBrains Mono caps | Sentence case only | `pages.css:774, 824-825, 840, 883`, `.richtext` |
| D8 | **Old 3D**: orange/green hexagon chain, rainbow hex prisms, speckled cubes, yellow coin (`/media/connect|find|build|recover.webm`); striped "dept" renders and "57% Suppliers" stat cards (`/assets/dept-*.png`, `/assets/cs-*.png`); a hexagon outline placeholder on Guides; flat line-icon shield/envelope boxes on Security | The matte record-stack / exhibit family | page sources, `assets/`, `media/` |
| D9 | App screenshots in a **dark tablet bezel** | The MacBook, or the app flat on the page | `.screen-fit` frames on How It Works |
| D10 | **Black "check" cards** in sideways carousels with green ticks (What It Checks); grey rounded icon cards (Security) | Pastel exhibit tiles; white summary card | `pages.css` |
| D11 | Long pages end in a **plain accordion FAQ** then the closer | — (fine to keep; restyle as the landing's ruled list) | `partials/faq.html` |

## 3. Page by page

| Page | Today | Change |
|---|---|---|
| **How It Works** | Black hero "Records in. Recoveries out." + 5-row anchor list; white card with side index; four sections each with a green icon tile, an old 3D loop and an app shot in a tablet; "57% / 8.2 Days" stat carousel; FAQ | Grey hero with the record stack. One ink section with the landing's 01–04 numbered columns (Connect · Find · Evidence · Recover) instead of the anchor list. Each step on paper: mono eyebrow, sentence heading, the app mock flat (no bezel), an exhibit still where a 3D object helps. Stat carousel → two big Geist Mono figures on paper. FAQ restyled. |
| **What It Checks** | Black hero "Five checks. Every payment." + 5-row anchor list; five sections, each a green icon + a carousel of black tick cards; green 6-tile "how we work" grid | Grey hero. The five checks become the landing's **exhibit tiles** (the four stills exist: duplicate payment, overpayment, unused credit, duplicate bill; the fifth — payment mismatch — needs a render). Each check's examples become a ruled list, not black cards. The 6-tile grid → the landing's trust strip. |
| **Pricing** | Black hero "You keep what comes back" with underlined word + anchor list; plan cards with mono caps names and green rules; Growth card black with green button; green-dot stepper; FAQ | Grey hero, italic emphasis instead of underline. Plans on paper: Schibsted names in sentence case, ink buttons (one green on the recommended plan), figures in Geist. The "what counts as recovered" stepper redrawn as the landing's **Flagged → Settled track**. |
| **Security** | Black hero; capitals "WHAT RECLAIM READS"; grey cards with green icon tiles; flat shield/envelope boxes | Grey hero. Sentence-case headings. Cards → white summary-card rows with line icons (like the landing's trust strip). Shield/envelope boxes removed (or one new render: a sealed record box). |
| **About** | Black hero, all capitals, two sizes; numbered beliefs with grey 01–05 and green rules; "Where our numbers come from" chips; research carousel with old striped renders | Grey hero, sentence case, one italic word. Beliefs → landing's numbered columns. Research carousel uses the new research cards (below). |
| **Research index** | Black hero; filter panel with green chip toggles; cards with old striped renders | Grey hero. Filters as plain mono chips (ink when on). Cards: paper, pastel tile with an exhibit still, mono source line. |
| **Research article ×4** | Full mint-green hero band; capitals section heads; old stat cards (1.5% / 18.4%) with renders | Paper hero with mono "Sources checked" line; sentence-case heads; stat cards → big figures on a pastel tile, no render needed. |
| **Guides index** | Black band hero under a light nav; 2px black-bordered "Start here" box with black "GUIDE READY" badges; hexagon placeholder | Grey hero. "Start here" as a white summary card, system names as the landing's export tiles (QuickBooks / Xero / NetSuite / Bill). |
| **Guide ×4** | Closest to the new style already (paper, Schibsted, ink buttons) | Swap the green filled step numbers for ink numbers with a mono label; green code highlights → paper highlight; keep the rest. |

## 4. The app ("the dashboard and the rest")

The workspace's look is `src/workspace/reclaim.css` (it overrides older tokens in `workspace.css`
and `vercel.css`). The landing's MacBook mock (`.app` in `landing-site/styles.css`) was written to
mirror it, so inside the laptop they agree — but next to the landing pages around it the app reads
as a different product:

| # | App today | New landing | Where |
|---|---|---|---|
| A1 | Cool neutral greys: canvas `#f3f3f3`, cards `#fff`, lines `#e2e2e2`, text `#0a0a0a` | Warm paper `#fcfbf7`/`#f4f1ea`/`#ebe7de`, ink `#08100c`, warm greys | `reclaim.css` light tokens |
| A2 | Dark theme is true black (`#000`, `#111`, `#242424`) | Green-black ink (`#08100c`, `#121a16`, `#212a25`) | `reclaim.css` dark tokens |
| A3 | Page titles and headline money in Geist | Schibsted Grotesk for display and the big figures ("$8,970") | `.wk-display`, `.wk-money` |
| A4 | **Launch** ("UPLOAD A PAYMENT LEDGER.") and **Onboarding** ("LET'S FIND MONEY THAT'S YOURS.") in Barlow Condensed capitals, with the old black-clay cubes / cream paper 3D | Schibsted sentence case; the new 3D family | `onboarding.css` (`--ob-display`, 6× `uppercase`), `public/onboarding/*`, `views/Launch.tsx` |
| A5 | **Checkout** in Barlow capitals ("START RECLAIM GROWTH"), the old "R Reclaim." wordmark | Schibsted, hexagon wheel logo | `CheckoutPage.tsx` |
| A6 | Privacy / Terms: plain white page | Paper, Schibsted headings | `LegalLayout.tsx` |
| A7 | Labels on Overview tiles ("Recovery candidates / Flagged for review / In recovery / Recovered") differ from the landing mock ("Ready to claim / Needs more context / In recovery") | Same words in both | the mock in `landing-site` should follow the app (money definitions in `src/lib/claims.ts` are not to change) |
| A8 | Tour and tutorial popovers: near-black cards | Ink caption cards with a mono step label — close already | `tour.css`, `tutorial.css` |

What stays: the layout (sidebar, top bar, command menu), every `.wk-*` class name (UI tests query
them), the Customize accents, all copy and money rules.

## 5. The plan

**Stage 1 — Mockups** (static HTML, built on the real `styles.css` so what is approved is what ships):
1. The new sub page template: grey hero + 3D, ink numbered section, paper sections with mono eyebrows — shown as **How It Works** top to bottom.
2. **What It Checks** with the five exhibit tiles, and **Pricing** with the plans and the Flagged → Settled track.
3. One sheet each for Security, About, Research (index + article) and Guides (index) at hero + first two sections.
4. The **dashboard** Overview and Findings in the new tokens, light and dark, next to today's; plus Launch and Onboarding's first screen.
5. Phone (390 px) for the template and the dashboard.

**Stage 2 — Code**, in this order, each a reviewable commit:
1. Marketing foundation: a `page-hero` partial modelled on `.hero-home` (grey, 3D slot, CTAs); mono section eyebrow; exhibit tile and summary card made reusable; remove heading capitals; green-fill rules out of `pages.css`; retire the anchor list, side index and tablet bezel.
2. Pages, in traffic order: How It Works → What It Checks → Pricing → Security → About → Research → Guides.
3. App tokens: warm light + ink dark in `reclaim.css`; Schibsted for `.wk-display` and headline money; tour colours.
4. Launch, Onboarding, Checkout, Legal.
5. Update the landing's `.app` mock to the new app tokens and labels so the walkthrough shows the real thing.

Checks every step: `node landing-site/build.cjs`; screenshots at 1440 / 1280 / 390 against the
mockups; `npx tsc -b && npx vitest run`; `npx oxlint`.

## 6. Needs from the team

- **New renders.** No Blender in the cloud container. Until they exist the pages reuse the record
  stack and the four exhibit stills. Wanted, in the new family (`landing-site/blender/exhibit_common.py`,
  `hero_stack.py`): payment-mismatch exhibit; a sealed record box for Security; Launch's "your
  payments" / "our sample" cards and Onboarding's loops re-shot in the matte stock.
- **Decision: dashboard palette.** Recommended: warm paper/ink, as above. The alternative is to keep
  the neutral greys and change only type and the Launch/Onboarding/Checkout screens.

## Out of scope (noted)

`src/components/landing/*` and `src/components/site/*` are the old React landings; `/` is served from
`landing-site/` (`scripts/landingSitePlugin.ts`), so they are unused. `workspace.css` and `vercel.css`
still declare Barlow/Inter tokens that `reclaim.css` overrides.
