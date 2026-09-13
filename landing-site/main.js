/* Hexis — interaction + motion layer.
   Motion recipes mirror the reference (GSAP defaults: .5s power1.out). */
(() => {
  gsap.registerPlugin(ScrollTrigger);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  // ---------- scrollbar-aware grid ----------
  const setScrollbar = () => document.documentElement.style.setProperty('--scrollbar-width', `${innerWidth - document.documentElement.clientWidth}px`);
  setScrollbar();
  addEventListener('resize', setScrollbar);

  // ---------- nav clones (one per section, clipped by the section) ----------
  const tpl = $('#nav-tpl');
  $$('.nav-slot').forEach(slot => {
    const nav = tpl.content.firstElementChild.cloneNode(true);
    const theme = slot.dataset.theme;
    nav.setAttribute('theme', theme);
    $('.right .cta-button', nav).setAttribute('theme', theme === 'black' ? 'green' : 'black');
    slot.replaceWith(nav);
  });

  // ---------- mobile menu (≤1023px): one sheet for every nav clone, built from the nav template ----------
  const mq = matchMedia('(max-width: 1023px)');
  const tplNav = tpl.content.firstElementChild;
  const mm = document.createElement('div');
  mm.className = 'mobile-menu';
  mm.id = 'mobile-menu';
  mm.hidden = true;
  mm.setAttribute('role', 'dialog');
  mm.setAttribute('aria-modal', 'true');
  mm.setAttribute('aria-label', 'Menu');
  mm.setAttribute('data-lenis-prevent', '');
  const mmRowsHtml = $$('.nav-bar > .group', tplNav).map((g, i) => {
    const label = $('.label', g).textContent.trim();
    const items = $$('.nav-bar-submenu .item', g);
    if (!items.length) return '<li class="mm-item"><a class="mm-row" href="' + ($('a.link', g)?.getAttribute('href') || '#') + '">' + label + '</a></li>';
    const links = items.map(a => '<a href="' + a.getAttribute('href') + '">' + a.textContent.trim() + '</a>').join('');
    return '<li class="mm-item"><button type="button" class="mm-row" aria-expanded="false" aria-controls="mm-sub-' + i + '">' + label + '<span class="mm-plus" aria-hidden="true"></span></button>'
      + '<div class="mm-sub" id="mm-sub-' + i + '" inert><div class="inner">' + links + '</div></div></li>';
  }).join('');
  mm.innerHTML = '<div class="mm-top">' + $('.left', tplNav).innerHTML
    + '<button type="button" class="menu-toggle mm-close" aria-label="Close menu"><span class="bar"></span><span class="bar"></span></button></div>'
    + '<ul class="mm-list">' + mmRowsHtml + '</ul>'
    + '<div class="mm-foot"><a href="#" class="cta cta-button" size="large" theme="green"><span class="hover-loop"><span class="inner">Start an Audit</span></span></a></div>';
  document.body.appendChild(mm);

  // ---------- split headings into masked lines ----------
  $$('[data-split]').forEach(el => {
    el.innerHTML = el.innerHTML.split(/<br\s*\/?>/i)
      .map(part => `<span class="line-wrap"><span class="line">${part.trim()}</span></span>`).join('');
  });

  // ---------- hover-loop (text / icon roll) ----------
  $$('.hover-loop').forEach(hl => {
    const first = $(':scope > .inner', hl);
    if (!first) return;
    const second = first.cloneNode(true);
    first.classList.add('first');
    second.classList.add('second');
    second.setAttribute('aria-hidden', 'true');
    hl.appendChild(second);
    gsap.set(second, { x: 0, y: 0 });

    const dir = hl.classList.contains('up-right') ? 'up-right' : hl.classList.contains('right') ? 'right' : 'up';
    const tl = gsap.timeline({ paused: true, defaults: { duration: parseFloat(hl.dataset.duration || .3), ease: 'power1.inOut' } });
    if (dir === 'up') tl.fromTo(first, { yPercent: 0 }, { yPercent: -100 }, 0).fromTo(second, { yPercent: 100 }, { yPercent: 0 }, 0);
    if (dir === 'right') tl.fromTo(first, { xPercent: 0 }, { xPercent: 100 }, 0).fromTo(second, { xPercent: -100 }, { xPercent: 0 }, 0);
    if (dir === 'up-right') tl.fromTo(first, { xPercent: 0, yPercent: 0 }, { xPercent: 100, yPercent: -100 }, 0).fromTo(second, { xPercent: -100, yPercent: 100 }, { xPercent: 0, yPercent: 0 }, 0);

    const trigger = hl.closest('a, button, .entry-item1') || hl;
    trigger.addEventListener('mouseenter', () => tl.play());
    trigger.addEventListener('mouseleave', () => tl.reverse());
  });

  // ---------- button hover state ----------
  $$('.cta-button, .cta-button-square').forEach(btn => {
    const host = btn.closest('a, button') || btn;
    host.addEventListener('mouseenter', () => btn.classList.add('hovering'));
    host.addEventListener('mouseleave', () => btn.classList.remove('hovering'));
  });

  // ---------- nav: hover state + submenus ----------
  $$('.the-nav').forEach(nav => {
    const bar = $('.nav-bar', nav);
    $$('.group', bar).forEach(group => {
      group.addEventListener('mouseenter', () => {
        bar.classList.add('hovering');
        group.classList.add('active');
        if ($('.nav-bar-submenu', group)) group.classList.add('open');
      });
      group.addEventListener('mouseleave', () => group.classList.remove('active', 'open'));
    });
    bar.addEventListener('mouseleave', () => bar.classList.remove('hovering'));
  });

  // ---------- smooth scroll ----------
  const lenis = new Lenis({ lerp: .1 });
  window.lenis = lenis;
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();

  $$('.cta-scroll').forEach(a => a.addEventListener('click', e => { e.preventDefault(); lenis.scrollTo(0, { duration: 1 }); }));
  $$('a[href="#"]').forEach(a => a.addEventListener('click', e => e.preventDefault()));

  // mobile menu: the sheet wipes down (like the intro panel), rows slide in like the section headings
  const mmClose = $('.mm-close', mm);
  const mmRows = $$('.mm-item, .mm-foot', mm);
  const navToggles = $$('.the-nav .menu-toggle');
  let mmOpener = null, mmTl;
  const openMenu = opener => {
    mmOpener = opener;
    mm.hidden = false;
    navToggles.forEach(t => t.setAttribute('aria-expanded', 'true'));
    lenis.stop();
    mmTl?.kill();
    mmTl = gsap.timeline()
      .fromTo(mm, { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: calm ? 0 : .6, ease: 'power3.inOut' })
      .fromTo(mmRows, { x: -50, opacity: 0 }, { x: 0, opacity: 1, stagger: calm ? 0 : .05, duration: calm ? 0 : .5 }, calm ? 0 : .25);
    mmClose.focus({ preventScroll: true });
  };
  const closeMenu = instant => {
    if (mm.hidden) return;
    navToggles.forEach(t => t.setAttribute('aria-expanded', 'false'));
    mmTl?.kill();
    const done = () => { mm.hidden = true; lenis.start(); mmOpener?.focus({ preventScroll: true }); };
    if (instant || calm) { gsap.set(mm, { clipPath: 'inset(0% 0% 100% 0%)' }); done(); return; }
    mmTl = gsap.to(mm, { clipPath: 'inset(0% 0% 100% 0%)', duration: .45, ease: 'power3.inOut', onComplete: done });
  };
  navToggles.forEach(t => t.addEventListener('click', () => openMenu(t)));
  mmClose.addEventListener('click', () => closeMenu());
  $$('a', mm).forEach(a => a.addEventListener('click', () => closeMenu()));
  $$('button.mm-row', mm).forEach(row => {
    const sub = $('#' + row.getAttribute('aria-controls'), mm);
    row.addEventListener('click', () => {
      const open = row.getAttribute('aria-expanded') !== 'true';
      row.setAttribute('aria-expanded', String(open));
      sub.inert = !open;
      gsap.to(sub, { height: open ? 'auto' : 0, duration: calm ? 0 : .5, ease: 'power2.inOut', overwrite: true });
    });
  });
  mm.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeMenu(); return; }
    if (e.key !== 'Tab') return;
    const f = $$('a, button', mm).filter(el => !el.closest('[inert]'));
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  mq.addEventListener('change', e => { if (!e.matches) closeMenu(true); });

  // ---------- logo ----------
  const logoReset = logo => {
    gsap.set($('.wheel', logo), { scale: 0, rotation: 216, transformOrigin: '50% 50%' });
    gsap.set($$('.letter', logo), { xPercent: 50, yPercent: 150 });
  };
  const logoIn = logo => gsap.timeline({ defaults: { duration: 1, ease: 'power2.out' } })
    .to($('.wheel', logo), { scale: 1, rotation: 0 }, 0)
    .to($$('.letter', logo), { xPercent: 0, yPercent: 0, stagger: .1 }, .1);
  const navLogos = $$('.the-nav .hx-logo');
  const footLogo = $('.the-footer .top .hx-logo');
  navLogos.forEach(logoReset);
  logoReset(footLogo);
  ScrollTrigger.create({ trigger: '.the-footer', start: 'top 80%', onEnter: () => logoIn(footLogo), onLeaveBack: () => logoReset(footLogo) });

  // hover: the hexagon fills with green like water. A green copy of the wheel is clipped
  // by a wave (period 13, amplitude 2, wheel units) that drifts sideways while its level rises.
  const WAVE = 'M-26 0Q-22.75-4-19.5 0T-13 0T-6.5 0T0 0T6.5 0T13 0T19.5 0T26 0T32.5 0T39 0T45.5 0T52 0V60H-26Z';
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  $$('.hx-logo').forEach((logo, i) => {
    const wheel = $('.wheel', logo);
    wheel.insertAdjacentHTML('beforeend', `<clipPath id="hx-water-${i}"><path class="water" d="${WAVE}"/></clipPath><g clip-path="url(#hx-water-${i})"><use class="fill" href="#hx-wheel"/></g>`);
    const water = $('.water', wheel);
    gsap.set(water, { x: 0, y: 26 });   // empty: crest sits below the wheel
    const drift = gsap.to(water, { x: -13, duration: 1.2, ease: 'none', repeat: -1, paused: true });
    let level;
    logo.addEventListener('mouseenter', () => {
      if (!calm) drift.play();
      level?.kill();
      level = gsap.to(water, { y: -3, duration: calm ? 0 : 1, ease: 'power2.out' });
    });
    logo.addEventListener('mouseleave', () => {
      level?.kill();
      level = gsap.to(water, { y: 26, duration: calm ? 0 : .6, ease: 'power1.inOut', onComplete: () => drift.pause() });
    });
  });

  // ---------- hero initial state ----------
  const heroLines = $$('.hero-home .heading1 .line');
  const heroWrap = $('.hero-home .bg-wrap .wrap');
  const heroDesc = $('.hero-home .desc');
  gsap.set(heroLines, { x: -50, yPercent: 100 });
  gsap.set(heroWrap, { opacity: 0, yPercent: 20 });
  gsap.set(heroDesc, { opacity: 0, y: 50 });

  const heroIn = () => gsap.timeline()
    .fromTo(heroLines, { x: -50, yPercent: 100 }, { x: 0, yPercent: 0, stagger: .1 }, 0)
    .fromTo(heroWrap, { opacity: 0, yPercent: 20 }, { opacity: 1, yPercent: 0 }, .1)
    .fromTo(heroDesc, { opacity: 0, y: 50 }, { opacity: 1, y: 0 }, .5);

  // ---------- intro: green flash, grey panel swings in ----------
  const intro = $('.site-in');
  const playIntro = () => new Promise(resolve => {
    const mask = $('.mask', intro), flash = $('.flash', intro);
    gsap.set(mask, { rotationY: -90, rotationX: 45, opacity: 1 });
    const tl = gsap.timeline({ onComplete: () => { intro.style.display = 'none'; resolve(); } })
      .to(mask, { rotationY: 0, rotationX: 0, duration: .8, ease: 'power3.inOut' })
      .to(mask, { backgroundColor: 'rgba(229,229,229,0)', duration: .3 })
      .to(flash, { backgroundColor: 'rgba(0,253,116,0)', duration: .3 }, '-=0.4')
      .set(intro, { opacity: 0 });
    tl.timeScale(tl.duration() / .5);
  });

  // ---------- section headings (Heading2) ----------
  const hideLines = lines => gsap.set(lines, { x: -50, opacity: 0, overwrite: true });
  const showLines = (lines, delay = 0) => gsap.fromTo(lines, { x: -50, opacity: 0 }, { x: 0, opacity: 1, stagger: .1, delay, overwrite: true });
  const grouped = '.content-columns .columns [data-split], .entry-solutions .columns [data-split]';
  $$('[data-split="h2"]').filter(h => !h.matches(grouped)).forEach(h => {
    const lines = $$('.line', h);
    hideLines(lines);
    ScrollTrigger.create({ trigger: h, start: 'top bottom', onEnter: () => showLines(lines), onLeaveBack: () => hideLines(lines) });
  });
  // column headings stagger in together, .2s apart
  $$('.content-columns .columns, .entry-solutions .columns').forEach(cols => {
    const heads = $$('[data-split]', cols).map(h => $$('.line', h));
    heads.forEach(hideLines);
    ScrollTrigger.create({
      trigger: cols.closest('.section'), start: 'top bottom',
      onEnter: () => heads.forEach((lines, i) => showLines(lines, i * .2)),
      onLeaveBack: () => heads.forEach(hideLines),
    });
  });

  // ---------- rounded sections: scale up as they arrive ----------
  $$('.rounded-section').forEach(rs => {
    const sc = $('.rs-scale', rs);
    gsap.set(sc, { transformOrigin: 'top center' });
    const bars = on => rs.classList.toggle('canShowBars', on);
    gsap.fromTo(sc, { scale: .9, y: 100 }, {
      scale: 1, y: 0,
      scrollTrigger: {
        trigger: rs, start: 'top bottom', end: 'top center', scrub: true,
        onLeave: () => bars(true), onEnter: () => bars(false), onEnterBack: () => bars(false), onLeaveBack: () => bars(false),
      },
    });
  });

  // ---------- carousels ----------
  const makeSwiper = el => new Swiper(el, {
    slidesPerView: 'auto',
    spaceBetween: rem() * 2.4,
    speed: 700,
    mousewheel: { forceToAxis: true },
    grabCursor: true,
  });
  const swipers = [];
  addEventListener('resize', () => swipers.forEach(s => { s.params.spaceBetween = rem() * 2.4; s.update(); }));

  // entrance: cells slide in from the right with a Y-rotation
  $$('.carousel1').forEach(sec => {
    const tl = gsap.timeline({ paused: true });
    $$('.carousel-cell', sec).forEach((cell, i) => tl.from(cell, { duration: .7, x: innerWidth * .15, rotationY: -15 }, i * .1));
    ScrollTrigger.create({ trigger: sec, start: 'top bottom', toggleActions: 'play none none reset', animation: tl });
  });

  // use-case carousel with 6s autoplay progress
  const uc = $('.use-cases');
  if (uc) {
    const swiper = makeSwiper($('.swiper', uc));
    swipers.push(swiper);
    const ctl = $('.carousel-play-controls', uc);
    const btn = $('button', ctl);
    const dots = $$('.dot', ctl);
    const icons = { playing: ['i-pause', 'Pause'], paused: ['i-play', 'Play'], ended: ['i-replay', 'Replay'] };
    let state = 'paused', tween;
    const setState = s => {
      state = s;
      btn.innerHTML = `<svg class="${s === 'ended' ? 'wide' : ''}"><use href="#${icons[s][0]}"/></svg>`;
      btn.setAttribute('aria-label', icons[s][1]);
    };
    const run = () => {
      tween && tween.kill();
      const i = swiper.activeIndex;
      dots.forEach((d, j) => { d.toggleAttribute('active', j === i); d.toggleAttribute('inactive', j !== i); });
      tween = gsap.fromTo($('.progress', dots[i]), { scaleX: 0 }, {
        scaleX: 1, duration: 6, ease: 'none', paused: state !== 'playing',
        onComplete: () => (i < dots.length - 1 ? swiper.slideTo(i + 1) : setState('ended')),
      });
    };
    swiper.on('slideChange', run);
    btn.addEventListener('click', () => {
      if (state === 'playing') { setState('paused'); tween.pause(); }
      else if (state === 'ended') { setState('playing'); swiper.activeIndex === 0 ? run() : swiper.slideTo(0); }
      else { setState('playing'); tween.resume(); }
    });
    dots.forEach((d, i) => d.addEventListener('click', () => swiper.slideTo(i)));
    const resume = () => { if (state !== 'ended') { setState('playing'); tween.resume(); } };
    const pause = () => { if (state === 'playing') { tween.pause(); setState('paused'); } };
    setState('paused');
    run();
    ScrollTrigger.create({ trigger: ctl, start: 'top bottom', end: 'bottom top', onEnter: resume, onEnterBack: resume, onLeave: pause, onLeaveBack: pause });
  }

  // departments carousel with prev / next
  const dp = $('.departments');
  if (dp) {
    const swiper = makeSwiper($('.swiper', dp));
    swipers.push(swiper);
    const prev = $('.prev', dp), next = $('.next', dp);
    const sync = () => { prev.style.opacity = swiper.isBeginning ? .5 : 1; next.style.opacity = swiper.isEnd ? .5 : 1; };
    prev.addEventListener('click', () => swiper.slidePrev());
    next.addEventListener('click', () => swiper.slideNext());
    swiper.on('slideChange reachEnd reachBeginning fromEdge', sync);
    sync();
  }

  // ---------- integrations grid ----------
  const gridList = $('.grid1 .content');
  if (gridList) {
    gsap.fromTo($$('.grid-item', gridList), { rotationY: -30 }, { rotationY: 0, scrollTrigger: { trigger: gridList, start: 'top bottom', end: 'top center', scrub: true } });
    // mouse 3d tilt (amount 20, lerp .05, as the reference) plus a pan: the wordmark
    // glides toward the cursor inside the tile, like looking around through a window
    $$('.grid-item-brand', gridList).forEach(tile => {
      const target = $('.m3d', tile);
      const mark = $('.wm', tile);
      const s = { x: 0, y: 0, tx: 0, ty: 0, w: 0, h: 0 };
      tile.addEventListener('mousemove', e => {
        const r = tile.getBoundingClientRect();
        s.w = r.width; s.h = r.height;
        s.tx = (e.clientX - r.left) / r.width - .5;
        s.ty = (e.clientY - r.top) / r.height - .5;
      });
      tile.addEventListener('mouseleave', () => { s.tx = 0; s.ty = 0; });
      gsap.ticker.add(() => {
        s.x += (s.tx - s.x) * .05;
        s.y += (s.ty - s.y) * .05;
        if (Math.abs(s.x) < 1e-4 && Math.abs(s.y) < 1e-4 && !s.tx && !s.ty) return;
        target.style.transform = `perspective(1000px) rotateY(${s.x * 20}deg) rotateX(${-s.y * 20}deg) translate3d(${s.x * s.w * .06}px, ${s.y * s.h * .06}px, 0)`;
        mark.style.transform = `translate3d(${s.x * s.w * .22}px, ${s.y * s.h * .3}px, 0)`;
      });
    });
  }

  // ---------- laptop mock: on narrow screens lay the app out at its desktop width, then scale it to fit ----------
  const app = $('.laptop .app');
  if (app) {
    const fitApp = () => {
      app.style.cssText = '';
      if (!mq.matches) return;
      const w = app.offsetWidth, h = app.offsetHeight;
      const s = w / (86.5 * rem());   // 86.5rem = the app's width inside the laptop at 1440px
      app.style.cssText = 'width:' + w / s + 'px;height:' + h / s + 'px;transform:scale(' + s + ');transform-origin:0 0';
    };
    fitApp();
    addEventListener('resize', fitApp);
  }

  // ---------- boot: wait for fonts, then intro → hero ----------
  const boot = async () => {
    try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]); } catch (e) { /* ignore */ }
    ScrollTrigger.refresh();
    await playIntro();
    heroIn();
    navLogos.forEach(logoIn);
    lenis.start();
  };
  boot();
})();
