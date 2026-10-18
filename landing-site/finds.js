/* What Reclaim finds (styles: .finds). The passage after the walkthrough lights word by word as it comes up the
   screen, a little behind the eye. Then the page holds it while the black draws in on all four sides into a card
   the width of the four pictures under it, with their corners, and it scrolls on with them. Under them, the
   recovery summary adds itself up as it comes into view.
   Reduced motion (or no script): the passage is a card from the start, every word lit, the total already there. */
(window.reclaimModules = window.reclaimModules || []).push(({ $, $$, gsap, ScrollTrigger, rem, calm, at, docTop }) => {
  const sec = $('[data-finds]');
  if (!sec) return;
  // the summary's icons (the renders, as backgrounds) load as it comes within a screen and a half, not with the
  // page; with reduced motion too
  new IntersectionObserver((es, io) => { if (es.some(e => e.isIntersecting)) { sec.classList.add('is-near'); io.disconnect(); } }, { rootMargin: '150% 0px' }).observe($('.ex-sum', sec));
  if (calm) return;
  const track = $('.fd-track', sec), card = $('.fd-card', sec), tiles = $('.fd-tiles', sec);
  sec.classList.add('is-live');

  // ---------- the passage: each word its own span (the amount stays one), lit in a soft band that runs through
  // them as the passage comes up the screen, finished as it fills it ----------
  const text = $('[data-words]', sec), words = [];
  for (const n of [...text.childNodes]) {
    if (n.nodeType !== 3) { n.classList.add('w'); words.push(n); continue; }
    const run = document.createDocumentFragment();
    n.textContent.split(/(\s+)/).forEach(part => {
      if (!part.trim()) { run.append(part); return; }
      const w = document.createElement('span');
      w.className = 'w';
      w.textContent = part;
      run.append(w);
      words.push(w);
    });
    n.replaceWith(run);
  }
  gsap.set(words, { opacity: .24 });
  gsap.to(words, {
    opacity: 1, duration: 1, stagger: .25, ease: 'none',
    scrollTrigger: { start: at(track, .6), end: at(track, 0), scrub: true, invalidateOnRefresh: true },
  });

  // ---------- the hold: the black draws in to a card ----------
  // measured by offsets (docTop) like the rest of the page's triggers; the card's clipped edges go to the nav
  // (card.navCut), which turns light as the card's top passes under it. No clip at all until it starts drawing in.
  let to;   // the card it ends as: insets from the screen's edges, and the corner
  const measure = () => {
    const navH = parseFloat(getComputedStyle(sec).getPropertyValue('--nav-height')) * rem();
    to = {
      top: navH + rem() * 1.6, bottom: parseFloat(getComputedStyle(tiles).rowGap),   // a tile-gap above the four
      side: Math.max(0, (sec.clientWidth - tiles.offsetWidth) / 2),
      r: parseFloat(getComputedStyle($('.fd-tile', sec)).borderTopLeftRadius),
    };
  };
  const cut = { p: 0 };
  const draw = () => {
    const p = cut.p, t = p * to.top, b = p * to.bottom, x = p * to.side;
    card.style.clipPath = p ? `inset(${t}px ${x}px ${b}px ${x}px round ${p * to.r}px)` : '';
    card.navCut = { top: t, bottom: b };
  };
  measure();
  draw();
  gsap.to(cut, {
    p: 1, ease: 'power2.inOut', onUpdate: draw,
    scrollTrigger: { start: at(track, 0), end: () => docTop(track) + track.offsetHeight - innerHeight, scrub: true, invalidateOnRefresh: true },
  });
  ScrollTrigger.addEventListener('refresh', () => { measure(); draw(); });

  // the four rise in under it as it lets go, a row at a time as each row comes up (side by side a beat apart), and
  // sink back once they are off the screen below again, like the page's headings
  const RISE = { y: 40, opacity: 0 };
  $$('.fd-tile', sec).forEach(tile => {
    gsap.set(tile, RISE);
    const beat = () => (tile.parentElement.offsetLeft > tiles.offsetLeft + 1 ? .08 : 0);   // the right-hand one of a pair
    ScrollTrigger.create({ start: at(tile, .9), onEnter: () => gsap.to(tile, { y: 0, opacity: 1, duration: .9, delay: beat(), ease: 'power3.out', overwrite: true }) });
    ScrollTrigger.create({ start: at(tile, 1), onLeaveBack: () => gsap.set(tile, { ...RISE, overwrite: true }) });
  });

  // ---------- the summary adds itself up, once, as it comes into view: the rows come in one after another, and
  // as each lands the total steps up by its amount (to the same total the page shows without this) ----------
  const sum = $('.ex-sum', sec), total = $('[data-total]', sum), lines = $$('.ex-sum-row', sum);
  const amounts = lines.map(r => +$('.ex-sum-amt', r).textContent.replace(/\D/g, ''));
  const tally = { v: 0 };
  const money = () => { total.textContent = '$' + Math.round(tally.v).toLocaleString('en-US'); };
  money();   // starts from nothing: the rows below it are not in yet
  const adds = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
  adds.from($('.ex-sum-head', sum), { opacity: 0, y: 12, duration: .5 }, 0);
  lines.forEach((r, i) => {
    const t = .15 + i * .16;
    adds.from(r, { opacity: 0, y: 20, duration: .6 }, t)
      .from($('.ex-sum-state', r), { opacity: 0, scale: .8, duration: .45, ease: 'back.out(2)' }, t + .3)
      .to(tally, { v: amounts.slice(0, i + 1).reduce((x, y) => x + y, 0), duration: .45, ease: 'power2.out', onUpdate: money }, t + .3);
  });
  ScrollTrigger.create({ start: at(sum, .78), once: true, onEnter: () => adds.play() });
});
