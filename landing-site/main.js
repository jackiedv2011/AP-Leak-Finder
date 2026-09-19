/* Reclaim — interaction + motion layer, shared by every page.
   Motion recipes mirror the reference (GSAP defaults: .5s power1.out).
   Each block only runs when its elements are on the page. */
(() => {
  gsap.registerPlugin(ScrollTrigger);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
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

  // ---------- nav clones (one per section, clipped by the section) ----------
  const tpl = $('#nav-tpl');
  const tplNav = tpl.content.firstElementChild;
  // the current page: its nav group stays lit, its submenu item stays at full strength
  const isHere = a => { const h = a.getAttribute('href'); return !!h && h.startsWith('/') && h === here; };
  if (folder) {
    $('.nav-bar', tplNav).classList.add('inFolder');
    $$('.nav-bar > .group', tplNav).forEach(g => g.classList.toggle('current', g.dataset.folder === folder));
    $$('.nav-bar-submenu', tplNav).forEach(s => s.classList.add('inFolder'));
    $$('.nav-bar-submenu .item', tplNav).forEach(a => { if (isHere(a)) { a.classList.add('current'); a.setAttribute('aria-current', 'page'); } });
  }
  $$('.nav-slot').forEach(slot => {
    const nav = tplNav.cloneNode(true);
    const theme = slot.dataset.theme;
    nav.setAttribute('theme', theme);
    $('.right .cta-button', nav).setAttribute('theme', theme === 'black' ? 'green' : 'black');
    slot.replaceWith(nav);
  });

  // ---------- mobile menu (≤1023px): one sheet for every nav clone, built from the nav template ----------
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
  const mmRowsHtml = $$('.nav-bar > .group', tplNav).map((g, i) => {
    const label = $('.label', g).textContent.trim();
    const items = $$('.nav-bar-submenu .item', g);
    if (!items.length) return '<li class="mm-item"><a class="mm-row"' + attrs($('a.link', g)).replace(' class="current"', '') + '>' + label + '</a></li>';
    const links = items.map(a => '<a' + attrs(a) + '>' + a.textContent.trim() + '</a>').join('');
    return '<li class="mm-item"><button type="button" class="mm-row" aria-expanded="false" aria-controls="mm-sub-' + i + '">' + label + '<span class="mm-plus" aria-hidden="true"></span></button>'
      + '<div class="mm-sub" id="mm-sub-' + i + '" inert><div class="inner">' + links + '</div></div></li>';
  }).join('');
  mm.innerHTML = '<div class="mm-top">' + $('.left', tplNav).innerHTML
    + '<button type="button" class="menu-toggle mm-close" aria-label="Close menu"><span class="bar"></span><span class="bar"></span></button></div>'
    + '<ul class="mm-list">' + mmRowsHtml + '</ul>'
    + '<div class="mm-foot"><a href="/audit?entry=sample" class="cta cta-button" size="large" theme="green"><span class="hover-loop"><span class="inner">Get Started</span></span></a></div>';
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

  // ---------- hover-loop (text / icon roll) ----------
  $$('.hover-loop').forEach(hl => {
    const first = $(':scope > .inner', hl);
    if (!first) return;
    const second = first.cloneNode(true);
    first.classList.add('first');
    second.classList.add('second');
    second.setAttribute('aria-hidden', 'true');
    second.removeAttribute('id');
    $$('[id]', second).forEach(el => el.removeAttribute('id'));
    hl.appendChild(second);
    gsap.set(second, { x: 0, y: 0 });

    const dir = ['up-right', 'down-right', 'right', 'left'].find(d => hl.classList.contains(d)) || 'up';
    const tl = gsap.timeline({ paused: true, defaults: { duration: parseFloat(hl.dataset.duration || .3), ease: 'power1.inOut' } });
    if (dir === 'up') tl.fromTo(first, { yPercent: 0 }, { yPercent: -100 }, 0).fromTo(second, { yPercent: 100 }, { yPercent: 0 }, 0);
    if (dir === 'right') tl.fromTo(first, { xPercent: 0 }, { xPercent: 100 }, 0).fromTo(second, { xPercent: -100 }, { xPercent: 0 }, 0);
    if (dir === 'left') tl.fromTo(first, { xPercent: 0 }, { xPercent: -100 }, 0).fromTo(second, { xPercent: 100 }, { xPercent: 0 }, 0);
    if (dir === 'up-right') tl.fromTo(first, { xPercent: 0, yPercent: 0 }, { xPercent: 100, yPercent: -100 }, 0).fromTo(second, { xPercent: -100, yPercent: 100 }, { xPercent: 0, yPercent: 0 }, 0);
    if (dir === 'down-right') tl.fromTo(first, { xPercent: 0, yPercent: 0 }, { xPercent: 100, yPercent: 100 }, 0).fromTo(second, { xPercent: -100, yPercent: -100 }, { xPercent: 0, yPercent: 0 }, 0);

    const trigger = hl.closest('a, button, .entry-item1, [data-hover-host]') || hl;
    trigger.addEventListener('mouseenter', () => tl.play());
    trigger.addEventListener('mouseleave', () => tl.reverse());
  });

  // ---------- button hover state ----------
  $$('.cta-button, .cta-button-square').forEach(btn => {
    const host = btn.closest('a, button, [data-hover-host]') || btn;
    host.addEventListener('mouseenter', () => btn.classList.add('hovering'));
    host.addEventListener('mouseleave', () => btn.classList.remove('hovering'));
  });

  // ---------- nav: hover state + submenus ----------
  const closeAllSubmenus = () => $$('.the-nav .group.open').forEach(g => g.classList.remove('active', 'open'));
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
  // scrolling with a submenu open leaves it stuck (only mouseleave closes it above, and the
  // pointer can stay put on a wheel scroll) — a scroll of any size should always close it
  addEventListener('scroll', closeAllSubmenus, { passive: true });

  // ---------- smooth scroll ----------
  const lenis = new Lenis({ lerp: .1 });
  window.lenis = lenis;
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();

  $$('.cta-scroll').forEach(a => a.addEventListener('click', e => { e.preventDefault(); lenis.scrollTo(0, { duration: 1 }); }));
  $$('a[href="#"]').forEach(a => a.addEventListener('click', e => e.preventDefault()));

  // in-page anchors (article nav, hero jump rows, guide contents)
  const anchorTarget = hash => { try { return hash.length > 1 ? $(hash) : null; } catch (e) { return null; } };
  const scrollToTarget = (el, immediate) => lenis.scrollTo(el, { offset: -rem() * 2.4, duration: immediate ? 0 : 1.2, immediate: !!immediate, force: true });
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

  // ---------- popup: start an audit / talk to us (front end only, nothing is sent) ----------
  const modal = $('#modal');
  if (modal) {
    const box = $('.modal-box', modal);
    const underlay = $('.underlay', modal);
    const card = $('.form-intro', modal);
    const success = $('.success-message', modal);
    const form = $('form', modal);
    const submitWrap = $('.wrapper-submit', modal);
    const errorBox = $('.error-message', modal);
    const MODES = {
      audit: { heading: 'Get<br>started', submit: 'Get Started' },
      talk: { heading: 'Talk<br>to us', submit: 'Talk to Us' },
    };
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
      gsap.set([card, success], { clearProps: 'opacity,transform' });
    };
    const focusables = () => $$('button, input, [tabindex="0"], a[href]', modal).filter(el => !el.closest('[hidden]') && el.tabIndex >= 0 && !el.closest('.dropdown-list'));

    const openModal = (mode, from) => {
      const m = MODES[mode] || MODES.audit;
      opener = from || document.activeElement;
      closeMenu(true, true);
      reset();
      $$('[data-modal-heading]', modal).forEach(h => { h.innerHTML = m.heading; });
      $$('[data-modal-submit]', modal).forEach(s => { s.textContent = m.submit; });
      modal.dataset.mode = mode;
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
        .to(underlay, { opacity: 0, duration: calm ? 0 : .2, ease: 'power1.out' }, calm ? 0 : .2)
        .to(box, { opacity: 0, scale: .8, duration: calm ? 0 : .4, ease: 'power1.out' }, 0);
    };
    window.reclaimModal = { open: openModal, close: closeModal };

    document.addEventListener('click', e => {
      const t = e.target.closest('[data-modal]');
      if (!t) return;
      e.preventDefault();
      openModal(t.dataset.modal, t);
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
      // no backend yet: show the confirmation the finished flow will show
      submitTimer = setTimeout(() => {
        submitWrap.classList.remove('loading');
        gsap.timeline()
          .to(card, { opacity: 0, scale: .96, duration: calm ? 0 : .2, ease: 'power1.in', onComplete: () => { card.hidden = true; success.hidden = false; } })
          .fromTo(success, { opacity: 0, scale: .96 }, { opacity: 1, scale: 1, duration: calm ? 0 : .4, ease: 'power1.out', onStart: () => $('.close', success).focus({ preventScroll: true }) });
      }, calm ? 0 : 900);
    });
  }

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

  // ---------- hero initial state (heading lines rise, image fades up, description follows) ----------
  const hero = $('.page > :first-child');
  const heroLinesOf = () => (hero ? $$('.heading1 .line', hero) : []);
  let heroLines = heroLinesOf();
  const heroWrap = hero ? $('.hero-home .bg-wrap .wrap', hero.parentNode) : null;
  const heroDesc = hero ? $(':scope .desc, :scope [data-hero-desc]', hero) : null;
  const heroJumps = hero ? $$('.hero-business-nav-item', hero) : [];
  gsap.set(heroLines, { x: -50, yPercent: 100 });
  if (heroWrap) gsap.set(heroWrap, { opacity: 0, yPercent: 20 });
  if (heroDesc) gsap.set(heroDesc, { opacity: 0, y: 50 });
  if (heroJumps.length) gsap.set(heroJumps, { opacity: 0, y: '20%' });

  const heroIn = () => {
    const tl = gsap.timeline();
    heroLines = heroLinesOf();
    if (heroLines.length) tl.fromTo(heroLines, { x: -50, yPercent: 100 }, { x: 0, yPercent: 0, stagger: .1 }, 0);
    if (heroWrap) tl.fromTo(heroWrap, { opacity: 0, yPercent: 20 }, { opacity: 1, yPercent: 0 }, .1);
    if (heroDesc) tl.fromTo(heroDesc, { opacity: 0, y: 50 }, { opacity: 1, y: 0 }, .5);
    if (heroJumps.length) tl.fromTo(heroJumps, { opacity: 0, y: '20%' }, { opacity: 1, y: 0, stagger: .2 }, .8);
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
  const hideLines = lines => gsap.set(lines, { x: -50, opacity: 0, overwrite: true });
  const showLines = (lines, delay = 0) => gsap.fromTo(lines, { x: -50, opacity: 0 }, { x: 0, opacity: 1, stagger: .1, delay, overwrite: true });
  const grouped = '.content-columns .columns [data-split], .entry-solutions .columns [data-split]';
  // (lines are looked up when used: a re-split replaces them)
  $$('[data-split="h2"]').filter(h => !h.matches(grouped)).forEach(h => {
    const lines = () => $$('.line', h);
    hideLines(lines());
    ScrollTrigger.create({ trigger: h, start: 'top bottom', onEnter: () => showLines(lines()), onLeaveBack: () => hideLines(lines()) });
  });
  // column headings stagger in together, .2s apart
  $$('.content-columns .columns, .entry-solutions .columns').forEach(cols => {
    const heads = () => $$('[data-split]', cols).map(h => $$('.line', h));
    heads().forEach(hideLines);
    ScrollTrigger.create({
      trigger: cols.closest('.section'), start: 'top bottom',
      onEnter: () => heads().forEach((lines, i) => showLines(lines, i * .2)),
      onLeaveBack: () => heads().forEach(hideLines),
    });
  });

  // ---------- rounded sections: scale up as they arrive ----------
  $$('.rounded-section.shouldAnimate').forEach(rs => {
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
  $$('.carousel1, .article-carousel').forEach(sec => {
    const tl = gsap.timeline({ paused: true });
    $$('.swiper .carousel-cell', sec).forEach((cell, i) => tl.from(cell, { duration: .7, x: innerWidth * .15, rotationY: -15 }, i * .1));
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

  // prev / next carousels (departments on the home page, article carousels on subpages)
  $$('.departments, .article-carousel').forEach(dp => {
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
    ScrollTrigger.create({ trigger: el, start: 'top 90%', onEnter: roll, onLeaveBack: reset });
  });

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
  $$('.laptop .app, [data-fit-always] .app').forEach(app => {
    const base = parseFloat(app.dataset.baseWidth || 86.5);   // the app's width inside the laptop at 1440px, in rem
    const fitApp = () => {
      app.style.cssText = '';
      const box = app.closest('[data-fit-always]');
      if (!mq.matches && !box) return;
      const w = app.offsetWidth, h = app.offsetHeight;
      const s = w / (base * rem());
      app.style.cssText = 'width:' + w / s + 'px;height:' + h / s + 'px;transform:scale(' + s + ');transform-origin:0 0';
    };
    fitApp();
    addEventListener('resize', fitApp);
  });

  // ---------- hero jump rows: hovering a row shows its picture (2 x 2 grid: the other rows dim) ----------
  $$('.hero-services-nav-item, .hero-business-nav-item').forEach(item => {
    const scope = item.closest('.section');
    const pic = scope && $(`.bg .wrap[data-idx="${item.dataset.idx}"]`, scope);
    const others = item.classList.contains('hero-business-nav-item') ? $$('.hero-business-nav-item', scope).filter(o => o !== item) : [];
    item.addEventListener('mouseenter', () => { item.classList.add('hovering'); item.classList.remove('disabled'); others.forEach(o => o.classList.add('disabled')); pic?.classList.add('is-hovering'); });
    item.addEventListener('mouseleave', () => { item.classList.remove('hovering'); others.forEach(o => o.classList.remove('disabled')); pic?.classList.remove('is-hovering'); });
  });

  // ---------- example cards: the grid straightens as it scrolls in, every other card rises ----------
  $$('.article-grid-cards .grid').forEach(grid => {
    const cells = $$('.animate-in', grid);
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const raised = cols % 2 === 0
      ? cells.filter((c, i) => i % 2 === 0)
      : cells.filter((c, i) => { const u = i % (cols * 2); return u < cols ? u % 2 === 0 : u % 2 === 1; });
    if (calm) return;
    const tl = gsap.timeline({ scrollTrigger: { trigger: grid, start: 'top bottom', end: 'top center', scrub: true } });
    tl.fromTo(raised, { y: '50%' }, { y: 0, ease: 'power1.inOut' }, 0)
      .fromTo(cells, { rotationY: -30 }, { rotationY: 0, ease: 'power1.inOut' }, 0);

    // each card leans toward the cursor (15deg, eased)
    $$('.mouse-3d-rotate', grid).forEach(el => {
      const target = $('.rotate', el);
      const s = { x: 0, y: 0, tx: 0, ty: 0, live: false };
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        s.tx = (e.clientX - r.left) / r.width * 2 - 1;
        s.ty = (e.clientY - r.top) / r.height * 2 - 1;
        s.live = true;
      });
      el.addEventListener('mouseleave', () => { s.tx = 0; s.ty = 0; });
      gsap.ticker.add(() => {
        if (!s.live) return;
        s.x += (s.tx - s.x) * .05;
        s.y += (s.ty - s.y) * .05;
        target.style.transform = `rotateY(${s.x * 15}deg) rotateX(${s.y * -15}deg)`;
        if (!s.tx && !s.ty && Math.abs(s.x) < 1e-3 && Math.abs(s.y) < 1e-3) { s.live = false; target.style.transform = ''; }
      });
    });
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

  // ---------- page modules (library filters, guide contents) register here ----------
  (window.reclaimModules || []).forEach(fn => fn({ $, $$, gsap, ScrollTrigger, lenis, rem, calm }));

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
