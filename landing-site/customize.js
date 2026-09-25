// Customize: the same Appearance and Accent controls as the workspace's
// Customize sheet, saved under the same keys, so a choice made on either side
// carries over. Loaded in <head> so the theme lands before first paint.
(function () {
  var THEME_KEY = 'reclaim.theme.v1';
  var PREFS_KEY = 'reclaim.preferences.v1';
  var ACCENTS = [
    { id: 'green', label: 'Reclaim green', swatch: '#00fd74' },
    { id: 'blue', label: 'Blue', swatch: '#00d1ff' },
    { id: 'pink', label: 'Pink', swatch: '#ff7ef2' },
    { id: 'orange', label: 'Orange', swatch: '#ff6838' },
    { id: 'purple', label: 'Purple', swatch: '#b874fc' },
    { id: 'mono', label: 'Monochrome', swatch: 'linear-gradient(135deg, #0a0a0a 50%, #fff 50%)' },
  ];
  var THEMES = [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']];
  var html = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  function read(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function write(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode: this page only */ } }
  function prefs() { try { var p = JSON.parse(read(PREFS_KEY) || '{}'); return p && typeof p === 'object' ? p : {}; } catch { return {}; } }

  function themeChoice() { var t = read(THEME_KEY); return t === 'light' || t === 'dark' || t === 'system' ? t : 'system'; }
  function accent() { var a = prefs().accent; return ACCENTS.some(function (x) { return x.id === a; }) ? a : 'green'; }
  // The site was designed light; "system" follows the OS like the workspace does.
  function resolved(choice) { return choice === 'system' ? (media && !media.matches ? 'dark' : 'light') : choice; }

  function apply() {
    html.dataset.theme = resolved(themeChoice());
    html.dataset.accent = accent();
  }
  apply();
  if (media && media.addEventListener) media.addEventListener('change', function () { if (themeChoice() === 'system') apply(); });
  window.addEventListener('storage', function (e) { if (e.key === THEME_KEY || e.key === PREFS_KEY) { apply(); render(); } });

  var sheet, lastFocus;
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  var CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  function render() {
    if (!sheet) return;
    var t = themeChoice(), a = accent();
    sheet.querySelectorAll('[data-theme-choice]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.themeChoice === t)); });
    sheet.querySelectorAll('[data-accent-choice]').forEach(function (b) {
      var on = b.dataset.accentChoice === a;
      b.setAttribute('aria-pressed', String(on));
      b.firstChild.innerHTML = on ? CHECK : '';
      b.firstChild.style.color = b.dataset.accentChoice === 'mono' ? '#888' : '#000';
    });
    sheet.querySelector('[data-accent-name]').textContent = ACCENTS.filter(function (x) { return x.id === a; })[0].label;
  }

  function build() {
    sheet = document.createElement('div');
    sheet.className = 'cz';
    sheet.hidden = true;
    sheet.innerHTML =
      '<div class="cz-overlay" data-cz-close></div>' +
      '<div class="cz-sheet" role="dialog" aria-modal="true" aria-labelledby="cz-title" aria-describedby="cz-desc">' +
        '<div class="cz-grab" aria-hidden="true"></div>' +
        '<div class="cz-head"><div><h2 id="cz-title">Customize</h2><p id="cz-desc">How the site looks for you. Saved in this browser.</p></div>' +
          '<button type="button" class="cz-icon-btn" data-cz-close aria-label="Close">' + CLOSE + '</button></div>' +
        '<div class="cz-body">' +
          '<section class="cz-pref" aria-labelledby="cz-theme"><div class="cz-pref-head"><h3 id="cz-theme">Appearance</h3></div><div class="cz-theme-cards">' +
            THEMES.map(function (t) { return '<button type="button" class="cz-theme-card" data-theme-choice="' + t[0] + '"><span class="cz-theme-preview" data-look="' + t[0] + '" aria-hidden="true"><i></i><b><i></i><i></i><i></i></b></span>' + t[1] + '</button>'; }).join('') +
          '</div></section>' +
          '<section class="cz-pref" aria-labelledby="cz-accent"><div class="cz-pref-head"><h3 id="cz-accent">Accent</h3><p data-accent-name></p></div><div class="cz-swatches">' +
            ACCENTS.map(function (x) { return '<button type="button" class="cz-swatch" data-accent-choice="' + x.id + '" aria-label="' + x.label + '" title="' + x.label + '"><i style="background:' + x.swatch + '"></i></button>'; }).join('') +
          '</div></section>' +
        '</div>' +
        '<div class="cz-foot"><button type="button" class="cz-btn" data-variant="ghost" data-cz-reset>Reset to defaults</button><button type="button" class="cz-btn" data-variant="dark" data-cz-close>Done</button></div>' +
      '</div>';
    document.body.appendChild(sheet);
    sheet.addEventListener('click', function (e) {
      var t = e.target.closest('button, [data-cz-close]');
      if (!t) return;
      if (t.hasAttribute('data-cz-close')) return close();
      if (t.dataset.themeChoice) write(THEME_KEY, t.dataset.themeChoice);
      else if (t.dataset.accentChoice) { var p = prefs(); p.accent = t.dataset.accentChoice; write(PREFS_KEY, JSON.stringify(p)); }
      else if (t.hasAttribute('data-cz-reset')) { write(THEME_KEY, 'system'); var q = prefs(); q.accent = 'green'; write(PREFS_KEY, JSON.stringify(q)); }
      apply(); render();
    });
    sheet.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      if (e.key !== 'Tab') return;
      var f = sheet.querySelectorAll('.cz-sheet button');
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
  }

  function open(from) {
    if (!sheet) build();
    lastFocus = from || document.activeElement;
    render();
    sheet.hidden = false;
    html.classList.add('cz-open');
    requestAnimationFrame(function () { sheet.dataset.state = 'open'; sheet.querySelector('.cz-theme-card[aria-pressed="true"]').focus({ preventScroll: true }); });
  }
  function close() {
    if (!sheet || sheet.hidden) return;
    sheet.dataset.state = 'closed';
    html.classList.remove('cz-open');
    setTimeout(function () { sheet.hidden = true; }, 220);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-customize]');
    if (t) { e.preventDefault(); open(t); }
  });
})();
