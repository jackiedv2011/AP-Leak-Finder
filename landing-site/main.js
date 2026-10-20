/* Reclaim — interaction + motion layer, shared by every page.
   Motion recipes mirror the reference (GSAP defaults: .5s power1.out).
   Each block only runs when its elements are on the page. */
(() => {
  gsap.registerPlugin(ScrollTrigger);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
  // where an element's top meets a line a fraction f down the screen, by layout offsets: the rounded sections are
  // scaled while they arrive, and a trigger measured on the scaled box fires hundreds of pixels early
  const docTop = el => { let y = 0; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y; };
  const at = (el, f) => () => docTop(el) - innerHeight * f;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const html = document.documentElement;
  const folder = document.body.dataset.folder || '';
  const here = location.pathname.replace(/\/index\.html$/, '/').replace(/(.)\/$/, '$1');

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  // ---------- scrollbar-aware grid ----------
  const setScrollbar = () => html.style.setProperty('--scrollbar-width', `${innerWidth - html.clientWidth}px`);
  setScrollbar();
  addEventListener('resize', setScrollbar);

  // ---------- nav ----------
  const tpl = $('#nav-tpl');
  const tplNav = tpl.content.firstElementChild;
  // the current page: its nav group stays lit
  const isHere = a => { const h = a.getAttribute('href'); return !!h && h.startsWith('/') && h === here; };
  if (folder) {
    $('.nav-bar', tplNav).classList.add('inFolder');
    $$('.nav-bar > .group', tplNav).forEach(g => g.classList.toggle('current', g.dataset.folder === folder));
  }
  // one nav for the page, floating over everything (so its glass can blur whatever passes under it). Each
  // section's nav-slot only says which theme the nav takes while that section is under the pill's middle;
  // a rounded card counts from its visible (scaled) edge, not its box, and a card drawn in by a clip from its clipped
  // edges (its script keeps them in el.navCut)
  const nav = tplNav.cloneNode(true);
  const navZones = $$('.nav-slot').map(slot => {
    const host = slot.parentElement;
    const zone = { el: $(':scope > .rs-scale', host) || host, theme: slot.dataset.theme };
    slot.remove();
    return zone;
  });
  document.body.prepend(nav);
  const navCta = $('.right .cta-button', nav);
  const syncNav = () => {
    const mid = rem() * (innerWidth > 1023 ? 4.4 : 4);
    let theme = navZones[0]?.theme || 'white';
    for (const z of navZones) {
      const r = z.el.getBoundingClientRect(), cut = z.el.navCut;
      if (r.top + (cut?.top || 0) <= mid && r.bottom - (cut?.bottom || 0) > mid) theme = z.theme;
    }
    if (nav.getAttribute('theme') !== theme) {
      nav.setAttribute('theme', theme);
      navCta.setAttribute('theme', theme === 'black' ? 'green' : 'black');
    }
    nav.classList.toggle('is-floating', scrollY > 40);
    // reading on (scrolling down) it steps back to 90%; a pause or a scroll up brings it back to full size
    const dy = scrollY - navY;
    navY = scrollY;
    clearTimeout(navRest);
    // (not over the walkthrough while it holds the screen: there the scroll steps through it, not reading)
    if (dy > 0 && scrollY > 40 && !document.querySelector('.walkthrough.is-pinned')) {
      nav.classList.add('is-compact');
      navRest = setTimeout(() => nav.classList.remove('is-compact'), 260);
    } else if (dy < 0 || document.querySelector('.walkthrough.is-pinned')) nav.classList.remove('is-compact');
  };
  let navY = scrollY, navRest;
  syncNav();
  addEventListener('scroll', syncNav, { passive: true });
  addEventListener('resize', syncNav);

  // ---------- mobile menu (≤1023px): one sheet, built from the nav template ----------
  const mq = matchMedia('(max-width: 1023px)');
  const mm = document.createElement('div');
  mm.className = 'mobile-menu';
  mm.id = 'mobile-menu';
  mm.hidden = true;
  mm.setAttribute('role', 'dialog');
  mm.setAttribute('aria-modal', 'true');
  mm.setAttribute('aria-label', 'Menu');
  mm.setAttribute('data-lenis-prevent', '');
  const attrs = a => ' href="' + (a.getAttribute('href') || '#') + '"' + (a.dataset.modal ? ' data-modal="' + a.dataset.modal + '"' : '') + (isHere(a) ? ' class="current" aria-current="page"' : '');
  const mmRowsHtml = $$('.nav-bar > .group', tplNav).map(g =>
    '<li class="mm-item"><a class="mm-row"' + attrs($('a.link', g)).replace(' class="current"', '') + '>' + $('.label', g).textContent.trim() + '</a></li>').join('');
  mm.innerHTML = '<div class="mm-top">' + $('.left', tplNav).innerHTML
    + '<button type="button" class="menu-toggle mm-close" aria-label="Close menu"><span class="bar"></span><span class="bar"></span></button></div>'
    + '<ul class="mm-list">' + mmRowsHtml + '</ul>'
    + '<div class="mm-foot"><a href="/audit?entry=sample" class="cta cta-button" size="large" theme="green"><span class="hover-loop"><span class="inner">Get Started</span></span></a><a href="/login" class="mm-login type-body-xs">Log in</a></div>';
  document.body.appendChild(mm);

  // ---------- split headings into masked lines ----------
  // <br> always breaks; text between breaks is measured and split where it wraps, so long headings
  // work at any width. Parts that contain markup stay whole. Re-measured when fonts load and on resize.
  const splitLines = el => {
    const src = el.dataset.splitSrc || (el.dataset.splitSrc = el.innerHTML);
    const old = $('.line', el);   // new lines carry over where the old ones were in their animation
    const keep = !old || !old._gsap ? null
      : gsap.isTweening(old) ? { x: 0, y: 0, xPercent: 0, yPercent: 0, opacity: 1 }   // mid-reveal: finish it
      : ['x', 'y', 'xPercent', 'yPercent', 'opacity'].reduce((o, p) => (o[p] = gsap.getProperty(old, p), o), {});
    const oldWrap = $('.line-wrap', el);   // centred headings move their masks instead (see the section headings)
    const keepWrap = !oldWrap || !oldWrap._gsap ? null
      : gsap.isTweening(oldWrap) ? { y: 0, opacity: 1, filter: 'none' }
      : { y: gsap.getProperty(oldWrap, 'y'), opacity: gsap.getProperty(oldWrap, 'opacity'), filter: oldWrap.style.filter || 'none' };
    el.innerHTML = src.split(/<br\s*\/?>/i).map(p => p.trim()).map(p => /</.test(p)
      ? `<span class="split-part" data-raw>${p}</span>`
      : `<span class="split-part">${p.split(/\s+/).map(w => `<span class="split-w">${w}</span>`).join(' ')}</span>`).join('<br>');
    const lines = [];
    $$('.split-part', el).forEach(part => {
      if (part.hasAttribute('data-raw')) { lines.push(part.innerHTML); return; }
      let top = 0, words = [];
      $$('.split-w', part).forEach(w => {
        if (words.length && w.offsetTop > top + 1) { lines.push(words.join(' ')); words = []; }
        top = w.offsetTop;
        words.push(w.innerHTML);
      });
      if (words.length) lines.push(words.join(' '));
    });
    el.innerHTML = lines.map(l => `<span class="line-wrap"><span class="line">${l}</span></span>`).join('');
    if (keep) gsap.set($$('.line', el), keep);
    if (keepWrap) gsap.set($$('.line-wrap', el), keepWrap);
  };
  const splitAll = () => $$('[data-split]').forEach(splitLines);
  splitAll();
  let splitWidth = innerWidth, splitTimer;
  addEventListener('resize', () => {
    if (innerWidth === splitWidth) return;
    splitWidth = innerWidth;
    clearTimeout(splitTimer);
    splitTimer = setTimeout(() => { splitAll(); ScrollTrigger.refresh(); }, 150);
  });

  // ---------- button hover state (colour only: labels and icons stay where they are) ----------
  // a mouse only: a tap sends a hover too, and it would stay on the button until the next tap elsewhere
  const byMouse = e => e.pointerType === 'mouse';
  $$('.cta-button, .cta-button-square').forEach(btn => {
    const host = btn.closest('a, button') || btn;
    host.addEventListener('pointerenter', e => { if (byMouse(e)) btn.classList.add('hovering'); });
    host.addEventListener('pointerleave', () => btn.classList.remove('hovering'));
  });

  // ---------- nav: the link under the pointer lights, the others dim ----------
  const navBar = $('.nav-bar', nav);
  $$('.group', navBar).forEach(group => {
    group.addEventListener('mouseenter', () => { navBar.classList.add('hovering'); group.classList.add('active'); });
    group.addEventListener('mouseleave', () => group.classList.remove('active'));
  });
  navBar.addEventListener('mouseleave', () => navBar.classList.remove('hovering'));

  // ---------- smooth scroll ----------
  // smooth, but close behind the wheel: more lag than this reads as the page being slow (reduced motion: the wheel's own scroll)
  const lenis = new Lenis({ lerp: .15, smoothWheel: !calm });
  window.lenis = lenis;
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();

  $$('.cta-scroll').forEach(a => a.addEventListener('click', e => { e.preventDefault(); lenis.scrollTo(0, { duration: 1, immediate: calm }); }));
  $$('a[href="#"]').forEach(a => a.addEventListener('click', e => e.preventDefault()));

  // in-page anchors (article nav, hero jump rows, guide contents)
  const anchorTarget = hash => { try { return hash.length > 1 ? $(hash) : null; } catch (e) { return null; } };
  const scrollToTarget = (el, immediate) => lenis.scrollTo(el, { offset: -rem() * 2.4, duration: immediate || calm ? 0 : 1.2, immediate: !!immediate || calm, force: true });
  $$('a[href^="#"]:not([data-modal])').forEach(a => {
    const target = anchorTarget(a.getAttribute('href'));
    if (!target) return;
    a.addEventListener('click', e => {
      e.preventDefault();
      scrollToTarget(target);
      history.replaceState(null, '', a.getAttribute('href'));
    });
  });

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
  const closeMenu = (instant, keepStopped) => {
    if (mm.hidden) return;
    navToggles.forEach(t => t.setAttribute('aria-expanded', 'false'));
    mmTl?.kill();
    const done = () => { mm.hidden = true; if (!keepStopped) { lenis.start(); mmOpener?.focus({ preventScroll: true }); } };
    if (instant || calm) { gsap.set(mm, { clipPath: 'inset(0% 0% 100% 0%)' }); done(); return; }
    mmTl = gsap.to(mm, { clipPath: 'inset(0% 0% 100% 0%)', duration: .45, ease: 'power3.inOut', onComplete: done });
  };
  navToggles.forEach(t => t.addEventListener('click', () => openMenu(t)));
  mmClose.addEventListener('click', () => closeMenu());
  $$('a:not([data-modal])', mm).forEach(a => a.addEventListener('click', () => closeMenu()));
  mm.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeMenu(); return; }
    if (e.key !== 'Tab') return;
    const f = $$('a, button', mm);
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  mq.addEventListener('change', e => { if (!e.matches) closeMenu(true); });

  // ---------- popup: talk to us ----------
  const modal = $('#modal');
  if (modal) {
    const box = $('.modal-box', modal);
    const underlay = $('.underlay', modal);
    const card = $('.form-intro', modal);
    const success = $('.success-message', modal);
    const form = $('form', modal);
    const submitWrap = $('.wrapper-submit', modal);
    const errorBox = $('.error-message', modal);
    let opener = null, anim, submitTimer;

    const dropdowns = $$('.dropdown', modal).map(dd => {
      const button = $('.dropdown-button', dd);
      const text = $('.dropdown-button-text', dd);
      const list = $('.dropdown-list', dd);
      const options = $$('[role="option"]', list);
      const multi = dd.hasAttribute('data-multi');
      options.forEach(o => { o.tabIndex = -1; });
      const values = () => options.filter(o => o.getAttribute('aria-selected') === 'true').map(o => o.textContent.trim());
      const render = () => {
        const v = values();
        text.textContent = v.length ? v.join(', ') : text.dataset.placeholder;
        button.classList.toggle('filled', v.length > 0);
      };
      const open = focusFirst => {
        dropdowns.forEach(d => d !== api && d.close());
        list.hidden = false;
        button.setAttribute('aria-expanded', 'true');
        if (focusFirst) (options.find(o => o.getAttribute('aria-selected') === 'true') || options[0]).focus();
      };
      const close = refocus => {
        if (list.hidden) return;
        list.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        if (refocus) button.focus();
      };
      const pick = o => {
        if (multi) o.setAttribute('aria-selected', String(o.getAttribute('aria-selected') !== 'true'));
        else options.forEach(x => x.setAttribute('aria-selected', String(x === o)));
        render();
        dd.closest('.formkit-outer').removeAttribute('data-invalid');
        if (!multi) close(true);
      };
      button.addEventListener('click', () => (list.hidden ? open(false) : close()));
      button.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(true); } });
      options.forEach((o, i) => {
        o.addEventListener('click', () => pick(o));
        o.addEventListener('keydown', e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); options[Math.min(i + 1, options.length - 1)].focus(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); options[Math.max(i - 1, 0)].focus(); }
          else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(o); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
          else if (e.key === 'Tab') close();
        });
      });
      const api = { dd, open, close, values, reset: () => { options.forEach(o => o.setAttribute('aria-selected', 'false')); render(); close(); }, isOpen: () => !list.hidden };
      return api;
    });
    document.addEventListener('click', e => dropdowns.forEach(d => { if (!d.dd.contains(e.target)) d.close(); }));

    const setError = (field, msg) => {
      const outer = $(`[data-field="${field}"]`, form);
      const msgs = $('.formkit-messages', outer);
      if (msg) { outer.setAttribute('data-invalid', 'true'); msgs.innerHTML = `<li class="formkit-message">${msg}</li>`; }
      else { outer.removeAttribute('data-invalid'); msgs.innerHTML = ''; }
      return !msg;
    };
    const validate = () => {
      const name = form.elements.name.value.trim();
      const email = form.elements.email.value.trim();
      const ok = [
        setError('name', name ? '' : 'Please enter your name.'),
        setError('email', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? '' : 'Please enter a valid work email.'),
        setError('role', dropdowns[0].values().length ? '' : 'Please select your role.'),
      ].every(Boolean);
      $('.formkit-message', errorBox).textContent = 'Please check the highlighted fields.';
      errorBox.hidden = ok;
      return ok;
    };
    ['name', 'email'].forEach(n => form.elements[n].addEventListener('input', () => { if ($(`[data-field="${n}"]`, form).hasAttribute('data-invalid')) validate(); }));

    const reset = () => {
      clearTimeout(submitTimer);
      form.reset();
      dropdowns.forEach(d => d.reset());
      ['name', 'email', 'role'].forEach(f => setError(f, ''));
      errorBox.hidden = true;
      submitWrap.classList.remove('loading');
      card.hidden = false;
      success.hidden = true;
      gsap.set([card, success], { clearProps: 'opacity,transform,filter' });
    };
    const focusables = () => $$('button, input, [tabindex="0"], a[href]', modal).filter(el => !el.closest('[hidden]') && el.tabIndex >= 0 && !el.closest('.dropdown-list'));

    const openModal = from => {
      opener = from || document.activeElement;
      closeMenu(true, true);
      reset();
      modal.hidden = false;
      html.classList.add('modal-open');
      lenis.stop();
      $('.modal-scroll', modal).scrollTop = 0;
      anim?.kill();
      anim = gsap.timeline()
        .fromTo(underlay, { opacity: 0 }, { opacity: 1, duration: calm ? 0 : .2, ease: 'power1.out' }, 0)
        .fromTo(box, { opacity: 0, scale: .8 }, { opacity: 1, scale: 1, duration: calm ? 0 : .4, ease: 'power1.out' }, 0);
      setTimeout(() => form.elements.name.focus({ preventScroll: true }), calm ? 0 : 60);
    };
    const closeModal = () => {
      if (modal.hidden) return;
      anim?.kill();
      const done = () => {
        modal.hidden = true;
        html.classList.remove('modal-open');
        lenis.start();
        opener?.focus?.({ preventScroll: true });
      };
      anim = gsap.timeline({ onComplete: done })
        .to(underlay, { opacity: 0, duration: calm ? 0 : .2, ease: 'power1.out' }, 0)
        .to(box, { opacity: 0, scale: .8, duration: calm ? 0 : .4, ease: 'power1.out' }, 0);
    };
    window.reclaimModal = { open: openModal, close: closeModal };

    document.addEventListener('click', e => {
      const t = e.target.closest('[data-modal]');
      if (!t) return;
      e.preventDefault();
      openModal(t);
    });
    underlay.addEventListener('click', closeModal);
    $$('.close, .done', modal).forEach(b => b.addEventListener('click', closeModal));
    modal.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (dropdowns.some(d => d.isOpen())) { dropdowns.forEach(d => d.close(true)); return; } closeModal(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (submitWrap.classList.contains('loading')) return;
      if (!validate()) { $('[data-invalid] input, [data-invalid] .dropdown-button', form)?.focus(); return; }
      submitWrap.classList.add('loading');
      const payload = {
        kind: 'talk',
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        role: dropdowns[0].values()[0] || '',
        systems: dropdowns[1] ? dropdowns[1].values() : [],
        message: form.elements.message.value.trim(),
      };
      fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Could not send.'); })
        .then(() => {
        submitWrap.classList.remove('loading');
        gsap.timeline()
          // (a touch of blur through the swap, so the form and the thanks read as one card changing)
          .to(card, { opacity: 0, scale: .96, filter: calm ? 'none' : 'blur(2px)', duration: calm ? 0 : .2, ease: 'power1.in', onComplete: () => { card.hidden = true; success.hidden = false; } })
          .fromTo(success, { opacity: 0, scale: .96, filter: calm ? 'none' : 'blur(2px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: calm ? 0 : .4, ease: 'power1.out', clearProps: 'filter', onStart: () => $('.close', success).focus({ preventScroll: true }) });
        })
        .catch(err => {
          submitWrap.classList.remove('loading');
          $('.formkit-message', errorBox).textContent = err.message === 'Failed to fetch' ? 'Could not reach us. Email reclaimbusiness1@gmail.com instead.' : err.message;
          errorBox.hidden = false;
        });
    });
  }

  // ---------- logo ----------
  // (reduced motion: the logo fades in where it stands)
  const logoReset = logo => {
    if (calm) { gsap.set(logo, { opacity: 0 }); return; }
    gsap.set($('.wheel', logo), { scale: 0, rotation: 216, transformOrigin: '50% 50%' });
    gsap.set($$('.letter', logo), { xPercent: 50, yPercent: 150 });
  };
  const logoIn = logo => calm ? gsap.to(logo, { opacity: 1, duration: .5 }) : gsap.timeline({ defaults: { duration: 1, ease: 'power2.out' } })
    .to($('.wheel', logo), { scale: 1, rotation: 0 }, 0)
    .to($$('.letter', logo), { xPercent: 0, yPercent: 0, stagger: .1 }, .1);
  const navLogos = $$('.the-nav .hx-logo');
  const footLogo = $('.the-footer .hx-logo');
  navLogos.forEach(logoReset);
  if (footLogo) {
    logoReset(footLogo);
    ScrollTrigger.create({ trigger: '.the-footer', start: 'top 80%', onEnter: () => logoIn(footLogo), onLeaveBack: () => logoReset(footLogo) });
  }

  // hover: the hexagon fills with green like water. A green copy of the wheel is clipped
  // by a wave (period 13, amplitude 2, wheel units) that drifts sideways while its level rises.
  const WAVE = 'M-26 0Q-22.75-4-19.5 0T-13 0T-6.5 0T0 0T6.5 0T13 0T19.5 0T26 0T32.5 0T39 0T45.5 0T52 0V60H-26Z';
  $$('.hx-logo').forEach((logo, i) => {
    const wheel = $('.wheel', logo);
    wheel.insertAdjacentHTML('beforeend', `<clipPath id="hx-water-${i}"><path class="water" d="${WAVE}"/></clipPath><g clip-path="url(#hx-water-${i})"><use class="fill" href="#hx-wheel"/></g>`);
    const water = $('.water', wheel);
    gsap.set(water, { x: 0, y: 26 });   // empty: crest sits below the wheel
    const drift = gsap.to(water, { x: -13, duration: 1.2, ease: 'none', repeat: -1, paused: true });
    let level;
    logo.addEventListener('pointerenter', e => {
      if (!byMouse(e)) return;
      if (!calm) drift.play();
      level?.kill();
      level = gsap.to(water, { y: -3, duration: calm ? 0 : 1, ease: 'power2.out' });
    });
    logo.addEventListener('pointerleave', () => {
      level?.kill();
      level = gsap.to(water, { y: 26, duration: calm ? 0 : .6, ease: 'power1.inOut', onComplete: () => drift.pause() });
    });
  });

  // ---------- hero film: its floor is the hero's, as this browser decodes it (a film and the page's CSS colour
  // can decode a level apart, and that would show as a box round the stack). Sampled from its top-left corner ----------
  const heroFilm = document.querySelector('.hero-film');
  if (heroFilm) heroFilm.addEventListener('loadeddata', () => {
    const c = document.createElement('canvas'); c.width = c.height = 1;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(heroFilm, heroFilm.videoWidth * .01, heroFilm.videoHeight * .01, heroFilm.videoWidth * .06, heroFilm.videoHeight * .04, 0, 0, 1, 1);
    const d = x.getImageData(0, 0, 1, 1).data;
    heroFilm.closest('.hero-home').style.setProperty('--cl-bg1', `rgb(${d[0]} ${d[1]} ${d[2]})`);
  }, { once: true });

  // ---------- hero initial state (heading lines rise, image fades up, description follows) ----------
  const hero = $('.page > :first-child');
  const heroLinesOf = () => (hero ? $$('.heading1 .line', hero) : []);
  let heroLines = heroLinesOf();
  const heroWrap = hero ? $('.hero-home .bg-wrap .wrap', hero.parentNode) : null;
  const heroDesc = hero ? $(':scope .desc, :scope [data-hero-desc]', hero) : null;
  const heroJumps = hero ? $$('.hero-business-nav-item', hero) : [];
  // the lines start a fifth past their own height below the mask: the mask is padded for descenders, and at
  // a whole height the tops of the letters would show through it while they wait. Reduced motion: fades only
  const HERO = calm
    ? { lines: { opacity: 0 }, wrap: { opacity: 0 }, desc: { opacity: 0 }, jumps: { opacity: 0 } }
    : { lines: { x: -50, yPercent: 120 }, wrap: { opacity: 0, yPercent: 20 }, desc: { opacity: 0, y: 50 }, jumps: { opacity: 0, y: '20%' } };
  gsap.set(heroLines, HERO.lines);
  if (heroWrap) gsap.set(heroWrap, HERO.wrap);
  if (heroDesc) gsap.set(heroDesc, HERO.desc);
  if (heroJumps.length) gsap.set(heroJumps, HERO.jumps);

  const heroIn = () => {
    const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
    heroLines = heroLinesOf();
    if (heroLines.length) tl.fromTo(heroLines, HERO.lines, { x: 0, yPercent: 0, opacity: 1, stagger: .1 }, 0);
    if (heroWrap) tl.fromTo(heroWrap, HERO.wrap, { opacity: 1, yPercent: 0 }, .1);
    if (heroDesc) tl.fromTo(heroDesc, HERO.desc, { opacity: 1, y: 0 }, .5);
    if (heroJumps.length) tl.fromTo(heroJumps, HERO.jumps, { opacity: 1, y: 0, stagger: .2 }, .8);
    return tl;
  };

  // ---------- intro: green flash, grey panel swings in (first page of a visit only) ----------
  const intro = $('.site-in');
  const returning = html.classList.contains('is-return');
  try { sessionStorage.setItem('rc-visited', '1'); } catch (e) { /* private mode */ }
  const playIntro = () => new Promise(resolve => {
    if (returning || calm) {
      intro.style.display = 'none';   // the page fades in by CSS (.is-return .page)
      return resolve();
    }
    const mask = $('.mask', intro), flash = $('.flash', intro);
    gsap.set(mask, { rotationY: -90, rotationX: 45, opacity: 1 });
    const tl = gsap.timeline({ onComplete: () => { intro.style.display = 'none'; resolve(); } })
      .to(mask, { rotationY: 0, rotationX: 0, duration: .8, ease: 'power3.inOut' })
      .to(mask, { backgroundColor: 'rgba(229,229,229,0)', duration: .3 })
      .to(flash, { backgroundColor: 'rgba(0,253,116,0)', duration: .3 }, '-=0.4')
      .set(intro, { opacity: 0 });
    tl.timeScale(tl.duration() / .5);
  });

  // ---------- page transition: fade out, then load the next page (which fades in) ----------
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== '_self' || a.hasAttribute('download') || a.dataset.modal) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || /^(mailto|tel):/.test(a.getAttribute('href'))) return;
    if (url.pathname === location.pathname && url.hash) return;   // same-page anchor
    if (a.getAttribute('href') === '#') return;
    e.preventDefault();
    lenis.stop();
    gsap.to('.page', { opacity: 0, duration: calm ? 0 : .2, ease: 'sine.inOut', onComplete: () => { location.href = url.href; } });
  });
  addEventListener('pageshow', e => { if (e.persisted) { gsap.set('.page', { opacity: 1 }); lenis.start(); } });

  // ---------- section headings (Heading2) ----------
  // A heading reveals once it is well on screen (15% up from the foot), so the move is seen, not spent below the
  // fold; it hides again only once it is back off the screen. Left-set headings slide in from the left; centred
  // ones rise out of a light blur, mask and all (a slide from the side reads off-axis over a centred line).
  // Reduced motion: fades only.
  const reveal = (el, show, hide) => {
    ScrollTrigger.create({ start: at(el, .85), onEnter: show });
    ScrollTrigger.create({ start: at(el, 1), onLeaveBack: hide });
  };
  const SLIDE = calm ? { opacity: 0 } : { x: -50, opacity: 0 };
  const RISE = calm ? { opacity: 0 } : { y: 24, opacity: 0, filter: 'blur(8px)' };
  const hideLines = lines => gsap.set(lines, { ...SLIDE, overwrite: true });
  const showLines = (lines, delay = 0) => gsap.fromTo(lines, SLIDE, { x: 0, opacity: 1, stagger: .1, delay, ease: 'power4.out', overwrite: true });
  const hideRise = wraps => gsap.set(wraps, { ...RISE, overwrite: true });
  const showRise = wraps => gsap.fromTo(wraps, RISE, { y: 0, opacity: 1, filter: 'blur(0px)', stagger: .1, ease: 'power4.out', overwrite: true, clearProps: 'filter' });
  const grouped = '.content-columns .columns [data-split]';
  // (lines are looked up when used: a re-split replaces them)
  $$('[data-split="h2"]').filter(h => !h.matches(grouped)).forEach(h => {
    if (getComputedStyle(h).textAlign === 'center') {
      const wraps = () => $$('.line-wrap', h);
      hideRise(wraps());
      reveal(h, () => showRise(wraps()), () => hideRise(wraps()));
      return;
    }
    const lines = () => $$('.line', h);
    hideLines(lines());
    reveal(h, () => showLines(lines()), () => hideLines(lines()));
  });
  // closing: once its heading is in, the line, the actions and the promises rise in after it (blur-in on the
  // expo-out curve, a beat apart); the stack drifts a touch slower than the page
  $$('[data-closing]').forEach(sec => {
    if (calm) return;
    const items = $$('[data-closing-in]', sec);
    const hide = () => gsap.set(items, { y: 24, opacity: 0, filter: 'blur(8px)', overwrite: true });
    hide();
    reveal($('.heading', sec),
      () => gsap.to(items, { y: 0, opacity: 1, filter: 'blur(0px)', duration: .9, ease: 'expo.out', stagger: .08, delay: .3, overwrite: true, clearProps: 'filter' }),
      hide);
    gsap.fromTo($('[data-closing-object]', sec), { y: -48 }, { y: 32, ease: 'none', scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  // column headings stagger in together, .2s apart; each one's number and words follow it a beat later
  const FOLLOW = calm ? { opacity: 0 } : { y: 12, opacity: 0 };
  $$('.content-columns .columns').forEach(cols => {
    const heads = () => $$('[data-split]', cols).map(h => $$('.line', h));
    const details = $$(':scope > *', cols).map(col => $$(':scope > .step-no, :scope > .desc', col));
    const hide = () => { heads().forEach(hideLines); details.forEach(d => gsap.set(d, { ...FOLLOW, overwrite: true })); };
    hide();
    reveal(cols, () => {
      heads().forEach((lines, i) => showLines(lines, i * .2));
      details.forEach((d, i) => gsap.fromTo(d, FOLLOW, { y: 0, opacity: 1, duration: .5, ease: 'power4.out', delay: i * .2 + .1, overwrite: true }));
    }, hide);
  });

  // ---------- rounded sections: scale up as they arrive ----------
  // (the footer is the last card and shorter than half a screen: its top never reaches the middle, so it
  // finishes as the page does instead)
  if (!calm) $$('.rounded-section.shouldAnimate').forEach(rs => {   // (reduced motion: they are simply there)
    const sc = $('.rs-scale', rs);
    const last = rs.classList.contains('ft-card');
    gsap.set(sc, { transformOrigin: 'top center' });
    gsap.fromTo(sc, { scale: .9, y: 100 }, {
      scale: 1, y: 0,
      scrollTrigger: {
        trigger: rs, start: 'top bottom', end: last ? 'bottom bottom' : 'top center', scrub: true,
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
  if (!calm) $$('.article-carousel').forEach(sec => {
    const tl = gsap.timeline({ paused: true });
    $$('.swiper .carousel-cell', sec).forEach((cell, i) => tl.from(cell, { duration: .7, x: innerWidth * .15, rotationY: -15 }, i * .1));
    ScrollTrigger.create({ trigger: sec, start: 'top bottom', toggleActions: 'play none none reset', animation: tl });
  });

  // prev / next carousels (the article carousels)
  $$('.article-carousel').forEach(dp => {
    const swiper = makeSwiper($('.swiper', dp));
    swipers.push(swiper);
    const prev = $('.prev', dp), next = $('.next', dp);
    const sync = () => { prev.style.opacity = swiper.isBeginning ? .5 : 1; next.style.opacity = swiper.isEnd ? .5 : 1; };
    // clicking again before the slide transition finishes can leave a card's position out of
    // sync with the clip mask, so a click mid-transition is ignored rather than queued; the lock
    // clears itself on a timer (rather than trusting swiper.animating alone) so a transition that
    // never reports "finished" — e.g. the tab was backgrounded mid-slide — can't wedge the buttons shut
    let locked = false;
    const withLock = fn => () => {
      if (locked) return;
      locked = true;
      fn();
      setTimeout(() => { locked = false; }, swiper.params.speed + 50);
    };
    prev.addEventListener('click', withLock(() => swiper.slidePrev()));
    next.addEventListener('click', withLock(() => swiper.slideNext()));
    swiper.on('slideChange reachEnd reachBeginning fromEdge', sync);
    sync();
  });

  // ---------- animated numbers: each digit rolls into place ----------
  $$('[data-number]').forEach(el => {
    const value = el.dataset.number;
    el.innerHTML = `<span class="sr-only">${value}</span>` + [...value].map(ch =>
      `<span class="number" aria-hidden="true"><span class="number-text">${ch}</span><span class="number-text--copy">${ch}</span></span>`).join('');
    const firsts = $$('.number-text', el), copies = $$('.number-text--copy', el);
    const reset = () => { gsap.set(firsts, { y: 0, yPercent: 0 }); gsap.set(copies, { y: 0, yPercent: 100 }); };
    const roll = () => gsap.timeline({ defaults: { duration: calm ? 0 : .6, ease: 'power2.inOut', stagger: calm ? 0 : .08 } })
      .fromTo(firsts, { yPercent: 0 }, { yPercent: -100 }, 0)
      .fromTo(copies, { yPercent: 100 }, { yPercent: 0 }, 0);
    reset();
    ScrollTrigger.create({ start: at(el, .9), onEnter: roll, onLeaveBack: reset });
  });

  // ---------- stat tiles: rise in, two by two ----------
  const statTiles = $('.stat-tiles');
  if (statTiles && !calm) {
    gsap.from($$('.stat-tile', statTiles), { y: 32, opacity: 0, duration: .7, ease: 'power2.out', stagger: .08, scrollTrigger: { start: at(statTiles, .85), toggleActions: 'play none none reverse' } });
  }

  // ---------- integrations grid: tiles rise in, left to right ----------
  const gridList = $('.grid1 .content');
  if (gridList && !calm) {
    gsap.from($$('.grid-item', gridList), { y: 24, opacity: 0, duration: .6, ease: 'power2.out', stagger: .06, scrollTrigger: { start: at(gridList, .85), toggleActions: 'play none none reverse' } });
  }

  // ---------- pipeline: the two lanes draw in when the diagram arrives (CSS does the motion) ----------
  if (!calm) $$('[data-pipeline]').forEach(pl => {
    pl.classList.add('is-armed');
    ScrollTrigger.create({ start: at(pl, .8), onEnter: () => pl.classList.add('is-in'), onLeaveBack: () => pl.classList.remove('is-in') });
  });

  // ---------- framed app mock-ups: lay the app out at its desktop width, then scale it to fit the frame ----------
  $$('[data-fit-always] .app').forEach(app => {
    const base = parseFloat(app.dataset.baseWidth || 86.5);   // the app's layout width, in rem
    const fitApp = () => {
      app.style.cssText = '';
      const w = app.offsetWidth, h = app.offsetHeight;
      const s = w / (base * rem());
      app.style.cssText = 'width:' + w / s + 'px;height:' + h / s + 'px;transform:scale(' + s + ');transform-origin:0 0';
    };
    fitApp();
    addEventListener('resize', fitApp);
  });

  // ---------- hero jump rows: the row under the pointer lights (2 x 2 grid: the other rows dim) ----------
  $$('.hero-services-nav-item, .hero-business-nav-item').forEach(item => {
    const scope = item.closest('.section');
    const others = item.classList.contains('hero-business-nav-item') ? $$('.hero-business-nav-item', scope).filter(o => o !== item) : [];
    item.addEventListener('pointerenter', e => { if (!byMouse(e)) return; item.classList.add('hovering'); item.classList.remove('disabled'); others.forEach(o => o.classList.add('disabled')); });
    item.addEventListener('pointerleave', () => { item.classList.remove('hovering'); others.forEach(o => o.classList.remove('disabled')); });
  });

  // ---------- article nav: light the section being read ----------
  $$('.article-nav').forEach(navEl => {
    const links = $$('a.item', navEl);
    links.forEach(a => {
      const section = anchorTarget(a.getAttribute('href'));
      if (!section) return;
      ScrollTrigger.create({
        trigger: section, start: 'top 40%', end: 'bottom 40%',
        onToggle: self => { if (self.isActive) links.forEach(l => l.toggleAttribute('active', l === a)); },
      });
    });
    links[0]?.setAttribute('active', '');
  });

  // ---------- accordions: height eases open and shut ----------
  $$('.article-accordion details, .guide-content .acc details').forEach(d => {
    const summary = $('summary', d), body = $('.desc, .panel', d);
    summary.addEventListener('click', e => {
      e.preventDefault();
      if (d.open) {
        gsap.to(body, { height: 0, paddingTop: 0, duration: calm ? 0 : .4, ease: 'power2.inOut', onComplete: () => { d.open = false; gsap.set(body, { clearProps: 'height,paddingTop' }); ScrollTrigger.refresh(); } });
        d.classList.remove('is-open');
      } else {
        d.open = true;
        d.classList.add('is-open');
        gsap.fromTo(body, { height: 0, paddingTop: 0 }, { height: 'auto', paddingTop: rem() * 2, duration: calm ? 0 : .4, ease: 'power2.inOut', onComplete: () => { gsap.set(body, { clearProps: 'height,paddingTop' }); ScrollTrigger.refresh(); } });
      }
    });
  });

  // ---------- research library: search box, source dropdown and chips narrow the list ----------
  $$('.article-list').forEach(list => {
    const items = $$('.article-list-item', list);
    const empty = $('.empty', list);
    const boxes = $$('input[type="checkbox"]', list);
    const searches = $$('.article-list-search input', list);
    const picked = group => boxes.filter(b => b.dataset.group === group && b.checked).map(b => b.value);

    const apply = () => {
      const q = (searches.find(i => i.value.trim())?.value || '').trim().toLowerCase();
      const want = { source: picked('source'), kind: picked('kind'), type: picked('type') };
      let shown = 0;
      items.forEach(item => {
        const has = (g, v) => (item.dataset[g] || '').split(',').includes(v);
        const ok = Object.entries(want).every(([g, vals]) => !vals.length || vals.some(v => has(g, v)))
          && (!q || item.textContent.toLowerCase().includes(q));
        item.toggleAttribute('hidden', !ok);
        if (!ok) return;
        item.classList.toggle('at-row-start', shown % 2 === 0);   // the left card of each row starts at column 3
        item.classList.toggle('at-first-row', shown < 2);
        shown++;
      });
      if (empty) empty.hidden = shown > 0;
      $$('.multiselect-dropdown', list).forEach(dd => {
        const chosen = $$('input:checked', dd);
        const label = $('.label', dd);
        if (label) label.textContent = !chosen.length ? 'All' : chosen.length === 1 ? chosen[0].dataset.label : chosen.length + ' selected';
      });
      boxes.forEach(b => b.closest('label')?.classList.toggle('checked', b.checked));
      ScrollTrigger.refresh();
    };

    boxes.forEach(b => b.addEventListener('change', apply));
    searches.forEach(input => input.addEventListener('input', () => {
      searches.forEach(other => { if (other !== input) other.value = input.value; });
      apply();
    }));
    $('.reset', list)?.addEventListener('click', () => {
      boxes.forEach(b => { b.checked = false; });
      searches.forEach(i => { i.value = ''; });
      apply();
    });

    // the source dropdown opens on click and closes on the next click outside
    $$('.multiselect-dropdown', list).forEach(dd => {
      const btn = $('.button', dd), panel = $('.panel', dd);
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const open = dd.classList.toggle('open');
        panel.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
      });
      panel.addEventListener('click', e => e.stopPropagation());
      document.addEventListener('click', () => { dd.classList.remove('open'); panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); });
    });

    // ≤1023px the filter column slides up as a sheet
    const setSheet = open => {
      list.classList.toggle('filters-open', open);
      open ? lenis.stop() : lenis.start();
    };
    $('.filter-open', list)?.addEventListener('click', () => setSheet(true));
    $('.sheet-head .close', list)?.addEventListener('click', () => setSheet(false));
    $('.full', list)?.addEventListener('click', e => { if (e.target === e.currentTarget) setSheet(false); });

    apply();
  });

  // ---------- guides hub: the search box narrows the list of systems ----------
  $$('.guides-hero .search input').forEach(input => {
    const rows = $$('.guides-system');
    const empty = $('.guides-empty');
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      let shown = 0;
      rows.forEach(r => {
        const ok = !q || r.textContent.toLowerCase().includes(q);
        r.hidden = !ok;
        if (ok) shown++;
      });
      if (empty) empty.hidden = shown > 0;
    });
  });

  // ---------- guide: the contents list follows the section being read ----------
  $$('.guide-toc').forEach(toc => {
    const links = $$('a', toc);
    links.forEach(a => {
      const section = anchorTarget(a.getAttribute('href'));
      if (!section) return;
      ScrollTrigger.create({
        trigger: section, start: 'top 30%', end: 'bottom 30%',
        onToggle: self => { if (self.isActive) links.forEach(l => l.toggleAttribute('active', l === a)); },
      });
    });
    links[0]?.setAttribute('active', '');
  });

  // ---------- page modules (the walkthrough, what Reclaim finds) register here ----------
  (window.reclaimModules || []).forEach(fn => fn({ $, $$, gsap, ScrollTrigger, lenis, rem, calm, at, docTop }));

  // ---------- boot: wait for fonts, then intro → hero ----------
  const boot = async () => {
    try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]); } catch (e) { /* ignore */ }
    splitAll();   // real font metrics now
    ScrollTrigger.refresh();
    await playIntro();
    heroIn();
    navLogos.forEach(logoIn);
    lenis.start();
    const target = anchorTarget(location.hash);
    if (target) requestAnimationFrame(() => scrollToTarget(target, true));
  };
  boot();
})();
