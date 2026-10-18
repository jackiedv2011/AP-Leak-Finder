# Where 3D video appears on the marketing site (after the 2026-09-24 copy pass)

Source: `grep data-reel` across `landing-site/src`. Eight `<video data-reel>` slots on two pages, fed by
four renders (`media/hero`, `find`, `build`, `recover`; each a transparent VP9 `.webm` with an H.264
`.mp4` twin that `reels.js` swaps in on Safari). `media/hero-white.mp4` and `media/stills/*.webp` are not
referenced by any page (the stills are used by the React workspace, `src/workspace/objects.ts`).

Sizes are the rendered box at a 1440px-wide viewport (1rem = 10px, grid column ≈ 85px, gutter 24px).
All boxes are square and the video is `object-fit: contain`, so the render's own framing decides how
much of the box the object fills.

| # | Page · section (anchor) | File | What the section now says | Box at 1440 | Behind it |
|---|---|---|---|---|---|
| 1 | Home · hero (`.hero-home`) | `hero.webm` | "Find money your business should still have." Connect your books or upload an export; Reclaim finds duplicate payments, overpayments, unused credits and bills paid twice, shows the evidence, and helps recover the money. The whole product in one image: money that left, found and brought back. | ≈ 845px square (8 columns), scaled 1.2× to **≈ 1015px**, shifted right by 2 columns, so it sits right of the headline and runs off the right edge; bottom fades out from 80% (mask). Section is 1440×800, clipped. | Grey **#e5e5e5** |
| 2 | Home · "You approve what goes out." card 1, **Proof** (`.entry-solution`) | `find.webm` | See the evidence behind every finding, and review every claim before it is pursued. | **≈ 317px** square, nudged 20% left inside its card | Black **#000** |
| 3 | Home · same row, card 2, **Control** | `build.webm` | Approve each recovery before the first vendor email goes out, see every step after it; Reclaim never accuses a vendor of fraud or threatens legal action. | **≈ 317px** | Black |
| 4 | Home · same row, card 3, **Real money** | `recover.webm` | A promised refund is not counted as recovered; it counts only once it actually arrives. | **≈ 317px** | Black |
| 5 | How It Works · **Connect** (`#upload`) | `build.webm` | Connect QuickBooks Online or Xero read-only (revocable), or upload exports; Reclaim lines bills, payments, vendors and credits up against each other. | 3 columns ≈ 302px, scaled 1.4× to **≈ 425px**, right of the text. Desktop only (hidden ≤1023px). | White **#fff** |
| 6 | How It Works · **Find** (`#find`) | `find.webm` | A short list of findings, not a long list of maybes: duplicate payments, duplicate bills, overpayments, unused credits, mismatches. | **≈ 425px**, desktop only | White |
| 7 | How It Works · **Evidence** (`#evidence`) | `recover.webm` | Proof behind every finding: the bill, the payments, the matching details, each record traced to its source; you decide. | **≈ 425px**, desktop only | White |
| 8 | How It Works · **Recover** (`#recover`, new tonight) | `recover.webm` | Nothing goes to a vendor until you approve; then Reclaim sends the request, tracks replies, follows up, and only counts money once the refund or applied credit shows up in your books. | **≈ 425px**, desktop only | White |

## One video serving sections that mean different things

- **`recover.webm`** is used three times: Home "Real money" (a promise isn't money until it arrives),
  How It Works **Evidence** (checking the records behind a finding) and How It Works **Recover** (approval,
  outreach, follow-up, money back). Evidence is the clear mismatch: it needs a "proof / records side by
  side" render of its own. I added the Recover section tonight and gave it `recover.webm` because the
  name fits; Evidence kept the same file it already had.
- **`find.webm`** plays for Home **Proof** (evidence you can check) and How It Works **Find** (detecting
  mistakes). Detection and proof are different ideas; Proof is closer to what the Evidence section needs.
- **`build.webm`** plays for Home **Control** (you approve, every step visible) and How It Works
  **Connect** (bringing your records in). Those are unrelated ideas that share one object.
- The hero is the only render used once.

## If each section got its own render (suggested subjects, not decided)

1. Hero: money that left, found and returned. Big, calm, reads at ≈1000px on grey.
2. Connect: records flowing in from a connected system, read-only. On white, ≈425px.
3. Find: many records narrowing to a few findings. On white, ≈425px.
4. Evidence / Proof: two matching records side by side, the matching fields lit. Works at ≈425px on white
   *and* ≈317px on black if it is reused for the Home Proof card.
5. Recover: request out, reply back, money returned. On white, ≈425px.
6. Control (Home card): an approval gate: nothing passes until it is approved. On black, ≈317px.
7. Real money (Home card): a promise that becomes money only when it settles. On black, ≈317px.

Each Home card needs to read as one simple object at ≈317px on black. The How It Works renders sit
at ≈425px on white next to a paragraph, with a light dashboard screenshot below them, so a colourful
or busy render will compete with the screenshot.
