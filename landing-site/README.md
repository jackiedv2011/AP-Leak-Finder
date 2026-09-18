# Reclaim site (static)

The marketing site, built as plain HTML/CSS/JS. GSAP + ScrollTrigger, Lenis and Swiper load from
CDNs; there is no build tooling beyond one Node script and no dependencies to install.

It is not wired into the React app yet: `/` still renders `src/components/site/SiteLanding.tsx`.

## Build and preview

Pages are written in `src/` and built to clean-URL folders at the repo root. Build after every edit
to anything under `src/`:

```bash
node landing-site/build.cjs
```

```bash
node landing-site/build.cjs --watch
```

Then serve the built site and open http://localhost:5510 (set `PORT` to use another port):

```bash
node landing-site/serve.cjs
```

## How a page is put together

```
src/layout.html            the document shell: head, sprite, nav template, footer, modal, scripts
src/partials/NAME.html     pulled in with <!-- @include NAME --> from the layout or from a page;
                           <!-- @include NAME key="value" --> fills {{key}} inside the partial
src/pages/**.html          one file per page, with a front-matter block
```

Front matter sets the layout values:

```
---
title: Upload — Reclaim
description: ...
folder: platform          which nav group is marked current
template: platform        for page-specific motion
---
```

Output paths: `src/pages/index.html` → `index.html`, `src/pages/a/b.html` → `a/b/index.html`,
`src/pages/a/index.html` → `a/index.html`. **Never edit the built files** — they carry a generated
banner and are overwritten on the next build.

## Pages

| URL | source | built from the design of |
|---|---|---|
| `/` | `src/pages/index.html` | the original landing page |
| `/platform/upload`, `/platform/find`, `/platform/evidence` | `src/pages/platform/*.html` | hero pages |
| `/what-it-finds/{duplicate-payments,duplicate-bills,overpayments,unused-credits,payment-mismatches}` | `src/pages/what-it-finds/*.html` | solutions pages |
| `/research` + 4 articles | `src/pages/research/*.html` | case studies index and article |
| `/guides` + 4 export guides | `src/pages/guides/*.html` | support hub and its guide article |
| `/security` | `src/pages/security.html` | security page |
| `/company` | `src/pages/company.html` | company page |

Pricing is a nav link with no page behind it (`href="#"`), by design for now. Terms and Privacy are
dead links in the footer. Careers was left out.

## Files

| path | what |
|---|---|
| `build.cjs` | the builder described above (no dependencies) |
| `serve.cjs` | dependency-free static server with byte-range support for the videos |
| `styles.css` | the shared design system: tokens, type scale, grid, nav, footer, buttons |
| `pages.css` | everything specific to a page family (articles, research, guides, security, company) |
| `main.js` | motion and interaction: nav clones, split headings, smooth scroll, the popup, carousels, library filters, guide contents, accordions |
| `reels.js` | plays the 3D loops while they are on screen; swaps WebM for MP4 on Safari |
| `media/` | the 3D loops: transparent VP9 WebM plus H.264 MP4 fallbacks |
| `assets/` | card and thumbnail images |
| `notes/` | working notes: verified research sources, and the guide steps still to be checked |
| `blender/` | scripts that render and encode the 3D loops (see `blender/README.md`) |
| `BEFORE-DEPLOY.md` | **read this first** — everything unverified or deliberately left generic |

Render frames (`blender/out/`, about 900MB) are not committed. Re-render them with the commands in
`blender/README.md`.

## Conventions worth knowing

- **Rem scales with the viewport.** `1rem` is about 10px at 1440 and shrinks with the window, so
  sizes are written in rem and the whole layout scales. Breakpoints: `≤1023px` is phone + tablet,
  `600–1023px` adds tablet refinements.
- **The grid.** `.the-grid` is a 12-column grid that centres itself; `.the-container` is optional.
  Modules position themselves with `grid-column`.
- **Headings split into lines.** Anything with `data-split` is measured and rebuilt as masked lines
  for the reveal animation; a `<br>` always forces a break. Re-splits on font load and on resize.
- **The nav is cloned per section.** Each section carries a `.nav-slot`; `main.js` clones the nav
  template into it so the bar re-themes at section edges. Section word counts include those clones.
- **Density.** Each page is built to sit within about 90–105% of the corresponding reference page's
  height and word count at 1440px, so the site reads at the same weight throughout.
