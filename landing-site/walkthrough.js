/* Reclaim — the home page walkthrough ("See the money and the proof").
   The laptop is a rendered frame sequence (blender/macbook.py, encoded by blender/macbook_encode.py
   into /media/macbook/: d/ desktop frames, m/ phone frames, still.webp and still-m.webp for the open
   pose, corners.json with the screen's four corners in every frame). The frames are baked onto the
   section's ink. The dashboard (.wt-screen) is live HTML mapped onto those corners with a homography,
   so it sits on the glass through the opening and stays sharp when the view zooms in.
   The lid opening is scrubbed by the scroll; then the walkthrough moves in whole steps, one per scroll gesture:
   five steps (each caption names the screen to show and what to frame), then the close, the view pulled back to
   the whole open laptop over its line and the call to action. Each move is a tween from what is on show straight
   to the step asked for, so the step bar's jumps are one clean move. A Skip button comes up as the section reaches
   the screen, before the steps take the scroll, and carries the page clear past the laptop, the way it was heading.
   Registered as a page module: main.js runs it with its shared helpers. */
(window.reclaimModules = window.reclaimModules || []).push(({ $, $$, gsap, ScrollTrigger, lenis, rem, calm, docTop }) => {
  const sec = $('[data-walkthrough]');
  if (!sec) return;
  const pin = $('.wt-pin', sec), head = $('.wt-head', sec), outro = $('.wt-outro', sec);
  const stage = $('.wt-stage', sec), canvas = $('.wt-frames', sec), still = $('.wt-still', sec);
  const screen = $('.wt-screen', sec), spot = $('.wt-spot', sec);
  const shots = $$('.wt-shot', sec), caps = $$('.wt-cap', sec);
  const pill = $('.wt-pill', sec), pills = $$('button', pill), end = $('.wt-end', sec);
  const phone = matchMedia('(max-width: 1023px)').matches;   // picked once: the frame set does not swap on resize
  const dir = '/media/macbook/', set = phone ? 'm/' : 'd/';
  const stillUrl = dir + (phone ? 'still-m' : 'still') + '.webp';
  const pad = i => String(i).padStart(3, '0');

  // ---------- mapping a w x h box onto a quad (TL, TR, BR, BL, in px) ----------
  const homography = (w, h, q) => {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1;
    const g = (dx3 * dy2 - dx2 * dy3) / den, k = (dx1 * dy3 - dx3 * dy1) / den;
    return { w, h, g, k, a: x1 - x0 + g * x1, b: x3 - x0 + k * x3, c: x0, d: y1 - y0 + g * y1, e: y3 - y0 + k * y3, f: y0 };
  };
  const matrix = ({ w, h, a, b, c, d, e, f, g, k }) => `matrix3d(${a / w},${d / w},0,${g / w},${b / h},${e / h},0,${k / h},0,0,1,0,${c},${f},0,1)`;
  const project = ({ w, h, a, b, c, d, e, f, g, k }, u, v) => {
    const un = u / w, vn = v / h, z = g * un + k * vn + 1;
    return [(a * un + b * vn + c) / z, (d * un + e * vn + f) / z];
  };

  let corners = null, N = 0;   // corners.json: normalised screen corners per frame
  let sw = 0, sh = 0;          // stage size, px
  const quad = (i, j = i, t = 0) => corners[i].map(([x, y], n) => [(x + (corners[j][n][0] - x) * t) * sw, (y + (corners[j][n][1] - y) * t) * sh]);
  // the still is taller than a frame (it takes in the deck, which the frames crop): it is laid on the stage by
  // its own screen corners, matched to the last frame's, and runs on below the stage by `deck` px
  let stillC = null, deck = 0;
  const placeStill = () => {
    if (!stillC || !N) return;
    const fq = corners[N - 1], sq = stillC.corners;
    const w = sw * (fq[1][0] - fq[0][0]) / (sq[1][0] - sq[0][0]), h = w * stillC.h / stillC.w;
    const x = fq[0][0] * sw - sq[0][0] * w, y = fq[0][1] * sh - sq[0][1] * h;
    Object.assign(still.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    deck = Math.max(0, y + h - sh);
  };
  const mapScreen = q => {
    screen.style.transform = matrix(homography(screen.offsetWidth, screen.offsetHeight, q));
    screen.classList.add('is-mapped');
  };

  let settledNow = null;
  const setSettled = on => { if (on !== settledNow) shots.forEach(s => s.classList.toggle('is-settled', on)); settledNow = on; };

  // the layout box of the data-f names inside a screen (their union), before any transform
  const offset = el => { let x = 0, y = 0; for (let n = el; n && n !== screen; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; } return [x, y]; };
  const measure = cap => {
    const shot = shots.find(s => s.dataset.shot === cap.dataset.shot);
    const was = shot.classList.contains('is-settled');
    shot.classList.toggle('is-settled', cap.hasAttribute('data-settled'));   // the settled rows only lay out in that state
    const names = ((phone && cap.dataset.focusM) || cap.dataset.focus).split(' ');
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    names.forEach(n => {
      const el = $(`[data-f="${n}"]`, shot);
      if (!el) return;
      const [x, y] = offset(el);
      l = Math.min(l, x); t = Math.min(t, y); r = Math.max(r, x + el.offsetWidth); b = Math.max(b, y + el.offsetHeight);
    });
    shot.classList.toggle('is-settled', was);
    const p = rem() * 1.2;
    return { x: l - p, y: t - p, w: r - l + p * 2, h: b - t + p * 2 };
  };

  if (calm) {
    // reduced motion: the open laptop, the case on its screen, the steps listed under it
    $('.wt-shot[data-shot="finding"]', sec).classList.add('is-on');
    still.src = stillUrl;
    const fit = () => { if (!corners) return; sw = stage.offsetWidth; sh = stage.offsetHeight; mapScreen(quad(N - 1)); placeStill(); stage.style.marginBottom = deck + 'px'; };
    fetch(dir + 'corners.json').then(r => r.json()).then(j => { corners = j.frames; N = corners.length; stillC = j.still || null; fit(); }).catch(() => {});
    addEventListener('resize', fit);
    return;
  }

  // ---------- frames ----------
  // Decoding is the expensive part: a whole sequence decoded holds hundreds of MB, which a laptop evicts
  // and re-decodes mid-scroll. So every file is fetched up front and kept compressed (they are small), and
  // only a window around the playhead is decoded, off the main thread, ahead of the direction of travel.
  const WIN = 10;
  const blobs = [], bitmaps = new Map(), pending = new Set();
  const ctx = canvas.getContext('2d', { alpha: false });
  let f = 0, heading = 1, drawn = '';
  const ink = () => getComputedStyle(sec).backgroundColor;
  const decode = () => {
    const c = Math.round(f);
    for (const [i, bm] of bitmaps) if (Math.abs(i - c) > WIN + 3) { bm.close(); bitmaps.delete(i); }
    for (let d = 0; d <= WIN && pending.size < 3; d++) {
      for (const i of [c + d * heading, c - d * heading]) {
        if (i < 0 || i >= N || !blobs[i] || bitmaps.has(i) || pending.has(i) || pending.size >= 3) continue;
        pending.add(i);
        createImageBitmap(blobs[i]).then(bm => {
          pending.delete(i);
          if (Math.abs(i - Math.round(f)) > WIN + 3) bm.close(); else { bitmaps.set(i, bm); draw(); }
          decode();
        }, () => pending.delete(i));
      }
    }
  };
  // the two frames either side of the playhead, the later one laid over the earlier by the fraction between
  // them: the lid moves continuously with the scroll instead of stepping from frame to frame
  const draw = () => {
    if (!N) return;
    const i0 = Math.min(N - 1, Math.floor(f)), i1 = Math.min(N - 1, i0 + 1), t = f - i0;
    let a = bitmaps.get(i0), b = bitmaps.get(i1), ia = i0, ib = i1, mix = t;
    if (!a || !b) {   // not decoded yet: the nearest frame that is
      mix = 0; a = null;
      for (let d = 0; d < N && !a; d++) for (const i of [Math.round(f) - d, Math.round(f) + d]) if (!a && bitmaps.get(i)) { a = bitmaps.get(i); ia = ib = i; }
      if (!a) return;
    }
    if (mix < .02) { b = null; ib = ia; } else if (mix > .98) { a = b; ia = ib; b = null; mix = 0; }
    const key = ia + ':' + ib + ':' + mix.toFixed(2);
    if (key === drawn) return;
    if (canvas.width !== a.width) { canvas.width = a.width; canvas.height = a.height; ctx.fillStyle = ink(); }
    ctx.globalAlpha = 1;
    ctx.fillRect(0, 0, canvas.width, canvas.height);   // frames are opaque, but a see-through one must not leave trails
    ctx.drawImage(a, 0, 0);
    if (b) { ctx.globalAlpha = mix; ctx.drawImage(b, 0, 0); }
    mapScreen(quad(ia, ib, b ? mix : 0));   // the screen follows the picture actually on show
    drawn = key;
    sec.classList.toggle('is-open', ia === N - 1 && !b);   // the large still takes over from here (CSS)
  };
  let fetching = false;
  const load = () => {
    if (fetching || !N) return;
    fetching = true;
    let next = 0, busy = 0;
    const pump = () => {
      while (busy < 6 && next < N) {
        const i = next++;
        busy++;
        fetch(dir + set + pad(i) + '.webp').then(r => (r.ok ? r.blob() : null)).then(bl => { if (bl) { blobs[i] = bl; decode(); } }, () => {})
          .finally(() => { busy--; pump(); if (!busy && next >= N) loadStill(); });
      }
    };
    pump();
  };
  // decoded before it is needed, and composited while still invisible, so the swap to it costs nothing
  const loadStill = () => {
    const img = new Image();
    img.src = stillUrl;
    img.decode().then(() => { still.src = img.src; canvas.classList.add('has-still'); }, () => {});
  };
  // paint the canvas in the page's ink until the first frame lands (an opaque canvas starts black)
  canvas.width = 16; canvas.height = 9; ctx.fillStyle = ink(); ctx.fillRect(0, 0, 16, 9);
  // fetched once the section is a screen and a half away (or as soon as the corners are in, if it already is):
  // never with the page's first load, where the hero has the line to itself, and still well ahead of the scroll
  let near = false;
  new IntersectionObserver((es, io) => { if (es.some(e => e.isIntersecting)) { near = true; load(); io.disconnect(); } }, { rootMargin: '150% 0px' }).observe(sec);

  // ---------- layout: stage size, the resting view (where the lid opens, and shuts again at the close), a view per step ----------
  const base = { x: 0, y: 0, s: 1 };
  const views = caps.map(() => ({ x: 0, y: 0, s: 1 })), spots = caps.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
  const layout = () => {
    const vw = pin.clientWidth, vh = pin.clientHeight, r = rem();
    sw = phone ? vw * 1.3 : Math.min(vw, vh * 16 / 9);
    sh = sw * 9 / 16;
    sec.style.setProperty('--wt-sw', sw + 'px');
    sec.style.setProperty('--wt-sh', sh + 'px');
    const headBottom = head.offsetTop + head.offsetHeight;
    Object.assign(base, { x: (vw - sw) / 2, y: Math.max((vh - sh) / 2, headBottom + r * 3.2 - sh * .5), s: 1 });   // the closed lid sits under the heading
    if (!N) return;
    placeStill();
    const H = homography(screen.offsetWidth, screen.offsetHeight, quad(N - 1));
    const top = r * 10, bottom = pill.offsetTop - r * 2.4, gap = r * 4;
    caps.forEach((cap, i) => {
      const box = measure(cap);
      spots[i] = box;
      const pts = [[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h]].map(([u, v]) => project(H, u, v));
      const bx = Math.min(...pts.map(p => p[0])), by = Math.min(...pts.map(p => p[1]));
      const bw = Math.max(...pts.map(p => p[0])) - bx, bh = Math.max(...pts.map(p => p[1])) - by;
      let L = r * 4, R = vw - r * 4, T = top, B = bottom;
      if (phone) { L = r * 2.4; R = vw - r * 2.4; T = r * 10.6; B = cap.offsetTop - r * 2.4; }
      else if (cap.dataset.side === 'left') L = cap.offsetLeft + cap.offsetWidth + gap;
      else R = cap.offsetLeft - gap;
      const s = Math.max(1, Math.min((R - L) / bw, (B - T) / bh, phone ? 6 : 2.6));
      views[i] = { x: (L + R) / 2 - (bx + bw / 2) * s, y: (T + B) / 2 - (by + bh / 2) * s, s };
    });
    drawn = ''; spotKey = '';
  };

  // ---------- writing to the page: only what changed ----------
  // While the view moves, the stage and the screen are their own layers (will-change), so a zoom scales
  // pictures already drawn instead of redrawing the dashboard every frame; a moment after it stops they
  // drop back, and the browser draws them once, sharp, at the final size.
  let rest;
  const moving = () => {
    if (!stage.style.willChange) stage.style.willChange = screen.style.willChange = 'transform';
    clearTimeout(rest);
    rest = setTimeout(() => { stage.style.willChange = screen.style.willChange = ''; }, 200);
  };
  const css = (el, prop, v) => { if (el.style[prop] !== v) { el.style[prop] = v; return true; } return false; };
  // the spotlight: a veil over the screen with a rounded hole cut in it (clip-path), so moving it or
  // fading it never repaints the dashboard underneath
  let spotKey = '';
  const placeSpot = ({ x, y, w, h }) => {
    const key = [x, y, w, h].map(Math.round).join();
    if (key === spotKey) return;
    spotKey = key;
    const W = screen.offsetWidth, H = screen.offsetHeight, r = Math.min(rem() * 1.6, w / 2, h / 2);
    spot.style.clipPath = `path(evenodd, "M0 0H${W}V${H}H0Z M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z")`;
  };

  // ---------- the scroll: the lid opening is scrubbed; after it, the walkthrough moves in steps ----------
  // Positions in screens of scroll from the section's top: the lid opens over OPEN; step k (1-5) sits at
  // OPEN + k * STEP; the close (6: back to the resting view, the screen going dark and the lid shutting, as it
  // was before it opened, then the line and the call to action) one step on; the pin lets go HOLD later.
  // A step is taken whole: one scroll gesture starts it, it runs MOVE seconds and rests, never halfway.
  // Every move is a direct tween from what is on show to the step asked for, so a jump of four steps (a pill)
  // is one move, not the four in between played fast.
  const OPEN = 1, STEP = .5, HOLD = .5, MOVE = .8, SHUT = 1.4, CLOSE = 6;   // SHUT: seconds the lid takes to close
  const P = k => (k <= 0 ? OPEN : OPEN + Math.min(k, CLOSE) * STEP);
  const LEN = P(CLOSE) + HOLD;
  // (measured from layout offsets, docTop: the rounded section around this one is scaled while it arrives, and a
  // measured box would put every position off by that much)
  const unit = () => pin.clientHeight || innerHeight;
  const posY = k => docTop(sec) + P(k) * unit();
  const pos = () => (scrollY - docTop(sec)) / unit();

  const cam = { ...base }, sp = { i: -1, a: 0 }, lid = { f: 1, glow: 1 };   // lid: how far open (of the scrolled opening), and the screen's light
  let at = 0, busy = false, trans = null;
  const viewOf = k => (k >= 1 && k <= 5 ? views[k - 1] : base);
  const shotOf = k => (k >= 1 && k <= 5 ? caps[k - 1].dataset.shot : k === CLOSE ? 'recovery' : 'overview');
  const settledOf = k => (k >= 1 && k <= 5 ? caps[k - 1].hasAttribute('data-settled') : k === CLOSE);

  // the opening, straight from the scroll: the lid, the heading lifting away, the screen waking as it settles
  // (the close shuts the lid again through lid)
  const ease = gsap.parseEase('power1.in');
  const renderOpen = () => {
    const p = Math.min(1, Math.max(0, pos() / OPEN));
    const nf = p * lid.f * Math.max(N - 1, 0);
    if (nf !== f) { heading = nf > f ? 1 : -1; f = nf; decode(); }
    draw();
    // the still comes up over the last frames, as the lid settles, so the deck below them fades in, not pops
    if (still.src) css(still, 'opacity', Math.min(1, Math.max(0, (f - N + 9) / 8)).toFixed(3));
    const h = ease(Math.min(1, Math.max(0, (p - .3) / .35)));
    css(head, 'opacity', String(1 - h)); css(head, 'visibility', h < 1 ? 'visible' : 'hidden');
    css(head, 'transform', `translateY(${-h * rem() * 4}px)`);
    css(screen, 'opacity', Math.min(1, Math.max(0, (p - .72) / .25), lid.glow).toFixed(3));
  };
  // the camera and the spotlight, every frame they move
  const renderView = () => {
    if (css(stage, 'transform', `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`)) moving();
    css(spot, 'opacity', String(sp.a));
    if (sp.i >= 0) placeSpot(spots[sp.i]);
  };

  // the screen asked for comes up and every other one goes (an interrupted move can leave two half shown);
  // a touch of blur through the swap, so the two screens read as one changing rather than two overlapping
  const BLUR = d => (d ? 'blur(2px)' : 'none');
  const showShot = (name, tl, t, d) => {
    shots.forEach(s => {
      const o = +gsap.getProperty(s, 'opacity');
      if (s.dataset.shot === name) { if (o < 1) tl.set(s, { visibility: 'visible' }, t).fromTo(s, { filter: BLUR(d) }, { opacity: 1, filter: 'blur(0px)', duration: d, clearProps: 'filter' }, t); }
      else if (o > 0) tl.to(s, { opacity: 0, filter: BLUR(d), duration: d }, t).set(s, { visibility: 'hidden', filter: 'none' }, t + d);
    });
  };
  // from what is on show to step k, in d seconds (0: at once)
  const render = () => { renderView(); renderOpen(); };
  const apply = (k, d) => {
    trans?.kill();
    const tl = trans = gsap.timeline({ defaults: { ease: 'power2.inOut' }, onUpdate: render, onComplete: render });
    const v = viewOf(k), quick = d === 0;
    tl.to(cam, { x: v.x, y: v.y, s: v.s, duration: k === CLOSE ? d * 1.2 : d }, 0);
    // the screen changes once, halfway, across a short fade; "settled" is a layout of the recovery screen
    showShot(shotOf(k), tl, d * .35, quick ? 0 : d * .3);
    tl.call(() => setSettled(settledOf(k)), null, d * .5);
    // the spotlight leaves, moves with the screen, and comes back on the new spot
    tl.to(sp, { a: 0, duration: quick ? 0 : d * .3 }, 0);
    tl.set(sp, { i: k >= 1 && k <= 5 ? k - 1 : -1 }, d * .5);
    if (k >= 1 && k <= 5) tl.to(sp, { a: 1, duration: quick ? 0 : d * .35 }, d * .65);
    // the words: the old caption out at once, the new one in as the view lands
    caps.forEach((c, i) => {
      if (i === k - 1) tl.fromTo(c, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: quick ? 0 : .4, ease: 'power4.out' }, d * .6);
      else if (+gsap.getProperty(c, 'opacity') > 0) tl.to(c, { autoAlpha: 0, y: -16, duration: quick ? 0 : .2, ease: 'power1.in' }, 0);
    });
    // the step bar rises in with the steps and sinks away after them
    const bar = k >= 1 && k <= 5;
    tl.to(pill, { autoAlpha: bar ? 1 : 0, y: bar ? 0 : rem() * .8, duration: quick ? 0 : .3, ease: bar ? 'power4.out' : 'power1.in' }, bar ? d * .4 : 0);
    // the close: as the view pulls back the screen goes dark and the lid shuts; the line rises in where the
    // heading was, then the call to action. Leaving it, the lid opens again as the view moves in
    const t = quick ? () => 0 : x => x;
    if (k === CLOSE) {
      tl.to(lid, { glow: 0, duration: t(SHUT * .2), ease: 'none' }, d * .6);
      tl.to(lid, { f: 0, duration: t(SHUT), ease: 'power1.inOut' }, d * .6);
      tl.fromTo(outro, { autoAlpha: 0, y: rem() * 4 }, { autoAlpha: 1, y: 0, duration: t(SHUT * .35), ease: 'power4.out' }, d * .6 + t(SHUT * .55));
      tl.fromTo(end, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: t(.35), ease: 'power4.out' }, d * .6 + t(SHUT * .75));
    } else {
      tl.to(lid, { f: 1, duration: d * .8, ease: 'power1.inOut' }, 0);
      tl.to(lid, { glow: 1, duration: d * .3, ease: 'none' }, d * .6);
      [outro, end].forEach(el => { if (+gsap.getProperty(el, 'opacity') > 0) tl.to(el, { autoAlpha: 0, duration: t(.25), ease: 'none' }, 0); });
    }
    pills.forEach((b, n) => {
      b.classList.toggle('is-current', n === k - 1);
      b.classList.toggle('is-done', n < k - 1);
      b.toggleAttribute('aria-current', n === k - 1);
    });
    if (quick) tl.progress(1);
  };

  // between the first step and the last the page is held (Lenis stopped; wheel, touch and keys caught): each fresh
  // gesture is one step. Fresh, because a swipe keeps sending wheel events for a second or more after the hand
  // leaves the trackpad: only one that starts after a pause counts, so a flick is one step, not three
  const KEYS = new Set([' ', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End']);
  let held = false, lastWheel = 0, touchY = null, touchUsed = false;
  const hold = ev => {
    if (ev.type === 'touchstart') { touchY = ev.touches[0].clientY; touchUsed = false; return; }
    if (ev.type === 'keydown' && (!KEYS.has(ev.key) || ev.target === skipper)) return;
    ev.preventDefault();
    const now = performance.now();
    let way = 0;
    if (ev.type === 'wheel') {
      if (now - lastWheel > 160 && Math.abs(ev.deltaY) > 2) way = Math.sign(ev.deltaY);
      lastWheel = now;
    } else if (ev.type === 'keydown') {
      if (ev.key === 'End') return go(CLOSE);
      if (ev.key === 'Home') return go(0);
      way = ['ArrowUp', 'PageUp'].includes(ev.key) || (ev.key === ' ' && ev.shiftKey) ? -1 : 1;
    } else if (touchY !== null && !touchUsed) {
      const dy = touchY - ev.touches[0].clientY;
      if (Math.abs(dy) > 36) { way = Math.sign(dy); touchUsed = true; }
    }
    if (!way || busy) return;
    // past either end of the steps a fresh gesture is the page's own again: let it go, this gesture included
    if ((at === CLOSE && way > 0) || (at === 0 && way < 0)) return holdOn(false);
    go(at + way);
  };
  const holdOn = on => {
    if (on === held) return;
    held = on;
    const fn = on ? addEventListener : removeEventListener;
    ['wheel', 'touchmove', 'keydown'].forEach(t => fn(t, hold, { passive: false, capture: true }));
    fn('touchstart', hold, { passive: true, capture: true });
    on ? lenis.stop() : lenis.start();
  };

  // a step: the view moves, and the page scrolls to the step's place underneath (pinned, so that is unseen)
  const go = k => {
    k = Math.max(0, Math.min(CLOSE, k));
    if (k === at && !busy) return;
    at = k;
    busy = true;
    if (k >= 1 && k <= 5) holdOn(true);
    apply(k, MOVE);
    lenis.scrollTo(posY(k), { duration: MOVE, lock: true, force: true, onComplete: () => { busy = false; release(); } });
  };
  // leaving the steps (to the open laptop, or to the close) the page stays held until the gesture that took it
  // there has died away, so a flick's momentum lands on the close and rests, not scrolling on past it
  const release = () => {
    if (at >= 1 && at <= 5 || !held) return;
    const quiet = performance.now() - lastWheel;
    if (quiet > 160) holdOn(false); else setTimeout(release, 170 - quiet);
  };
  // landed somewhere without stepping (a reload, the scrollbar, an anchor): show that step as it is
  const jump = k => { at = k; holdOn(k >= 1 && k <= 5); apply(k, 0); };

  // ---------- the step bar: each step a jump to it ----------
  pills.forEach((b, i) => b.addEventListener('click', () => go(i + 1)));

  // ---------- Skip: past the whole laptop, without stepping through it ----------
  // Up from the moment the section starts to come on screen (from above or below), so it can be taken before the
  // steps hold the scroll; kept up through them. It points the way the page was heading when it appeared: arriving
  // from above it carries on to what follows, arriving from below it goes back to what came before. The
  // walkthrough is set to the end it is being left by, so coming back to it later starts from that side.
  const skipper = document.createElement('button');
  skipper.type = 'button';
  skipper.className = 'wt-skipper';
  skipper.innerHTML = '<span>Skip<span class="wt-skipper-long"> the walkthrough</span></span><svg aria-hidden="true"><use href="#i-arrow"/></svg>';
  document.body.append(skipper);
  let skipWay = 0, skipping = false;   // skipWay: 1 down, -1 up, 0 hidden
  const ZONE_IN = -.75, ZONE_OUT = () => LEN + .85;   // in screens from the section's top: where it shows
  const showSkip = way => {
    if (way === skipWay) return;
    skipWay = way;
    skipper.classList.toggle('is-shown', !!way);
    if (way) {
      skipper.dataset.way = way > 0 ? 'down' : 'up';
      skipper.setAttribute('aria-label', way > 0 ? 'Skip the laptop walkthrough and continue down the page' : 'Skip the laptop walkthrough and go back up the page');
    }
  };
  const onSkipZone = () => {
    if (skipping) return;
    const p = pos();
    if (p <= ZONE_IN || p >= ZONE_OUT()) return showSkip(0);
    if (!skipWay) showSkip(p < LEN / 2 ? 1 : -1);   // arriving: from above the top half, from below the bottom
  };
  addEventListener('scroll', onSkipZone, { passive: true });
  skipper.addEventListener('click', () => {
    const way = skipWay || 1;
    skipping = true;
    showSkip(0);
    jump(way > 0 ? CLOSE : 0);   // lets go of the scroll, and leaves the walkthrough at the end it is left by
    busy = true;
    const y = way > 0 ? docTop(sec) + sec.offsetHeight : docTop(sec) - innerHeight;
    lenis.scrollTo(y, { duration: 1, force: true, lock: true, onComplete: () => { busy = false; skipping = false; onSkipZone(); } });
  });

  sec.style.setProperty('--wt-len', LEN.toFixed(3));
  sec.classList.add('is-live');
  lenis.resize();   // the page just grew by the section's scroll length: let the smooth scroll know now, not on its next resize check
  layout();
  Object.assign(cam, base);
  gsap.set([...caps, pill, outro, end], { autoAlpha: 0 });
  gsap.set(pill, { x: 0, xPercent: phone ? 0 : -50, y: rem() * .8 });   // centred by gsap from here, so its rise and the centring share one transform (phones: left-aligned, beside Skip)
  shots.forEach(s => gsap.set(s, { opacity: s.dataset.shot === 'overview' ? 1 : 0, visibility: s.dataset.shot === 'overview' ? 'visible' : 'hidden' }));

  const onScroll = () => {
    renderOpen();
    const q = pos();
    sec.classList.toggle('is-pinned', q >= 0 && q <= LEN);   // the nav keeps its full size while the laptop holds the screen
    if (busy) return;
    const p = pos();
    if (at === 0) { if (p > OPEN + .05 && p < P(CLOSE) - .1) go(1); else if (p >= P(CLOSE) - .1 && p < LEN + 1) jump(CLOSE); }
    else if (at === CLOSE) { if (p < P(CLOSE) - .05 && p > OPEN + .05) go(CLOSE - 1); else if (p <= OPEN + .05) jump(0); }
    else if (Math.abs(p - P(at)) > .3) {   // moved under a held step (the scrollbar): the nearest step, as it is
      const k = p <= OPEN + .05 ? 0 : p >= P(CLOSE) - .1 ? CLOSE : Math.round((p - OPEN) / STEP);
      jump(Math.max(0, Math.min(CLOSE, k)));
    }
  };
  ScrollTrigger.create({
    trigger: sec, start: () => docTop(sec) - innerHeight, end: () => docTop(sec) + sec.offsetHeight, invalidateOnRefresh: true,
    onUpdate: onScroll,
  });
  ScrollTrigger.addEventListener('refreshInit', layout);
  ScrollTrigger.addEventListener('refresh', () => {   // a resize: the step's view and place, measured again
    apply(at, 0);
    if (held) lenis.scrollTo(posY(at), { immediate: true, force: true });
    renderOpen();
  });
  renderOpen(); renderView();

  fetch(dir + 'corners.json').then(r => r.json()).then(j => {
    corners = j.frames; N = corners.length; stillC = j.still || null;
    if (near) load();
    ScrollTrigger.refresh();   // lays the views out now the screen's position is known
  }).catch(() => {});
});
