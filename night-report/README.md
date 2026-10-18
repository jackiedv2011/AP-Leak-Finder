# Night report: 2026-09-24

Branch `reclaim-night-2026-09-24`, local only. Nothing has been pushed.

## Commits (oldest first)

| Commit | What |
|---|---|
| 10cbf8e | Checkpoint: split login/signup, hover states that no longer move the text, the earlier ledger 3D pass |
| 821443d | Merge of origin/main (the Reclaim dashboard and recovery workflow). The login and signup pages were kept. |
| 80e6cc9 | Forgot password, reset and verify email moved onto the split account layout (`src/pages/AuthSplit.tsx`) |
| f11a308 | The upload flow now has the dashboard's look. It was rendering outside `PreferencesProvider`, which is why it looked old. |
| 66327b2 | Landing copy and sections checked against `plans/RECLAIM_V2_PRODUCT_AND_PRICING_SPEC.md`, plus the laptop mockup |
| 1154aa1 | The 404 page uses the split account layout |
| cc70451 | Blender exploration scripts (`landing-site/blender/explore/`) |

## What changed

**Account pages**
- Login, signup, forgot password, reset, verify and 404 all share one shell:
  - the 3D loop on white (60%) on the left, the black rounded panel (40%) on the right
  - a large condensed title
  - the same fade in and fade out as the site
- Safari gets a baked-white MP4, because it can't show the WebM's transparency.

**Upload flow** (`Launch.tsx`, `ImportPanel`, `ImportDialog`, `LegacyImportDialog`, `OnboardingTour`)
- Rebuilt in the dashboard's design system (`reclaim.css` tokens, Geist), with light and dark themes.

**Landing site accuracy** (against the V2 spec)
- The site now says you connect QuickBooks Online or Xero read-only, or upload a CSV.
- Follow-ups are described as happening only after your approval.
- The security page was rewritten.
- How It Works now goes Connect → Find → Evidence → Recover.
- Pricing:
  - Removed the $99/$249/$599/$199 plans, the Autopilot percentage and the tier limits, because no decision in the repo supports them.
  - The cards now show the V2.0, 2.1 and 2.2 stages, marked "no price yet", with a Talk to Us button.
  - **This needs your review.**
- What It Checks: removed the multi-entity and early-discount cards.
- The laptop mockup now shows the real dashboard Overview.

**Hover states**
- Across the whole landing site, labels and icons no longer move on hover; only the colour changes.
- The integration-tile tilt and the example-card lean were also removed.

## Screenshots

- `night-report/before/` shows how things looked before; `night-report/after/` shows them now.
- In `after/`:
  - `auth-login`, `auth-signup`, `auth-*` for the other account pages, plus mobile versions
  - `launch-*` (light, dark, mobile, tour)
  - `upload-dialog-*`
  - `workspace-start-audit-dialog-*`
  - `site-*` (full pages)
  - `crop-home-laptop*`
- `night-report/section-map.md` lists every 3D slot on the site, with its size and background.

## 3D exploration

- **Board:** `landing-site/blender/out/explore/board.html`. It has the ranked directions, the scene count and the motion tests.
- **Renders:** in each `out/explore/<direction>/` folder:
  - `rest.png`, `key.png`, `detail.png`
  - `sizes.png`: shown at 317, 425 and 1015 px on grey, white and black
  - `locked.mp4` and `move.mp4`: fixed camera and moving camera
  - `*_x2.mp4`: the loop played twice
  - `locked_black.mp4` and `locked_white.mp4`
  - `film_*.png`: film strips
  - `seam_*.txt`: the loop-seam check
  - `notes.md`
- **Killed directions:** `out/explore/killed/`, each with the reason.
- All renders are exploratory (stills at 960px, motion at 480px). There are no production renders.
- 16 directions were tried, 10 killed and 6 put through every test. All six loop without a visible seam.

### My ranking (it differs slightly from the agent's)

1. **D15 Align.** Scattered pieces at different depths line up into the Reclaim hexagon from one angle, and the last green piece flies home.
   - It's a behaviour (order that was already there, found from the right angle), not a paper texture.
   - It reads without explanation and holds up at 317px on black.
   - It's the only direction that could carry every slot as one family.
   - Risks:
     - It can feel like a logo sting in the hero. There's a `shape=ring` variant without the logo.
     - The black segment disappears on black backgrounds (see `sizes.png`); it would need a lighter grey there.
2. **D09 Sort.** A cloud of cubes settles into colour layers; the pink misfit is found and its slot turns green.
   - It's the most legible direction with no explanation needed, and it follows naturally from the current cube hero.
   - It's less distinctive: it reads as a Rubik's cube at rest. It's best as the Find scene inside the Align family, not as the whole system.
3. **D01b Seam.** A plain block opens along a slanted seam onto a lit interior with a green core.
   - It's the cleanest single gesture on the black homepage cards.
   - It's too small an idea for a 1015px hero, and it risks looking like a loot box.

Below the top three:
- **D06b Kinetic** (a wall of turning panels where two twins turn in step): the idea is honest, but I found it visually noisy. The twin pair doesn't read without being told.
- **D05 Basin** (a terrain with pools, where pink drains into green): a nice diorama, but the purple palette is off-brand and it doesn't extend to several scenes.
- **D10 Comb** (tangled strands combed straight): it only works for Connect.

### Scene count

Six scenes in the Align language cover the 8 slots in the section map:
- the hero (also on the login pages, on white)
- Connect
- Find (sketched and it works)
- Evidence (shared with the homepage Proof card)
- Recover (shared with the homepage Real money card)
- Control

The two shared scenes each need a white and a black version. This fixes a current problem: one file, `recover.webm`, is used for three sections that mean different things. **This isn't locked in.** It's a recommendation for you to choose from.

## Tests and typecheck

- `tsc`: clean.
- `vitest run --dir src`: 29 of 30 files pass, and all 325 tests pass.
  - `src/accountFlow.test.tsx` fails to load with "Cannot bundle Node.js built-in node:sqlite".
  - Its test setup is byte-identical to origin/main, so the failure is already on main and wasn't introduced tonight.
- `--dir src` is needed because the untracked `.preview-pre-v2/` folder otherwise gets picked up as tests.

## Unresolved or failed

- **Pricing page:** it now shows stages with no prices. It needs your call on what V2 pricing to show publicly.
- **Landing agent's flags:**
  - The Stripe logo in the tools grid isn't backed by the spec.
  - The spec says QBO ships first and Xero second, but the site presents them together.
  - The line "never asks for your bank password" is undecided.
  - `BEFORE-DEPLOY.md` and the landing README are stale.
  - What It Checks has some missing `div`s that were already there before tonight.
- **3D:**
  - The Evidence sketch isn't convincing yet: at the key angle the near piece just hides the far one.
  - Connect, Recover and Control are described on the board but not rendered.
  - Basin has jagged terrace steps and flat liquid.
  - `looklib.setup_render` uses the OIDN denoiser, not OptiX; the exploration helper switches it.
- **Dead code left in place:**
  - `vercel.css` is no longer imported.
  - `TutorialTour.tsx` and `tutorial.css` are unused.
  - `.wk-drift` CSS and the `public/art` images are unused.
- **Workspace:** the theme icon doesn't update when the OS theme changes.
- **Browser pane:** during testing the onboarding tour was closed once, so it's marked as seen for that browser session only.
- **Untracked and left alone:** `.preview-pre-v2/`, `experiments/`, `night-report/`.
