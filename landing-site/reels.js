/* Pre-rendered 3D loops (Blender / Cycles, VP9 WebM with alpha).
   Each <video data-reel> plays only while it is on screen.
   Safari plays WebM but drops its alpha channel, so it gets the .mp4 twin,
   which has the section's flat background baked in. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const reels = [...document.querySelectorAll('video[data-reel]')];
  const safari = /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
  const sync = v => (v.inView && !reduce.matches ? v.play().catch(() => {}) : v.pause());

  const io = new IntersectionObserver(entries => {
    for (const e of entries) { e.target.inView = e.isIntersecting; sync(e.target); }
  }, { rootMargin: '120px' });

  for (const v of reels) {
    const webm = /\.webm$/.test(v.getAttribute('src') || '');   // (the hero is MP4 already, from <source>s)
    if (safari && webm) {
      v.src = v.getAttribute('src').replace(/\.webm$/, '.mp4');
      v.dataset.baked = 'dark';   // the twins are baked over black; styles.css blends that away
    }
    v.muted = true;
    v.playsInline = true;
    io.observe(v);
  }
  reduce.addEventListener?.('change', () => reels.forEach(sync));
})();
