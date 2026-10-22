/* Atlas — etkileşim ve hareket.
   Tek bir requestAnimationFrame döngüsü: sabit 3B kaplama (hero → ton),
   tedavi görüntüleyicisi, akan şerit ve kaydırmaya bağlı ayrıntılar. */
(function () {
  'use strict';

  var doc = document, root = doc.documentElement;
  root.classList.add('js');

  var $ = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var smooth = function (t) { return t * t * (3 - 2 * t); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var I18N = window.AtlasI18n || { t: function () { return ''; }, set: function () {}, lang: 'tr' };

  /* ── Başlıkları satırlara böl (maskeli açılış) ───────────────────── */
  function split(el) {
    var parts = el.innerHTML.split(/<br\s*\/?>/i);
    el.innerHTML = parts.map(function (p, i) {
      return '<span class="ln" style="--i:' + i + '"><span class="ln__in">' + p.trim() + '</span></span>';
    }).join('');
  }
  $$('[data-split]').forEach(split);

  /* ── Görünür olunca aç ───────────────────────────────────────────── */
  var revealables = $$('[data-reveal], [data-split]');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });
    var startReveal = function () { revealables.forEach(function (el) { io.observe(el); }); };
    // yazı tipleri yerleşince başla: ilk satırlar titremeden açılsın
    if (doc.fonts && doc.fonts.ready) {
      var started = false;
      var go = function () { if (!started) { started = true; startReveal(); } };
      doc.fonts.ready.then(go);
      setTimeout(go, 900);
    } else startReveal();
  } else {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ── Üst çubuk, menü, dil ────────────────────────────────────────── */
  var hdr = $('#hdr'), dock = $('.dock');
  var themed = $$('main [data-theme], footer[data-theme]');
  var navLinks = $$('.nav a');
  var menuBtn = $('.menu-btn'), menu = $('#menu');

  function setMenu(open) {
    root.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-hidden', String(!open));
    doc.body.style.overflow = open ? 'hidden' : '';
    if (open) hdr.classList.remove('is-hidden');
  }
  menuBtn.addEventListener('click', function () { setMenu(!root.classList.contains('menu-open')); });
  $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });

  $$('[data-lang]').forEach(function (b) {
    b.addEventListener('click', function () { I18N.set(b.getAttribute('data-lang')); });
  });

  function onScroll(y, dy) {
    var vh = window.innerHeight;
    hdr.classList.toggle('is-solid', y > 24);
    if (!root.classList.contains('menu-open')) {
      if (dy > 4 && y > vh * 0.5) hdr.classList.add('is-hidden');
      else if (dy < -4 || y < vh * 0.5) hdr.classList.remove('is-hidden');
    }
    // çubuğun altındaki bölümün temasını al
    var probe = 30, theme = 'ink', currentId = '';
    for (var i = 0; i < themed.length; i++) {
      var r = themed[i].getBoundingClientRect();
      if (r.top <= probe && r.bottom > probe) theme = themed[i].getAttribute('data-theme');
      if (themed[i].id && r.top <= vh * 0.45) currentId = themed[i].id;
    }
    if (root.classList.contains('menu-open')) theme = 'ink';
    if (hdr.getAttribute('data-theme') !== theme) hdr.setAttribute('data-theme', theme);
    navLinks.forEach(function (a) { a.classList.toggle('is-current', a.getAttribute('href') === '#' + currentId); });
    if (dock) dock.classList.toggle('is-on', y > vh * 0.7);
  }

  /* ── Akan şerit ──────────────────────────────────────────────────── */
  var track = $('.ticker__track'), tickX = 0, tickHalf = 0;
  function buildTicker() {
    if (!track) return;
    var items = (track.getAttribute('data-items') || '').split('|');
    var html = items.map(function (s) { return '<span>' + s + '</span>'; }).join('');
    track.innerHTML = html + html + html + html;
    tickHalf = track.scrollWidth / 4;
  }
  buildTicker();

  /* ── İşaretçi ────────────────────────────────────────────────────── */
  var ptr = { x: 0, y: 0, tx: 0, ty: 0, live: false };
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    ptr.live = true;
    ptr.tx = (e.clientX / window.innerWidth) * 2 - 1;
    ptr.ty = -((e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });

  /* ── Sabit sahne: zirkonyum kaplama ──────────────────────────────── */
  var Scene = window.AtlasScene;
  var stageEl = $('#stage'), crownCanvas = $('#crown');
  var crown = null;
  if (Scene && crownCanvas) {
    crown = Scene.create(crownCanvas);
    if (crown && !crown.use('crown')) crown = null;
  }
  if (!crown) root.classList.add('no-gl');

  var steps = $$('.step'), railEl = $('.story__rail'), railTicks = railEl ? $$('i', railEl) : [];
  var anchors = [$('.hero'), $('.story__head')].concat(steps, [$('.shade')]);
  var KEYS = [];
  function buildKeys() {
    var asp = window.innerWidth / window.innerHeight;
    var fit = function (s, frac) { return Math.min(s, frac * asp / 0.62); };   // kaplamanın genişliği ≈ 0.62 × ölçek × yükseklik
    if (window.innerWidth < 900) {
      var s = fit(0.62, 0.64);
      KEYS = [
        { cx: 0, cy: 0.225, scale: s,        pitch: 0.66,  spin: 0.24, back: 0 },
        { cx: 0, cy: 0.215, scale: s * 0.92, pitch: 0.46,  spin: 0.22, back: 0 },
        { cx: 0, cy: 0.215, scale: s * 0.95, pitch: -1.05, spin: 0.12, back: 0 },
        { cx: 0, cy: 0.215, scale: s * 0.92, pitch: 0.34,  spin: 0.16, back: 1 },
        { cx: 0, cy: 0.215, scale: s,        pitch: 1.12,  spin: 0.10, back: 0 },
        { cx: 0, cy: 0.215, scale: s * 0.92, pitch: 0.26,  spin: 0.20, back: 0 },
        { cx: 0, cy: 0.285, scale: s * 0.80, pitch: 0.56,  spin: 0.30, back: 0 }
      ];
    } else {
      var L = -0.24 * asp, R = 0.245 * asp;
      KEYS = [
        { cx: R, cy: 0.045, scale: fit(0.94, 0.40), pitch: 0.66,  spin: 0.22, back: 0 },
        { cx: L, cy: 0.0,   scale: fit(0.80, 0.36), pitch: 0.46,  spin: 0.22, back: 0 },
        { cx: L, cy: 0.0,   scale: fit(0.86, 0.38), pitch: -1.05, spin: 0.12, back: 0 },
        { cx: L, cy: 0.0,   scale: fit(0.84, 0.38), pitch: 0.34,  spin: 0.16, back: 1 },
        { cx: L, cy: 0.0,   scale: fit(0.94, 0.40), pitch: 1.12,  spin: 0.10, back: 0 },
        { cx: L, cy: 0.0,   scale: fit(0.84, 0.38), pitch: 0.26,  spin: 0.20, back: 0 },
        { cx: L, cy: 0.0,   scale: fit(0.90, 0.40), pitch: 0.56,  spin: 0.30, back: 0 }
      ];
    }
  }
  buildKeys();

  var A1 = [0.937, 0.898, 0.812];
  var st = { cx: 0, cy: 0, scale: 0.01, pitch: 0.5, spin: 0.2, back: 0, yaw: 0.6, shade: A1.slice(), shadeT: A1.slice(), ready: false };
  var stageVisible = true;

  function stageTarget() {
    var vh = window.innerHeight, cs = [], i;
    for (i = 0; i < anchors.length; i++) {
      var r = anchors[i].getBoundingClientRect();
      cs.push(r.top + r.height / 2 - vh / 2);
    }
    // etkin adım
    var act = -1, best = vh * 0.5;
    for (i = 0; i < steps.length; i++) {
      var d = Math.abs(cs[i + 2]);
      if (d < best) { best = d; act = i; }
    }
    steps.forEach(function (el, k) { el.classList.toggle('is-active', k === act); });
    if (railEl) {
      railEl.classList.toggle('is-on', act >= 0);
      railTicks.forEach(function (el, k) { el.classList.toggle('is-on', k === act); });
    }

    if (cs[0] >= 0) return KEYS[0];
    for (i = 0; i < cs.length - 1; i++) if (cs[i] <= 0 && cs[i + 1] > 0) break;
    if (i >= cs.length - 1) return KEYS[KEYS.length - 1];
    var t = smooth(clamp((-cs[i] / (cs[i + 1] - cs[i]) - 0.18) / 0.64, 0, 1));
    var a = KEYS[i], b = KEYS[i + 1];
    return {
      cx: lerp(a.cx, b.cx, t), cy: lerp(a.cy, b.cy, t), scale: lerp(a.scale, b.scale, t),
      pitch: lerp(a.pitch, b.pitch, t), spin: lerp(a.spin, b.spin, t), back: lerp(a.back, b.back, t)
    };
  }

  function drawStage(dt, dy, time) {
    var tg = stageTarget();
    if (!st.ready) {       // ilk kare: yerine otur, ölçek açılışla büyüsün
      st.cx = tg.cx; st.cy = tg.cy; st.pitch = tg.pitch + 0.5; st.scale = tg.scale * 0.72; st.ready = true;
    }
    var k = 1 - Math.exp(-dt * 4.2);
    st.cx = lerp(st.cx, tg.cx, k); st.cy = lerp(st.cy, tg.cy, k);
    st.scale = lerp(st.scale, tg.scale, k); st.pitch = lerp(st.pitch, tg.pitch, k);
    st.back = lerp(st.back, tg.back, k);
    st.yaw += (reduce ? 0 : tg.spin * dt) + dy * 0.0021;
    for (var i = 0; i < 3; i++) st.shade[i] = lerp(st.shade[i], st.shadeT[i], 1 - Math.exp(-dt * 6));
    crown.render({
      cx: st.cx, cy: st.cy, scale: st.scale,
      yaw: st.yaw + ptr.x * 0.22, pitch: st.pitch - ptr.y * 0.10,
      shade: st.shade, px: ptr.x, py: ptr.y, back: st.back, alpha: 1, t: 0, time: time
    });
  }

  /* ton seçimi */
  var swatches = $$('.swatch');
  function parseShade(el) { return el.getAttribute('data-shade').split(',').map(Number); }
  swatches.forEach(function (b) {
    b.addEventListener('click', function () {
      swatches.forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      st.shadeT = parseShade(b);
    });
    b.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') st.shadeT = parseShade(b); });
    b.addEventListener('pointerleave', function (e) {
      if (e.pointerType !== 'mouse') return;
      var on = swatches.filter(function (o) { return o.getAttribute('aria-pressed') === 'true'; })[0];
      if (on) st.shadeT = parseShade(on);
    });
  });

  /* ── Tedavi görüntüleyicisi ──────────────────────────────────────── */
  var WHITE = [0.965, 0.955, 0.93];
  var VIEW = {
    zirkonyum: { yaw: 0.55, pitch: 0.20,  scale: 0.54, sway: 0.50, dur: 2.6, hold: 2.4, loop: 'pp',  shade: A1 },
    lamine:    { yaw: 0.50, pitch: 0.04,  scale: 0.62, sway: 0.36, dur: 2.4, hold: 2.4, loop: 'pp',  shade: WHITE },
    emax:      { yaw: 0.45, pitch: 0.10,  scale: 0.86, sway: 0.55, dur: 3.6, hold: 0.3, loop: 'pp',  shade: [0.955, 0.93, 0.87], back: 1 },
    implant:   { yaw: 0.50, pitch: 0.16,  scale: 0.54, sway: 0.60, dur: 2.8, hold: 2.4, loop: 'pp',  shade: A1 },
    kanal:     { yaw: 0.24, pitch: 0.05,  scale: 0.64, sway: 0.16, dur: 7.5, hold: 2.6, loop: 'cut', shade: A1 },
    bleaching: { yaw: 0.0,  pitch: -0.10, scale: 0.37, sway: 0.28, dur: 3.4, hold: 2.4, loop: 'cut', shade: A1 },
    ortodonti: { yaw: 0.0,  pitch: -0.08, scale: 0.37, sway: 0.34, dur: 4.2, hold: 2.6, loop: 'cut', shade: A1 },
    cocuk:     { yaw: 0.50, pitch: 0.88,  scale: 0.84, sway: 0.50, dur: 3.2, hold: 2.4, loop: 'cut', shade: WHITE },
    diseti:    { yaw: 0.0,  pitch: -0.10, scale: 0.37, sway: 0.28, dur: 3.8, hold: 2.6, loop: 'cut', shade: A1 }
  };

  var vEl = $('.viewer');
  var vw = {
    canvas: $('#viewer-canvas'), r: null, tried: false, visible: false,
    scene: 'zirkonyum', t: 0, mode: 'rest', timer: 0.5, alpha: 0, playing: !reduce,
    uy: 0, up: 0, drag: null, scrubbing: false,
    tabs: $$('.vtab'), infos: $$('.vinfo'), play: $('.vplay'), scrub: $('.vscrub'), phases: [], cuts: []
  };

  function initViewer() {
    if (vw.tried) return;
    vw.tried = true;
    if (Scene && vw.canvas) vw.r = Scene.create(vw.canvas);
    if (vw.r && !vw.r.use(vw.scene)) vw.r = null;
    if (!vw.r) vEl.classList.add('no-gl-viewer');
  }

  function selectScene(name) {
    if (!VIEW[name]) return;
    vw.scene = name;
    vw.tabs.forEach(function (b) {
      var on = b.getAttribute('data-scene') === name;
      b.setAttribute('aria-pressed', String(on));
      if (on && b.scrollIntoView && window.innerWidth < 900) {
        var p = b.parentNode; p.scrollTo({ left: b.offsetLeft - 20, behavior: 'smooth' });
      }
    });
    vw.infos.forEach(function (a) {
      var on = a.getAttribute('data-scene') === name;
      a.classList.toggle('is-active', on);
      if (on) {
        vw.phases = $$('.phases li', a);
        vw.cuts = (a.getAttribute('data-cuts') || '0').split(',').map(Number);
      }
    });
    vw.t = reduce ? 1 : 0; vw.mode = 'rest'; vw.timer = 0.45; vw.alpha = 0; vw.uy = 0; vw.up = 0;
    if (!reduce) setPlaying(true);
    if (vw.r && !vw.r.use(name)) { vw.r = null; vEl.classList.add('no-gl-viewer'); }
  }

  function setPlaying(on) {
    vw.playing = on;
    vw.play.setAttribute('aria-pressed', String(on));
  }

  vw.tabs.forEach(function (b) { b.addEventListener('click', function () { selectScene(b.getAttribute('data-scene')); }); });
  $$('[data-goto]').forEach(function (a) { a.addEventListener('click', function () { selectScene(a.getAttribute('data-goto')); }); });

  vw.play.addEventListener('click', function () {
    if (vw.playing) { setPlaying(false); return; }
    if (vw.t >= 0.999) vw.t = 0;
    vw.mode = 'in'; setPlaying(true);
  });
  vw.scrub.addEventListener('input', function () {
    vw.scrubbing = true; setPlaying(false);
    vw.t = Number(vw.scrub.value) / 1000; vw.alpha = 1;
    vEl.classList.add('is-touched');
  });
  ['change', 'pointerup', 'blur'].forEach(function (ev) { vw.scrub.addEventListener(ev, function () { vw.scrubbing = false; }); });

  /* sürükleyerek çevir */
  if (vw.canvas) {
    vw.canvas.addEventListener('pointerdown', function (e) {
      vw.drag = { x: e.clientX, y: e.clientY, uy: vw.uy, up: vw.up };
      vw.canvas.classList.add('is-drag');
      vEl.classList.add('is-touched');
      try { vw.canvas.setPointerCapture(e.pointerId); } catch (err) {}
    });
    vw.canvas.addEventListener('pointermove', function (e) {
      if (!vw.drag) return;
      vw.uy = vw.drag.uy + (e.clientX - vw.drag.x) * 0.009;
      vw.up = clamp(vw.drag.up + (e.clientY - vw.drag.y) * 0.006, -1.1, 1.1);
    });
    var endDrag = function () { vw.drag = null; vw.canvas.classList.remove('is-drag'); };
    vw.canvas.addEventListener('pointerup', endDrag);
    vw.canvas.addEventListener('pointercancel', endDrag);
  }

  function stepViewer(dt) {
    var V = VIEW[vw.scene];
    if (vw.playing && !vw.scrubbing) {
      if (vw.mode === 'rest') {
        vw.alpha = Math.min(1, vw.alpha + dt * 3.2);
        vw.timer -= dt; if (vw.timer <= 0) vw.mode = 'in';
      } else if (vw.mode === 'in') {
        vw.alpha = Math.min(1, vw.alpha + dt * 3.2);
        vw.t += dt / V.dur;
        if (vw.t >= 1) { vw.t = 1; vw.mode = 'hold'; vw.timer = V.hold; }
      } else if (vw.mode === 'hold') {
        vw.timer -= dt;
        if (vw.timer <= 0) vw.mode = V.loop === 'pp' ? 'out' : 'fade';
      } else if (vw.mode === 'out') {
        vw.t -= dt / (V.dur * 0.75);
        if (vw.t <= 0) { vw.t = 0; vw.mode = 'rest'; vw.timer = V.loop === 'pp' ? 0.9 : 0.5; }
      } else if (vw.mode === 'fade') {
        vw.alpha -= dt * 2.6;
        if (vw.alpha <= 0) { vw.alpha = 0; vw.t = 0; vw.mode = 'rest'; vw.timer = 0.55; }
      }
    } else {
      vw.alpha = Math.min(1, vw.alpha + dt * 3.2);
    }
    if (!vw.scrubbing) vw.scrub.value = Math.round(vw.t * 1000);
    vw.scrub.style.setProperty('--p', (vw.t * 100).toFixed(1) + '%');
    for (var i = 0; i < vw.phases.length; i++) {
      var on = vw.t >= vw.cuts[i] - 0.0001 && (i === vw.phases.length - 1 || vw.t < vw.cuts[i + 1]);
      vw.phases[i].classList.toggle('is-on', on);
    }
  }

  function drawViewer(dt, time) {
    stepViewer(dt);
    var V = VIEW[vw.scene];
    var asp = vw.canvas.clientWidth / Math.max(1, vw.canvas.clientHeight);
    var sway = reduce || vw.drag ? 0 : Math.sin(time * 0.42) * V.sway;
    if (!vw.drag) vw.swayNow = lerp(vw.swayNow || 0, sway, 1 - Math.exp(-dt * 3));
    vw.r.render({
      cx: 0, cy: 0.035, scale: V.scale * Math.min(1, asp / 0.98),
      yaw: V.yaw + (vw.swayNow || 0) + vw.uy, pitch: V.pitch + vw.up,
      shade: V.shade, px: ptr.x * 0.6, py: ptr.y * 0.6,
      back: V.back || 0, backX: V.back ? (smooth(vw.t) * 2 - 1) * 0.95 : 0,
      alpha: vw.alpha, t: vw.t, time: time
    });
  }

  selectScene('zirkonyum');

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { stageVisible = es[0].isIntersecting; }, { rootMargin: '10% 0px' }).observe(stageEl);
    new IntersectionObserver(function (es) {
      vw.visible = es[0].isIntersecting;
    }, { rootMargin: '0px' }).observe($('.viewer__stage'));
    // sahneyi yaklaşırken hazırla: derleme kaydırmayı kesmesin
    var warm = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { initViewer(); warm.disconnect(); }
    }, { rootMargin: '120% 0px' });
    warm.observe(vEl);
  } else { initViewer(); vw.visible = true; }

  /* randevu düğmesi: seçili tedaviyi forma taşı */
  var form = $('#book');
  $$('[data-book]').forEach(function (a) {
    a.addEventListener('click', function () { if (form && form.tx) form.tx.value = vw.scene; });
  });

  /* ── Süreç çizgisi ───────────────────────────────────────────────── */
  var plist = $('.plist'), pbar = $('.plist__bar');
  /* ── Yorum şeridi ────────────────────────────────────────────────── */
  var rail = $('.rail'), railProg = $('.rail__prog i');
  if (rail) {
    var rd = null;
    rail.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse') return;
      rd = { x: e.clientX, left: rail.scrollLeft, moved: false };
    });
    window.addEventListener('pointermove', function (e) {
      if (!rd) return;
      var dx = e.clientX - rd.x;
      if (Math.abs(dx) > 4 && !rd.moved) { rd.moved = true; rail.classList.add('is-drag'); }
      if (rd.moved) rail.scrollLeft = rd.left - dx;
    });
    window.addEventListener('pointerup', function () {
      if (!rd) return;
      rd = null; rail.classList.remove('is-drag');
    });
    var updateRail = function () {
      var max = rail.scrollWidth - rail.clientWidth;
      var vis = rail.clientWidth / rail.scrollWidth;
      railProg.style.setProperty('--p', (vis + (1 - vis) * (max > 0 ? rail.scrollLeft / max : 0)).toFixed(3));
    };
    rail.addEventListener('scroll', updateRail, { passive: true });
    updateRail();
    $$('.rbtn').forEach(function (b) {
      b.addEventListener('click', function () {
        var q = $('.quote', rail);
        rail.scrollBy({ left: Number(b.getAttribute('data-dir')) * (q ? q.offsetWidth : 320), behavior: reduce ? 'auto' : 'smooth' });
      });
    });
  }

  /* ── Sık sorulanlar ──────────────────────────────────────────────── */
  $$('.faq__item').forEach(function (item, i) {
    var btn = $('.faq__q', item), panel = $('.faq__a', item);
    panel.id = 'faq-' + (i + 1);
    btn.setAttribute('aria-controls', panel.id);
    btn.addEventListener('click', function () {
      var open = !item.classList.contains('is-open');
      item.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  });

  /* ── Randevu formu ───────────────────────────────────────────────────
     Sunucu üzerinden açıldıysa (window.ATLAS) online randevu: boş saatler
     canlı gelir, talep panele düşer. Statik barındırmada WhatsApp'a gider. */
  var ATLAS = window.ATLAS || null;
  var WA = (ATLAS && ATLAS.clinic && ATLAS.clinic.wa) || '905461774377';
  if (ATLAS && ATLAS.clinic) {
    $$('a[href^="tel:"]').forEach(function (a) { a.href = 'tel:' + ATLAS.clinic.tel; });
    $$('a[href^="https://wa.me/"]').forEach(function (a) { a.href = 'https://wa.me/' + WA; });
  }

  if (form) {
    var online = !!(ATLAS && ATLAS.booking), cfg = null, picked = '';
    var slotBox = $('.tslots', form), msg = $('.form__msg', form), sendBtn = $('.form__send', form);
    var showMsg = function (html, kind) { msg.innerHTML = html; msg.className = 'form__msg' + (kind ? ' is-' + kind : ''); msg.hidden = !html; };
    var bad = function (el, on) { var f = el.closest('.field, .consent'); if (f) f.classList.toggle('is-bad', on); };
    var escH = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

    var serviceId = function () {
      var o = form.tx.options[form.tx.selectedIndex];
      return o ? Number(o.getAttribute('data-sid')) : 0;
    };

    function loadSlots() {
      picked = '';
      if (!form.date.value) { slotBox.innerHTML = '<p>' + I18N.t('bk.pick') + '</p>'; return; }
      slotBox.innerHTML = '<p>' + I18N.t('bk.loading') + '</p>';
      var q = '?date=' + form.date.value + '&service=' + serviceId() + (form.doctor.value ? '&doctor=' + form.doctor.value : '');
      fetch(ATLAS.api + '/slots' + q).then(function (r) { return r.json(); }).then(function (r) {
        var list = r.slots || [];
        slotBox.innerHTML = list.length ? list.map(function (t) { return '<button type="button" aria-pressed="false">' + t + '</button>'; }).join('')
          : '<p>' + I18N.t('bk.none') + '</p>';
        $$('button', slotBox).forEach(function (b) {
          b.addEventListener('click', function () {
            picked = b.textContent;
            $$('button', slotBox).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
            bad(slotBox, false);
          });
        });
      }).catch(function () { slotBox.innerHTML = '<p>' + I18N.t('bk.e.net') + '</p>'; });
    }

    if (online) {
      fetch(ATLAS.api + '/config').then(function (r) { return r.json(); }).then(function (c) {
        cfg = c;
        if (!c.booking.enabled || !c.services.length || !c.doctors.length) return;
        // sabit seçenekleri hizmetlerle eşle; olmayanları gizle, panelde eklenenleri ekle
        var byKey = {};
        c.services.forEach(function (sv) { byKey[sv.key] = sv; });
        $$('option', form.tx).forEach(function (o) {
          var sv = byKey[o.value];
          if (sv) { o.setAttribute('data-sid', sv.id); delete byKey[o.value]; } else o.remove();
        });
        Object.keys(byKey).forEach(function (k) {
          var o = doc.createElement('option'); o.value = k; o.textContent = byKey[k].name; o.setAttribute('data-sid', byKey[k].id);
          form.tx.appendChild(o);
        });
        c.doctors.forEach(function (d) {
          var o = doc.createElement('option'); o.value = d.id; o.textContent = d.name; form.doctor.appendChild(o);
        });
        form.date.min = c.booking.today;
        var mx = new Date(c.booking.today + 'T12:00:00'); mx.setDate(mx.getDate() + c.booking.days);
        form.date.max = mx.toISOString().slice(0, 10);
        form.classList.add('is-online');
        loadSlots();
        ['tx', 'doctor', 'date'].forEach(function (n) { form[n].addEventListener('change', loadSlots); });
      }).catch(function () {});
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.name.value.trim();
      bad(form.name, !name);
      if (!name) { form.name.focus(); return; }

      if (!form.classList.contains('is-online')) {
        var tx = form.tx.options[form.tx.selectedIndex].textContent.trim();
        var text = I18N.t('wa.msg').replace('{name}', name).replace('{tx}', tx);
        var note = form.note.value.trim();
        if (note) text += '\n' + note;
        window.open('https://wa.me/' + WA + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
        return;
      }

      var phone = form.phone.value.replace(/\D/g, '').slice(-10);
      var err = '';
      if (!/^5\d{9}$/.test(phone)) { err = 'bk.e.phone'; bad(form.phone, true); form.phone.focus(); }
      else if (!form.date.value || !picked) { err = 'bk.e.time'; bad(slotBox, true); }
      else if (!form.consent.checked) { err = 'bk.e.consent'; bad(form.consent, true); }
      if (err) { showMsg(I18N.t(err), 'err'); return; }

      sendBtn.disabled = true; showMsg('');
      fetch(ATLAS.api + '/book', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name, phone: '0' + phone, service: serviceId(), doctor: form.doctor.value ? Number(form.doctor.value) : null,
          date: form.date.value, time: picked, note: form.note.value.trim(), consent: true, website: form.website.value
        })
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (res) {
        sendBtn.disabled = false;
        if (!res.ok) { showMsg(escH(res.j.error || I18N.t('bk.e.net')), 'err'); if (res.j.error) loadSlots(); return; }
        var d = new Date(res.j.date + 'T12:00:00').toLocaleDateString(I18N.lang === 'tr' ? 'tr-TR' : I18N.lang, { weekday: 'long', day: 'numeric', month: 'long' });
        showMsg('<b>' + I18N.t('bk.ok.t') + '</b>' + escH(I18N.t('bk.ok.p').replace('{date}', d).replace('{time}', res.j.time)
          .replace('{doctor}', res.j.doctor).replace('{service}', res.j.service || '')), 'ok');
        form.note.value = ''; form.consent.checked = false;
        loadSlots();
      }).catch(function () { sendBtn.disabled = false; showMsg(I18N.t('bk.e.net'), 'err'); });
    });
    ['name', 'phone', 'consent'].forEach(function (n) {
      if (form[n]) form[n].addEventListener('input', function () { bad(form[n], false); });
    });
    if (form.consent) form.consent.addEventListener('change', function () { bad(form.consent, false); });
  }

  var yearEl = $('#year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ── Dil değişince ───────────────────────────────────────────────── */
  /* hekim biyografileri: sunucu üç dili de öznitelik olarak verir */
  function bios() {
    $$('[data-bio-tr]').forEach(function (p) {
      p.textContent = p.getAttribute('data-bio-' + I18N.lang) || p.getAttribute('data-bio-tr');
    });
  }
  if (I18N.lang !== 'tr') bios();

  doc.addEventListener('atlas:lang', function () {
    bios();
    $$('[data-split]').forEach(split);
    buildTicker();
    if (rail) rail.scrollLeft = 0;
  });

  /* ── Ana döngü ───────────────────────────────────────────────────── */
  var ftrWord = $('.ftr__word');
  var last = performance.now(), time = 0, sy = window.scrollY, vel = 0, first = true;
  var perf = { acc: 0, n: 0 };

  function tune(r, dt) {      // yavaş cihazda çözünürlüğü düşür
    perf.acc += dt; perf.n++;
    if (perf.n < 30) return;
    var avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0;
    var q = r.getQuality();
    if (avg > 0.036 && q > 0.5) r.setQuality(Math.max(0.5, q - 0.17));
  }

  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    var y = window.scrollY, dy = y - sy; sy = y;
    vel = lerp(vel, dy / Math.max(dt, 0.001), 0.15);
    if (dy !== 0 || first) { onScroll(y, dy); first = false; }

    if (ptr.live) { ptr.x = lerp(ptr.x, ptr.tx, 1 - Math.exp(-dt * 5)); ptr.y = lerp(ptr.y, ptr.ty, 1 - Math.exp(-dt * 5)); }
    else if (!reduce) { ptr.x = Math.sin(time * 0.33) * 0.55; ptr.y = Math.cos(time * 0.27) * 0.35; }

    if (crown && stageVisible) { drawStage(dt, dy, time); tune(crown, dt); }
    else if (vw.r && vw.visible) { drawViewer(dt, time); tune(vw.r, dt); }

    if (track && tickHalf > 0 && !reduce) {
      tickX -= (34 + Math.min(900, Math.abs(vel)) * 0.22) * dt;
      if (tickX <= -tickHalf) tickX += tickHalf;
      track.style.transform = 'translate3d(' + tickX.toFixed(2) + 'px,0,0)';
    }

    if (plist && pbar) {
      var pr = plist.getBoundingClientRect();
      if (pr.bottom > 0 && pr.top < window.innerHeight)
        pbar.style.setProperty('--p', clamp((window.innerHeight * 0.62 - pr.top) / pr.height, 0, 1).toFixed(3));
    }
    if (ftrWord && !reduce) {
      var fr = ftrWord.getBoundingClientRect();
      if (fr.top < window.innerHeight)
        ftrWord.style.transform = 'translate3d(0,' + (clamp((fr.bottom - window.innerHeight) / fr.height, 0, 1) * 22).toFixed(2) + '%,0)';
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  var rz;
  window.addEventListener('resize', function () {
    clearTimeout(rz);
    rz = setTimeout(function () {
      buildKeys(); buildTicker();
      if (crown) crown.resize();
      if (vw.r) vw.r.resize();
      first = true;
    }, 120);
  });
})();
