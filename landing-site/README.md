# Reclaim landing page (static)

The new marketing site, built as plain HTML/CSS/JS (GSAP + ScrollTrigger, Lenis and Swiper load from CDNs).
It is not wired into the React app yet: `/` still renders `src/components/site/SiteLanding.tsx`.

Preview it on its own, then open http://localhost:5510:

```bash
node landing-site/serve.cjs
```

| path | what |
|---|---|
| `index.html`, `styles.css`, `main.js` | the page, its styles, and its motion/interaction layer (nav, mobile menu, carousels, logo, tiles) |
| `reels.js` | plays the 3D loops while they are on screen; swaps WebM for MP4 on Safari |
| `media/` | the 3D loops: transparent VP9 WebM plus H.264 MP4 fallbacks |
| `assets/` | carousel images |
| `blender/` | scripts that render and encode the 3D loops (see `blender/README.md`) |
| `serve.cjs` | dependency-free static server with byte-range support for the videos |

Render frames (`blender/out/`, about 900MB) are not committed. Re-render them with the commands in `blender/README.md`.
