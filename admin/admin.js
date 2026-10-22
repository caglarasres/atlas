/* Atlas Panel — randevu, hasta, hekim ve site içeriği yönetimi.
   Bağımlılıksız tek sayfa uygulaması; adres çubuğundaki #/… yolu görünümü seçer. */
(function () {
  'use strict';

  /* ── Yardımcılar ───────────────────────────────────────────────────── */
  var app = document.getElementById('app');
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  var pad = function (n) { return String(n).padStart(2, '0'); };
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return ymd(new Date()); }
  function addDays(s, n) { var d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
  function fmtDate(s, opt) { return new Date(s.slice(0, 10) + 'T12:00:00').toLocaleDateString('tr-TR', opt || { day: 'numeric', month: 'long', year: 'numeric' }); }
  function fmtDay(s) { return fmtDate(s, { weekday: 'long', day: 'numeric', month: 'long' }); }
  function fmtShort(s) { return fmtDate(s, { day: 'numeric', month: 'short' }) + ' ' + s.slice(11, 16); }
  function toMin(hm) { var p = hm.split(':'); return +p[0] * 60 + +p[1]; }
  function toHM(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function money(n) { return (Number(n) || 0).toLocaleString('tr-TR') + ' ₺'; }
  function phone(p) { p = String(p || ''); return /^0\d{10}$/.test(p) ? p.slice(0, 4) + ' ' + p.slice(4, 7) + ' ' + p.slice(7, 9) + ' ' + p.slice(9) : p; }
  function stripTags(s) { var d = document.createElement('div'); d.innerHTML = s; return d.textContent.replace(/\s+/g, ' ').trim(); }

  function api(method, path, body, bg) {
    var opt = { method: method, headers: {}, credentials: 'same-origin' };
    if (bg) opt.headers['X-Background'] = '1';      // arka plan yenilemesi: oturum süresini uzatmaz
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch('/api' + path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && path.indexOf('/auth/') !== 0) { expired = true; boot(); throw new Error('Oturum süresi doldu.'); }
        if (!r.ok) { var e = new Error(j.error || 'Hata (' + r.status + ')'); e.status = r.status; e.data = j; throw e; }
        return j;
      });
    });
  }

  var expired = false, toastT;
  function toast(msg, err) {
    var t = $('#toast');
    t.textContent = msg; t.className = 'on' + (err ? ' err' : '');
    clearTimeout(toastT); toastT = setTimeout(function () { t.className = ''; }, err ? 4200 : 2400);
  }
  function oops(e) { toast(e.message || String(e), true); }

  var STATUS = {
    pending: 'Onay bekliyor', confirmed: 'Onaylı', arrived: 'Geldi', done: 'Tamamlandı', cancelled: 'İptal', noshow: 'Gelmedi'
  };
  var SOURCE = { online: 'Web sitesi', panel: 'Panel', phone: 'Telefon' };
  var ROLE = { admin: 'Yönetici', staff: 'Sekreter / resepsiyon', doctor: 'Hekim' };
  var DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  function badge(st) { return '<span class="badge st-' + st + '">' + esc(STATUS[st] || st) + '</span>'; }
  function statusSelect(a) {
    return '<select class="js-st" data-id="' + a.id + '" aria-label="Durum">' + Object.keys(STATUS).map(function (k) {
      return '<option value="' + k + '"' + (k === a.status ? ' selected' : '') + '>' + STATUS[k] + '</option>';
    }).join('') + '</select>';
  }
  function bindStatus(root, after) {
    $$('.js-st', root).forEach(function (s) {
      s.addEventListener('click', function (e) { e.stopPropagation(); });
      s.addEventListener('change', function () {
        api('PUT', '/appointments/' + s.dataset.id, { status: s.value })
          .then(function () { toast('Durum güncellendi'); refreshBadge(); if (after) after(); }).catch(oops);
      });
    });
  }

  var ICON = {
    home: '<path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.5 3.5 5.2"/>',
    doc: '<circle cx="12" cy="7" r="4"/><path d="M4 21c.8-4.4 4-7 8-7s7.2 2.6 8 7M12 14v4M10 16h4"/>',
    tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
    web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z"/>',
    cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', left: '<path d="M15 6l-6 6 6 6"/>', right: '<path d="M9 6l6 6-6 6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
  };
  function ic(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[n] + '</svg>'; }

  /* ── Durum ─────────────────────────────────────────────────────────── */
  var S = { user: null, doctors: [], services: [], settings: {} };
  var isAdmin = function () { return S.user && S.user.role === 'admin'; };
  function loadRefs() {
    return Promise.all([api('GET', '/doctors'), api('GET', '/services'), api('GET', '/settings')]).then(function (r) {
      S.doctors = r[0].items; S.services = r[1].items; S.settings = r[2];
    });
  }
  var activeDoctors = function () { return S.doctors.filter(function (d) { return d.active; }); };
  var docName = function (d) { return d ? d.title + ' ' + d.name : '—'; };
  var findDoc = function (id) { return S.doctors.filter(function (d) { return d.id === id; })[0]; };
  var findSvc = function (id) { return S.services.filter(function (s) { return s.id === id; })[0]; };

  /* ── Giriş / ilk kurulum ───────────────────────────────────────────── */
  function boot() {
    closeModal();
    api('GET', '/auth/state').then(function (st) {
      if (st.setup) return renderSetup();
      if (!st.user) return renderLogin();
      S.user = st.user;
      return loadRefs().then(renderShell);
    }).catch(function (e) { app.innerHTML = '<p class="boot">Sunucuya bağlanılamadı: ' + esc(e.message) + '</p>'; });
  }

  function authForm(title, sub, fields, btn, onSubmit) {
    app.innerHTML = '<div class="auth"><form class="card form" novalidate><div><h1>' + title + '</h1><p>' + sub + '</p></div>' + fields +
      '<div class="alert" hidden></div><button class="btn btn--p" type="submit">' + btn + '</button></form></div>';
    var f = $('form', app), al = $('.alert', f);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      al.hidden = true;
      var b = $('button[type=submit]', f); b.disabled = true;
      onSubmit(f).then(boot).catch(function (err) { if (err && err.quiet) return; al.textContent = err.message; al.hidden = false; b.disabled = false; });
    });
    var first = $('input', f); if (first) first.focus();
  }
  function renderLogin() {
    var sub = expired ? 'Güvenliğiniz için oturumunuz kapandı (30 dk hareketsizlik). Yeniden giriş yapın.' : 'Klinik yönetim paneline giriş yapın.';
    expired = false;
    authForm('Atlas Panel', sub,
      '<label class="f"><span>E-posta</span><input name="email" type="email" autocomplete="username" required></label>' +
      '<label class="f"><span>Parola</span><input name="password" type="password" autocomplete="current-password" required></label>',
      'Giriş yap', function (f) {
        return api('POST', '/auth/login', { email: f.email.value, password: f.password.value }).then(function (r) {
          if (r.mfa) { renderMfa(r.ticket); throw { quiet: true }; }
        });
      });
  }
  function renderMfa(ticket) {
    authForm('Doğrulama kodu', 'Kimlik doğrulama uygulamanızdaki 6 haneli kodu girin.',
      '<label class="f"><span>Kod</span><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" required></label>',
      'Doğrula', function (f) {
        return api('POST', '/auth/mfa', { ticket: ticket, code: f.code.value }).catch(function (e) {
          if (e.data && e.data.restart) { renderLogin(); throw { quiet: true }; }
          throw e;
        });
      });
  }
  function renderSetup() {
    authForm('İlk kurulum', 'Henüz hesap yok. İlk yönetici hesabını oluşturun; diğer kullanıcıları sonra panelden eklersiniz.',
      '<label class="f"><span>Ad soyad</span><input name="name" autocomplete="name" required></label>' +
      '<label class="f"><span>E-posta</span><input name="email" type="email" autocomplete="username" required></label>' +
      '<label class="f"><span>Parola</span><input name="password" type="password" autocomplete="new-password" minlength="12" required><small>En az 12 karakter; başka yerde kullanmadığınız bir parola seçin.</small></label>',
      'Hesabı oluştur', function (f) { return api('POST', '/auth/setup', { name: f.name.value, email: f.email.value, password: f.password.value }); });
  }

  /* ── Kabuk ─────────────────────────────────────────────────────────── */
  var NAV = [
    ['', 'Gösterge', 'home'], ['takvim', 'Takvim', 'cal'], ['randevular', 'Randevular', 'list'], ['hastalar', 'Hastalar', 'users'], ['islemler', 'Yapılan işlemler', 'receipt'],
    null,
    ['analiz', 'Analiz', 'chart', 1], ['hekimler', 'Hekimler', 'doc', 1], ['hizmetler', 'Tedaviler ve fiyatlar', 'tag', 1], ['site', 'Siteyi düzenle', 'web', 1], ['ayarlar', 'Ayarlar', 'cog']
  ];
  function renderShell() {
    app.innerHTML =
      '<div class="mob"><button class="btn btn--ghost js-menu" aria-label="Menü">' + ic('menu') + '</button><b>Atlas</b><a class="btn btn--sm" href="/" target="_blank">Site</a></div>' +
      '<div class="shell"><aside class="side"><a class="brand" href="#/"><b>Atlas</b><span>Panel</span></a><nav class="nav">' +
      NAV.map(function (n) {
        if (!n) return '<hr>';
        if (n[3] && !isAdmin()) return '';
        return '<a href="#/' + n[0] + '" data-r="' + n[0] + '">' + ic(n[2]) + '<span>' + n[1] + '</span>' + (n[0] === 'randevular' ? '<span class="badge badge--n js-pend" hidden></span>' : '') + '</a>';
      }).join('') +
      '<hr><a href="/" target="_blank" rel="noopener">' + ic('ext') + '<span>Siteyi aç</span></a></nav>' +
      '<div class="side__foot"><b>' + esc(S.user.name) + '</b><span class="mut">' + ROLE[S.user.role] + '</span>' +
      '<div class="row"><button class="btn btn--sm js-out">Çıkış</button></div></div></aside>' +
      '<main class="main" id="view"></main></div>';
    $('.js-out').addEventListener('click', function () { api('POST', '/auth/logout', {}).then(boot); });
    $('.js-menu').addEventListener('click', function () { document.body.classList.toggle('nav-open'); });
    route();
    refreshBadge();
  }

  function refreshBadge(bg) {
    api('GET', '/appointments?status=pending&from=' + today(), undefined, bg).then(function (r) {
      var b = $('.js-pend'); if (!b) return;
      b.textContent = r.items.length; b.hidden = !r.items.length;
    }).catch(function () {});
  }

  var current = '', bgRefresh = false;
  function route() {
    var view = $('#view');
    if (!view) return;
    document.body.classList.remove('nav-open');
    var h = location.hash.replace(/^#\/?/, ''), parts = h.split('/'), name = parts[0];
    current = h;
    $$('.nav a[data-r]').forEach(function (a) { a.classList.toggle('on', a.dataset.r === name || (name === 'hasta' && a.dataset.r === 'hastalar')); });
    var V = { '': vDash, takvim: vCal, randevular: vAppts, hastalar: vPatients, hasta: vPatient, islemler: vRecords, analiz: vAnalytics, hekimler: vDoctors, hizmetler: vServices, site: vSite, ayarlar: vSettings }[name];
    if (!V) { location.hash = '#/'; return; }
    if (!bgRefresh) view.innerHTML = '<p class="boot">Yükleniyor…</p>';
    Promise.resolve(V(view, parts.slice(1))).catch(oops);
  }
  window.addEventListener('hashchange', function () {
    var siteToSite = /^site/.test(current) && /^#\/site/.test(location.hash);   // görsel ↔ liste: değişiklikler korunur
    if (unsaved && !siteToSite) {
      if (!confirm('Yayınlanmamış değişiklikler var. Çıkarsanız kaybolacak. Çıkılsın mı?')) { history.back(); return; }
      CE.pending = {};
    }
    unsaved = false; route();
  });
  var unsaved = false;
  window.addEventListener('beforeunload', function (e) { if (unsaved) { e.preventDefault(); e.returnValue = ''; } });

  // yeni online randevular görünsün: gösterge ve takvim dakikada bir yenilenir
  setInterval(function () {
    if (document.hidden || $('.modal') || !S.user) return;
    var n = current.split('/')[0];
    if (n === '' || n === 'takvim') { bgRefresh = true; route(); bgRefresh = false; }
    refreshBadge(true);
  }, 60000);

  function top(title, sub, actions) {
    return '<div class="top"><div><h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div><div class="row">' + (actions || '') + '</div></div>';
  }

  /* ── Gösterge ──────────────────────────────────────────────────────── */
  function vDash(v) {
    return api('GET', '/dashboard', undefined, bgRefresh).then(function (d) {
      var st = d.stats;
      var row = function (a, withDate) {
        return '<li class="click" data-id="' + a.id + '"><span class="t">' + (withDate ? fmtShort(a.start) : a.start.slice(11, 16)) + '</span>' +
          '<span class="dot" style="background:' + esc(a.doctor_color || '#999') + '"></span>' +
          '<span class="who"><b>' + esc(a.patient_name) + '</b><small>' + esc(a.service_name || 'Randevu') + ' · ' + esc((a.doctor_title || '') + ' ' + (a.doctor_name || '')) + '</small></span>' +
          (withDate ? '<button class="btn btn--sm btn--p js-ok" data-id="' + a.id + '">Onayla</button><button class="btn btn--sm btn--d js-no" data-id="' + a.id + '">Reddet</button>' : statusSelect(a)) + '</li>';
      };
      v.innerHTML = top('Merhaba, ' + esc(S.user.name.split(' ')[0]), fmtDay(d.today),
        '<button class="btn btn--p js-new">' + ic('plus') + 'Yeni randevu</button>') +
        '<div class="grid g4">' +
        '<div class="card stat"><span>Bugün</span><b>' + st.today + '</b></div>' +
        '<div class="card stat"><span>Önümüzdeki 7 gün</span><b>' + st.week + '</b></div>' +
        '<div class="card stat"><span>Onay bekleyen</span><b>' + st.pending + '</b></div>' +
        '<div class="card stat"><span>Hasta · son 30 gün yeni</span><b>' + st.patients + ' <small class="mut" style="font-size:1rem">+' + st.newPatients30 + '</small></b></div>' +
        '</div><div class="grid g2" style="margin-top:1.1rem">' +
        '<section class="card"><div class="card__h"><h2>Bugünün randevuları</h2><a class="btn btn--sm" href="#/takvim">Takvim</a></div>' +
        (d.todayList.length ? '<ul class="list">' + d.todayList.map(function (a) { return row(a); }).join('') + '</ul>' : '<p class="empty">Bugün için randevu yok.</p>') + '</section>' +
        '<section class="card"><div class="card__h"><h2>Web sitesinden gelen talepler</h2><span class="badge st-pending">' + d.pending.length + '</span></div>' +
        (d.pending.length ? '<ul class="list">' + d.pending.map(function (a) { return row(a, true); }).join('') + '</ul>' : '<p class="empty">Onay bekleyen talep yok.</p>') + '</section></div>';

      $('.js-new', v).addEventListener('click', function () { openAppt({}); });
      $$('li.click', v).forEach(function (li) {
        li.addEventListener('click', function (e) {
          if (e.target.closest('button,select')) return;
          var a = d.todayList.concat(d.pending).filter(function (x) { return x.id === +li.dataset.id; })[0];
          openAppt(a);
        });
      });
      bindStatus(v, route);
      $$('.js-ok, .js-no', v).forEach(function (b) {
        b.addEventListener('click', function () {
          var ok = b.classList.contains('js-ok');
          if (!ok && !confirm('Bu randevu talebi iptal edilsin mi? Hastayı telefonla bilgilendirmeyi unutmayın.')) return;
          api('PUT', '/appointments/' + b.dataset.id, { status: ok ? 'confirmed' : 'cancelled' })
            .then(function () { toast(ok ? 'Randevu onaylandı' : 'Talep reddedildi'); refreshBadge(); route(); }).catch(oops);
        });
      });
    });
  }

  /* ── Takvim (gün görünümü, hekim başına sütun) ─────────────────────── */
  var calDate = today(), calDoc = 0;
  function vCal(v, args) {
    if (args[0] && /^\d{4}-\d{2}-\d{2}$/.test(args[0])) calDate = args[0];
    if (!calDoc && S.user.role === 'doctor' && S.user.doctor_id) calDoc = S.user.doctor_id;
    var docs = activeDoctors().filter(function (d) { return !calDoc || d.id === calDoc; });
    return api('GET', '/appointments?from=' + calDate + '&to=' + calDate, undefined, bgRefresh).then(function (r) {
      var wd = new Date(calDate + 'T12:00:00').getDay();
      var closed = (S.settings.closed_dates || []).indexOf(calDate) >= 0;
      // görünen saat aralığı: hekim saatleri ve randevuları kapsasın
      var lo = 8 * 60, hi = 20 * 60;
      docs.forEach(function (d) { (d.hours[wd] || []).forEach(function (h) { lo = Math.min(lo, toMin(h[0])); hi = Math.max(hi, toMin(h[1])); }); });
      r.items.forEach(function (a) { lo = Math.min(lo, toMin(a.start.slice(11))); hi = Math.max(hi, toMin(a.end.slice(11))); });
      lo = Math.floor(lo / 60) * 60; hi = Math.ceil(hi / 60) * 60;
      var STEP = 15, RH = 26, rows = (hi - lo) / STEP;

      var head = '<div class="cal__corner"></div>' + docs.map(function (d) {
        var n = r.items.filter(function (a) { return a.doctor_id === d.id && a.status !== 'cancelled'; }).length;
        return '<div class="cal__dh"><span class="dot" style="background:' + esc(d.color) + '"></span>' + esc(docName(d)) + '<span class="badge">' + n + '</span></div>';
      }).join('');
      var times = '<div class="cal__times">' + Array.from({ length: rows }, function (_, i) {
        var m = lo + i * STEP; return '<div>' + (m % 60 === 0 ? toHM(m) : '') + '</div>';
      }).join('') + '</div>';
      var nowM = new Date().getHours() * 60 + new Date().getMinutes();
      var cols = docs.map(function (d) {
        var hrs = (d.hours[wd] || []).map(function (h) { return [toMin(h[0]), toMin(h[1])]; });
        var slots = Array.from({ length: rows }, function (_, i) {
          var m = lo + i * STEP, on = !closed && hrs.some(function (h) { return m >= h[0] && m < h[1]; });
          return '<div class="cal__slot' + (m % 60 === 0 ? ' h' : '') + (on ? '' : ' off') + '" data-t="' + toHM(m) + '" data-d="' + d.id + '" title="' + toHM(m) + (on ? '' : ' — çalışma saati dışı') + '"></div>';
        }).join('');
        var evs = r.items.filter(function (a) { return a.doctor_id === d.id; }).map(function (a) {
          var s = toMin(a.start.slice(11)), e = toMin(a.end.slice(11));
          return '<div class="ev is-' + a.status + '" data-id="' + a.id + '" style="--c:' + esc(a.doctor_color || '#888') + ';top:' + ((s - lo) / STEP * RH + 1) + 'px;height:' + Math.max(RH - 2, (e - s) / STEP * RH - 2) + 'px">' +
            '<b>' + esc(a.patient_name) + '</b><small>' + a.start.slice(11, 16) + '–' + a.end.slice(11, 16) + ' · ' + esc(a.service_name || '') + (a.status === 'pending' ? ' · onay bekliyor' : '') + '</small></div>';
        }).join('');
        var now = calDate === today() && nowM >= lo && nowM < hi ? '<div class="cal__now" style="top:' + ((nowM - lo) / STEP * RH) + 'px"></div>' : '';
        return '<div class="cal__col">' + slots + evs + now + '</div>';
      }).join('');

      v.innerHTML = top('Takvim', fmtDay(calDate) + (closed ? ' · <span class="badge st-cancelled">Klinik kapalı</span>' : ''),
        '<button class="btn js-prev" aria-label="Önceki gün">' + ic('left') + '</button>' +
        '<button class="btn js-today">Bugün</button>' +
        '<button class="btn js-next" aria-label="Sonraki gün">' + ic('right') + '</button>' +
        '<input type="date" class="js-date" value="' + calDate + '" style="width:auto">' +
        '<select class="js-doc" style="width:auto"><option value="0">Tüm hekimler</option>' + activeDoctors().map(function (d) {
          return '<option value="' + d.id + '"' + (d.id === calDoc ? ' selected' : '') + '>' + esc(docName(d)) + '</option>'; }).join('') + '</select>' +
        '<button class="btn btn--p js-new">' + ic('plus') + 'Randevu</button>') +
        (docs.length ? '<div class="card"><div class="cal" style="--rowh:' + RH + 'px;grid-template-columns:4rem repeat(' + docs.length + ', minmax(180px, 1fr))">' + head + times + cols + '</div></div>'
          : '<div class="card"><p class="empty">Aktif hekim yok. ' + (isAdmin() ? '<a href="#/hekimler">Hekim ekleyin</a>.' : '') + '</p></div>') +
        '<p class="mut" style="font-size:.85rem;margin-top:.8rem">Boş bir saate tıklayarak randevu ekleyin. Taralı alanlar hekimin çalışma saatleri dışındadır.</p>';

      var go = function (d) { location.hash = '#/takvim/' + d; };
      $('.js-prev', v).onclick = function () { go(addDays(calDate, -1)); };
      $('.js-next', v).onclick = function () { go(addDays(calDate, 1)); };
      $('.js-today', v).onclick = function () { go(today()); };
      $('.js-date', v).onchange = function (e) { if (e.target.value) go(e.target.value); };
      $('.js-doc', v).onchange = function (e) { calDoc = +e.target.value; route(); };
      $('.js-new', v).onclick = function () { openAppt({ date: calDate, doctor_id: calDoc || undefined }); };
      $$('.cal__slot', v).forEach(function (s) {
        s.addEventListener('click', function () { openAppt({ date: calDate, time: s.dataset.t, doctor_id: +s.dataset.d }); });
      });
      $$('.ev', v).forEach(function (e) {
        e.addEventListener('click', function () { openAppt(r.items.filter(function (a) { return a.id === +e.dataset.id; })[0]); });
      });
      // ilk açılışta mesai başlangıcına kaydır
      var cal = $('.cal', v), firstOn = $('.cal__slot:not(.off)', v);
      if (cal && firstOn) cal.scrollTop = Math.max(0, firstOn.offsetTop - 60);
    });
  }

  /* ── Randevu listesi ───────────────────────────────────────────────── */
  var apf = { from: today(), to: '', doctor: '', status: '', q: '' };
  function vAppts(v) {
    v.innerHTML = top('Randevular', 'Tüm randevular; filtreleyin, durumunu değiştirin.', '<button class="btn btn--p js-new">' + ic('plus') + 'Yeni randevu</button>') +
      '<div class="card"><div class="card__b row">' +
      '<label class="f"><span>Başlangıç</span><input type="date" name="from" value="' + apf.from + '"></label>' +
      '<label class="f"><span>Bitiş</span><input type="date" name="to" value="' + apf.to + '"></label>' +
      '<label class="f"><span>Hekim</span><select name="doctor"><option value="">Tümü</option>' + S.doctors.map(function (d) {
        return '<option value="' + d.id + '"' + (String(d.id) === apf.doctor ? ' selected' : '') + '>' + esc(docName(d)) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Durum</span><select name="status"><option value="">Tümü</option>' + Object.keys(STATUS).map(function (k) {
        return '<option value="' + k + '"' + (k === apf.status ? ' selected' : '') + '>' + STATUS[k] + '</option>'; }).join('') + '</select></label>' +
      '<label class="f grow"><span>Hasta ara</span><input type="search" name="q" value="' + esc(apf.q) + '" placeholder="Ad ya da telefon"></label>' +
      '</div><div class="scroll js-out"></div></div>';
    $('.js-new', v).onclick = function () { openAppt({}); };
    var t;
    $$('.card__b [name]', v).forEach(function (el) {
      el.addEventListener('input', function () { apf[el.name] = el.value; clearTimeout(t); t = setTimeout(load, 250); });
    });
    function load() {
      var qs = Object.keys(apf).filter(function (k) { return apf[k]; }).map(function (k) { return k + '=' + encodeURIComponent(apf[k]); }).join('&');
      return api('GET', '/appointments?' + qs).then(function (r) {
        var out = $('.js-out', v);
        if (!r.items.length) { out.innerHTML = '<p class="empty">Bu filtreyle randevu yok.</p>'; return; }
        out.innerHTML = '<table class="tbl"><thead><tr><th>Tarih</th><th>Hasta</th><th class="hide-m">Telefon</th><th>Hekim</th><th class="hide-m">Hizmet</th><th class="hide-m">Kaynak</th><th>Durum</th></tr></thead><tbody>' +
          r.items.map(function (a) {
            return '<tr class="click" data-id="' + a.id + '"><td class="mono">' + fmtShort(a.start) + '</td><td><b>' + esc(a.patient_name) + '</b></td>' +
              '<td class="hide-m mono">' + esc(phone(a.patient_phone)) + '</td><td><span class="row"><span class="dot" style="background:' + esc(a.doctor_color || '#999') + '"></span>' + esc((a.doctor_title || '') + ' ' + (a.doctor_name || '—')) + '</span></td>' +
              '<td class="hide-m">' + esc(a.service_name || '') + '</td><td class="hide-m">' + esc(SOURCE[a.source]) + '</td><td>' + statusSelect(a) + '</td></tr>';
          }).join('') + '</tbody></table>';
        $$('tr.click', out).forEach(function (tr) {
          tr.addEventListener('click', function (e) {
            if (e.target.closest('select')) return;
            openAppt(r.items.filter(function (a) { return a.id === +tr.dataset.id; })[0]);
          });
        });
        bindStatus(out);
      }).catch(oops);
    }
    return load();
  }

  /* ── Modal ─────────────────────────────────────────────────────────── */
  function openModal(title, body, foot, wide) {
    closeModal();
    var m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = '<div class="modal__box' + (wide ? ' modal__box--w' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<div class="modal__h"><h2>' + esc(title) + '</h2><button class="btn btn--ghost js-x" aria-label="Kapat">✕</button></div>' +
      '<div class="modal__b">' + body + '</div>' + (foot ? '<div class="modal__f">' + foot + '</div>' : '') + '</div>';
    document.body.appendChild(m);
    m.addEventListener('mousedown', function (e) { if (e.target === m) closeModal(); });
    $('.js-x', m).onclick = closeModal;
    var f = $('input:not([type=hidden]), select, textarea', $('.modal__b', m)); if (f) setTimeout(function () { f.focus(); }, 30);
    return m;
  }
  function closeModal() { var m = $('.modal'); if (m) m.remove(); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  /* hasta seçici (ara ya da yeni) */
  function patientPicker(root, initial, onChange) {
    var box = $('.js-pp', root), picked = initial && initial.id ? initial : null;
    function draw() {
      if (picked) {
        box.innerHTML = '<div class="picked"><span><b>' + esc(picked.name) + '</b> <span class="mut mono">' + esc(phone(picked.phone)) + '</span></span>' +
          '<span class="row"><a class="btn btn--sm" href="#/hasta/' + picked.id + '">Kart</a><button type="button" class="btn btn--sm js-chg">Değiştir</button></span></div>';
        $('.js-chg', box).onclick = function () { picked = null; draw(); onChange(null); $('input', box).focus(); };
        $('a', box).onclick = closeModal;
        return;
      }
      box.innerHTML = '<div class="ac"><input type="search" class="js-q" placeholder="Hasta adı ya da telefon yazın…" autocomplete="off"><div class="ac__list" hidden></div></div>' +
        '<div class="g2 grid js-newp" style="margin-top:.6rem;gap:.6rem"><label class="f"><span>Yeni hasta adı</span><input name="patient_name" autocomplete="off"></label>' +
        '<label class="f"><span>Telefon</span><input name="patient_phone" inputmode="tel" autocomplete="off" placeholder="05xx xxx xx xx"></label></div>' +
        '<small class="mut">Kayıtlı hastayı arayın; yoksa ad ve telefonla yeni hasta oluşturulur.</small>';
      var q = $('.js-q', box), list = $('.ac__list', box), t;
      q.addEventListener('input', function () {
        clearTimeout(t);
        if (q.value.trim().length < 2) { list.hidden = true; return; }
        t = setTimeout(function () {
          api('GET', '/patients?q=' + encodeURIComponent(q.value.trim())).then(function (r) {
            list.innerHTML = r.items.length ? r.items.slice(0, 12).map(function (p, i) {
              return '<button type="button" data-i="' + i + '">' + esc(p.name) + '<small class="mono">' + esc(phone(p.phone)) + '</small></button>';
            }).join('') : '<div class="empty" style="padding:.8rem">Bulunamadı — aşağıya yeni hasta olarak yazın.</div>';
            list.hidden = false;
            $$('button', list).forEach(function (b) { b.onclick = function () { picked = r.items[+b.dataset.i]; draw(); onChange(picked); }; });
            var nm = $('[name=patient_name]', box);
            if (!r.items.length && !nm.value) nm.value = /\d/.test(q.value) ? '' : q.value.trim();
          });
        }, 200);
      });
    }
    draw();
    return { get: function () { return picked; } };
  }

  function openAppt(a) {
    a = a || {};
    var isNew = !a.id;
    var doctors = activeDoctors();
    var docId = a.doctor_id || (S.user.role === 'doctor' && S.user.doctor_id) || (doctors[0] && doctors[0].id);
    var svcs = S.services.filter(function (s) { return s.active || s.id === a.service_id; });
    var date = a.start ? a.start.slice(0, 10) : (a.date || today());
    var time = a.start ? a.start.slice(11, 16) : (a.time || '');
    var dur = a.start ? toMin(a.end.slice(11)) - toMin(a.start.slice(11)) : '';
    var m = openModal(isNew ? 'Yeni randevu' : 'Randevu',
      '<form class="form" novalidate>' +
      (a.source === 'online' && a.status === 'pending' ? '<div class="alert alert--w">Web sitesinden gelen talep. Hastayı arayıp teyit ettikten sonra durumu “Onaylı” yapın.</div>' : '') +
      '<div class="f"><span>Hasta</span><div class="js-pp"></div></div>' +
      '<div class="grid g2"><label class="f"><span>Hekim</span><select name="doctor_id">' + S.doctors.filter(function (d) { return d.active || d.id === a.doctor_id; }).map(function (d) {
        return '<option value="' + d.id + '"' + (d.id === docId ? ' selected' : '') + '>' + esc(docName(d)) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Hizmet</span><select name="service_id"><option value="">—</option>' + svcs.map(function (s) {
        return '<option value="' + s.id + '"' + (s.id === a.service_id ? ' selected' : '') + '>' + esc(s.name) + ' (' + s.duration_min + ' dk)</option>'; }).join('') + '</select></label></div>' +
      '<div class="grid g3"><label class="f"><span>Tarih</span><input type="date" name="date" value="' + date + '" required></label>' +
      '<label class="f"><span>Saat</span><input type="time" name="time" value="' + time + '" step="300" required></label>' +
      '<label class="f"><span>Süre (dk)</span><input type="number" name="duration" min="5" max="480" step="5" value="' + dur + '"></label></div>' +
      '<div class="f"><span>Boş saatler</span><div class="slots js-slots"><span class="mut">…</span></div></div>' +
      '<div class="grid g2"><label class="f"><span>Durum</span><select name="status">' + Object.keys(STATUS).map(function (k) {
        return '<option value="' + k + '"' + (k === (a.status || 'confirmed') ? ' selected' : '') + '>' + STATUS[k] + '</option>'; }).join('') + '</select></label>' +
      (isNew ? '<label class="f"><span>Nereden geldi</span><select name="source"><option value="phone">Telefon</option><option value="panel">Yüz yüze / panel</option></select></label>'
        : '<div class="f"><span>Kaynak</span><div style="padding-top:.5rem">' + esc(SOURCE[a.source]) + ' · <span class="mut">' + esc((a.created_at || '').slice(0, 16)) + ' UTC</span></div></div>') + '</div>' +
      '<label class="f"><span>Not</span><textarea name="note" rows="3">' + esc(a.note || '') + '</textarea></label>' +
      '<div class="alert js-err" hidden></div></form>',
      (isNew ? '' : '<button class="btn btn--d js-del">Sil</button>') + '<span class="grow"></span>' +
      '<button class="btn js-cancel">Vazgeç</button><button class="btn btn--p js-save">Kaydet</button>');
    var f = $('form', m), err = $('.js-err', m);
    var pp = patientPicker(m, a.patient_id ? { id: a.patient_id, name: a.patient_name, phone: a.patient_phone } : null, function () {});

    function loadSlots() {
      var svc = findSvc(+f.service_id.value), d = +f.doctor_id.value;
      var du = +f.duration.value || (svc ? svc.duration_min : (findDoc(d) || {}).slot_min || 30);
      var box = $('.js-slots', m);
      if (!f.date.value || !d) { box.innerHTML = ''; return; }
      api('GET', '/slots?doctor=' + d + '&date=' + f.date.value + '&duration=' + du + (a.id ? '&except=' + a.id : '')).then(function (r) {
        box.innerHTML = r.slots.length ? r.slots.map(function (t) { return '<button type="button" class="' + (t === f.time.value ? 'on' : '') + '">' + t + '</button>'; }).join('')
          : '<span class="mut">Bu gün hekimin boş saati yok (ya da çalışmıyor). Saati elle girebilirsiniz.</span>';
        $$('button', box).forEach(function (b) {
          b.onclick = function () { f.time.value = b.textContent; $$('button', box).forEach(function (x) { x.classList.toggle('on', x === b); }); };
        });
      }).catch(function () {});
    }
    f.service_id.addEventListener('change', function () { var s = findSvc(+f.service_id.value); if (s) f.duration.value = s.duration_min; loadSlots(); });
    ['doctor_id', 'date', 'duration'].forEach(function (n) { f[n].addEventListener('change', loadSlots); });
    loadSlots();

    function save(force) {
      err.hidden = true;
      var p = pp.get();
      var body = {
        patient_id: p ? p.id : null,
        patient_name: f.patient_name ? f.patient_name.value : '', patient_phone: f.patient_phone ? f.patient_phone.value : '',
        doctor_id: +f.doctor_id.value, service_id: f.service_id.value ? +f.service_id.value : null,
        date: f.date.value, time: f.time.value, duration: f.duration.value ? +f.duration.value : null,
        status: f.status.value, note: f.note.value, source: f.source ? f.source.value : undefined, force: !!force
      };
      api(isNew ? 'POST' : 'PUT', '/appointments' + (isNew ? '' : '/' + a.id), body).then(function () {
        closeModal(); toast('Randevu kaydedildi'); refreshBadge(); route();
      }).catch(function (e) {
        if (e.status === 409 && e.data && e.data.canForce) {
          if (confirm(e.message + '\n\nYine de kaydedilsin mi?')) return save(true);
          return;
        }
        err.textContent = e.message; err.hidden = false;
      });
    }
    $('.js-save', m).onclick = function () { save(false); };
    f.addEventListener('submit', function (e) { e.preventDefault(); save(false); });
    $('.js-cancel', m).onclick = closeModal;
    if (!isNew) $('.js-del', m).onclick = function () {
      if (!confirm('Randevu tamamen silinsin mi? (İptal etmek için durumu “İptal” yapmanız daha iyidir; kayıt kalır.)')) return;
      api('DELETE', '/appointments/' + a.id).then(function () { closeModal(); toast('Randevu silindi'); refreshBadge(); route(); }).catch(oops);
    };
  }

  /* ── Hastalar ──────────────────────────────────────────────────────── */
  var pq = '';
  function vPatients(v) {
    v.innerHTML = top('Hastalar', '', '<button class="btn btn--p js-new">' + ic('plus') + 'Yeni hasta</button>') +
      '<div class="card"><div class="card__b"><input type="search" class="js-q" placeholder="Ad, telefon ya da e-posta ile ara" value="' + esc(pq) + '"></div><div class="scroll js-out"></div></div>';
    $('.js-new', v).onclick = function () { editPatient({}); };
    var t, q = $('.js-q', v);
    q.addEventListener('input', function () { pq = q.value; clearTimeout(t); t = setTimeout(load, 220); });
    function load() {
      return api('GET', '/patients' + (pq.trim() ? '?q=' + encodeURIComponent(pq.trim()) : '')).then(function (r) {
        var out = $('.js-out', v);
        out.innerHTML = r.items.length ? '<table class="tbl"><thead><tr><th>Ad soyad</th><th>Telefon</th><th class="hide-m">Son ziyaret</th><th class="hide-m">Sıradaki randevu</th><th class="r">Bakiye</th></tr></thead><tbody>' +
          r.items.map(function (p) {
            return '<tr class="click" data-id="' + p.id + '"><td><b>' + esc(p.name) + '</b></td><td class="mono">' + esc(phone(p.phone)) + '</td>' +
              '<td class="hide-m">' + (p.last_visit ? fmtDate(p.last_visit) : '<span class="mut">—</span>') + '</td>' +
              '<td class="hide-m">' + (p.next_visit ? fmtShort(p.next_visit) : '<span class="mut">—</span>') + '</td>' +
              '<td class="r mono">' + (p.balance > 0 ? '<span style="color:var(--danger)">' + money(p.balance) + '</span>' : '<span class="mut">0 ₺</span>') + '</td></tr>';
          }).join('') + '</tbody></table>' : '<p class="empty">' + (pq ? 'Eşleşen hasta yok.' : 'Henüz hasta kaydı yok.') + '</p>';
        $$('tr.click', out).forEach(function (tr) { tr.onclick = function () { location.hash = '#/hasta/' + tr.dataset.id; }; });
      });
    }
    q.focus();
    return load();
  }

  function patientFields(p) {
    return '<div class="grid g2"><label class="f"><span>Ad soyad</span><input name="name" value="' + esc(p.name || '') + '" required></label>' +
      '<label class="f"><span>Telefon</span><input name="phone" inputmode="tel" value="' + esc(phone(p.phone)) + '"></label></div>' +
      '<div class="grid g3"><label class="f"><span>E-posta</span><input name="email" type="email" value="' + esc(p.email || '') + '"></label>' +
      '<label class="f"><span>Doğum tarihi</span><input name="birth_date" type="date" value="' + esc(p.birth_date || '') + '"></label>' +
      '<label class="f"><span>Cinsiyet</span><select name="gender"><option value="">—</option>' + ['Kadın', 'Erkek', 'Diğer'].map(function (g) {
        return '<option' + (g === p.gender ? ' selected' : '') + '>' + g + '</option>'; }).join('') + '</select></label></div>' +
      '<label class="f"><span>Alerji / sistemik hastalık / kullandığı ilaçlar</span><textarea name="allergies" rows="2">' + esc(p.allergies || '') + '</textarea></label>' +
      '<label class="f"><span>Notlar</span><textarea name="notes" rows="3">' + esc(p.notes || '') + '</textarea></label>' +
      (p.consent_at ? '<p class="mut" style="margin:0;font-size:.85rem">KVKK aydınlatma onayı: ' + esc(p.consent_at) + '</p>'
        : '<label class="check"><input type="checkbox" name="consent"> Hasta KVKK aydınlatma metnini onayladı</label>');
  }
  function patientBody(f) {
    return { name: f.name.value, phone: f.phone.value, email: f.email.value, birth_date: f.birth_date.value, gender: f.gender.value,
      allergies: f.allergies.value, notes: f.notes.value, consent: f.consent ? f.consent.checked : undefined };
  }
  function editPatient(p) {
    var m = openModal(p.id ? 'Hasta bilgileri' : 'Yeni hasta', '<form class="form" novalidate>' + patientFields(p) + '<div class="alert js-err" hidden></div></form>',
      '<button class="btn js-cancel">Vazgeç</button><button class="btn btn--p js-save">Kaydet</button>');
    var f = $('form', m);
    $('.js-cancel', m).onclick = closeModal;
    $('.js-save', m).onclick = function () {
      api(p.id ? 'PUT' : 'POST', '/patients' + (p.id ? '/' + p.id : ''), patientBody(f)).then(function (r) {
        closeModal(); toast('Hasta kaydedildi');
        if (!p.id) location.hash = '#/hasta/' + r.id; else route();
      }).catch(function (e) { var al = $('.js-err', m); al.textContent = e.message; al.hidden = false; });
    };
  }

  function vPatient(v, args) {
    var id = +args[0];
    return api('GET', '/patients/' + id).then(function (p) {
      var bal = p.records.reduce(function (s, r) { return s + r.fee - r.paid; }, 0);
      var fee = p.records.reduce(function (s, r) { return s + r.fee; }, 0);
      var age = p.birth_date ? Math.floor((Date.now() - new Date(p.birth_date)) / 31557600000) : null;
      v.innerHTML = top(esc(p.name), '<span class="mono">' + esc(phone(p.phone)) + '</span>' + (age != null ? ' · ' + age + ' yaş' : '') + (p.email ? ' · ' + esc(p.email) : ''),
        '<a class="btn" href="#/hastalar">' + ic('left') + 'Hastalar</a>' +
        (p.phone ? '<a class="btn" href="tel:' + esc(p.phone) + '">Ara</a><a class="btn" target="_blank" rel="noopener" href="https://wa.me/90' + esc(p.phone.slice(1)) + '">WhatsApp</a>' : '') +
        '<button class="btn js-edit">Düzenle</button><button class="btn btn--p js-appt">' + ic('plus') + 'Randevu</button>') +
        (p.allergies ? '<div class="alert" style="margin-bottom:1.1rem"><b>Uyarı:</b> ' + esc(p.allergies) + '</div>' : '') +
        '<div class="grid g-side"><div>' +
        '<section class="card"><div class="card__h"><h2>Tedavi kayıtları</h2><button class="btn btn--sm btn--p js-rec">' + ic('plus') + 'Kayıt ekle</button></div>' +
        (p.records.length ? '<div class="scroll"><table class="tbl"><thead><tr><th>Tarih</th><th>Diş</th><th>İşlem</th><th class="hide-m">Hekim</th><th class="r">Ücret</th><th class="r">Ödenen</th></tr></thead><tbody>' +
          p.records.map(function (r) {
            return '<tr class="click" data-id="' + r.id + '"><td class="mono">' + fmtDate(r.date, { day: 'numeric', month: 'short', year: '2-digit' }) + '</td><td class="mono">' + esc(r.tooth) + '</td>' +
              '<td><b>' + esc(r.procedure) + '</b>' + (r.note ? '<br><small class="mut">' + esc(r.note) + '</small>' : '') + '</td><td class="hide-m">' + esc(r.doctor_name || '') + '</td>' +
              '<td class="r mono">' + money(r.fee) + '</td><td class="r mono">' + money(r.paid) + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<p class="empty">Henüz tedavi kaydı yok.</p>') + '</section>' +
        '<section class="card"><div class="card__h"><h2>Randevular</h2><span class="badge">' + p.appointments.length + '</span></div>' +
        (p.appointments.length ? '<ul class="list">' + p.appointments.map(function (a) {
          return '<li class="click" data-id="' + a.id + '" style="cursor:pointer"><span class="t" style="min-width:7.5rem">' + fmtShort(a.start) + '</span>' +
            '<span class="who"><b>' + esc(a.service_name || 'Randevu') + '</b><small>' + esc((a.doctor_title || '') + ' ' + (a.doctor_name || '')) + (a.note ? ' · ' + esc(a.note.slice(0, 60)) : '') + '</small></span>' + badge(a.status) + '</li>';
        }).join('') + '</ul>' : '<p class="empty">Randevu yok.</p>') + '</section></div>' +
        '<aside class="card"><div class="card__h"><h2>Hesap</h2></div><div class="card__b">' +
        '<div class="grid g2" style="gap:.6rem"><div><span class="mut" style="font-size:.8rem">Toplam ücret</span><div class="mono" style="font-size:1.15rem">' + money(fee) + '</div></div>' +
        '<div><span class="mut" style="font-size:.8rem">Kalan bakiye</span><div class="mono" style="font-size:1.15rem;' + (bal > 0 ? 'color:var(--danger)' : '') + '">' + money(bal) + '</div></div></div>' +
        '<hr style="border:0;border-top:1px solid var(--line);margin:1rem 0">' +
        '<dl style="margin:0;display:grid;gap:.6rem;font-size:.9rem">' +
        '<div><dt class="mut" style="font-size:.8rem">Kayıt tarihi</dt><dd style="margin:0">' + esc((p.created_at || '').slice(0, 10)) + '</dd></div>' +
        '<div><dt class="mut" style="font-size:.8rem">KVKK onayı</dt><dd style="margin:0">' + (p.consent_at ? esc(p.consent_at) : '<span style="color:var(--danger)">Yok</span>') + '</dd></div>' +
        (p.notes ? '<div><dt class="mut" style="font-size:.8rem">Notlar</dt><dd style="margin:0;white-space:pre-wrap">' + esc(p.notes) + '</dd></div>' : '') +
        '</dl>' + (isAdmin() ? '<hr style="border:0;border-top:1px solid var(--line);margin:1rem 0"><button class="btn btn--sm btn--d js-delp">Hastayı ve tüm kayıtlarını sil</button>' : '') +
        '</div></aside></div>';

      $('.js-edit', v).onclick = function () { editPatient(p); };
      $('.js-appt', v).onclick = function () { openAppt({ patient_id: p.id, patient_name: p.name, patient_phone: p.phone }); };
      $('.js-rec', v).onclick = function () { editRecord(p.id, {}); };
      $$('tr.click', v).forEach(function (tr) { tr.onclick = function () { editRecord(p.id, p.records.filter(function (r) { return r.id === +tr.dataset.id; })[0]); }; });
      $$('li.click', v).forEach(function (li) { li.onclick = function () { openAppt(p.appointments.filter(function (a) { return a.id === +li.dataset.id; })[0]); }; });
      var del = $('.js-delp', v);
      if (del) del.onclick = function () {
        if (prompt('Bu işlem geri alınamaz. Hastanın tüm randevu ve tedavi kayıtları silinir.\nOnaylamak için hastanın adını yazın:') !== p.name) return;
        api('DELETE', '/patients/' + p.id).then(function () { toast('Hasta silindi'); location.hash = '#/hastalar'; }).catch(oops);
      };
    });
  }

  function editRecord(pid, r) {
    var m = openModal(r.id ? 'Tedavi kaydı' : 'Yeni tedavi kaydı',
      '<form class="form" novalidate><div class="grid g3"><label class="f"><span>Tarih</span><input type="date" name="date" value="' + (r.date || today()) + '"></label>' +
      '<label class="f"><span>Diş no</span><input name="tooth" value="' + esc(r.tooth || '') + '" placeholder="örn. 11, 21"></label>' +
      '<label class="f"><span>Hekim</span><select name="doctor_id"><option value="">—</option>' + S.doctors.map(function (d) {
        var sel = r.id ? d.id === r.doctor_id : d.id === S.user.doctor_id;
        return '<option value="' + d.id + '"' + (sel ? ' selected' : '') + '>' + esc(docName(d)) + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="grid g3"><label class="f" style="grid-column:span 2"><span>Tedavi</span><select name="service_id"><option value="">Listede yok (aşağıya yazın)</option>' +
      S.services.filter(function (s) { return s.active || s.id === r.service_id; }).map(function (s) {
        return '<option value="' + s.id + '"' + (s.id === r.service_id ? ' selected' : '') + '>' + esc(s.name) + (s.price ? ' — ' + money(s.price) : '') + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Adet (diş)</span><input type="number" name="units" min="1" max="32" value="1"></label></div>' +
      '<label class="f"><span>İşlem açıklaması</span><input name="procedure" list="procs" value="' + esc(r.procedure || '') + '" placeholder="örn. Zirkonyum kaplama — 2 diş"><datalist id="procs">' +
      '<option value="Dolgu"><option value="Diş çekimi"><option value="Diş taşı temizliği"><option value="Röntgen"><option value="Kontrol"></datalist></label>' +
      '<div class="grid g3"><label class="f"><span>Ücret (₺)</span><input type="number" name="fee" min="0" step="50" value="' + (r.fee || '') + '"></label>' +
      '<label class="f"><span>Maliyet (₺)</span><input type="number" name="cost" min="0" step="50" value="' + (r.cost || '') + '"><small>Malzeme + laboratuvar</small></label>' +
      '<label class="f"><span>Ödenen (₺)</span><input type="number" name="paid" min="0" step="50" value="' + (r.paid || '') + '"><small><a href="#" class="js-full">Tamamı ödendi</a></small></label></div>' +
      '<p class="mut js-rp" style="margin:0;font-size:.88rem"></p>' +
      '<label class="f"><span>Not</span><textarea name="note" rows="2">' + esc(r.note || '') + '</textarea></label>' +
      '<div class="alert js-err" hidden></div></form>',
      (r.id ? '<button class="btn btn--d js-del">Sil</button>' : '') + '<span class="grow"></span><button class="btn js-cancel">Vazgeç</button><button class="btn btn--p js-save">Kaydet</button>');
    var f = $('form', m);
    // tedavi seçilince ücret ve maliyet tedavi listesindeki fiyattan dolar (değiştirilebilir)
    function fill() {
      var s = findSvc(+f.service_id.value), n = Math.max(1, +f.units.value || 1);
      if (!s) return;
      if (s.price) f.fee.value = s.price * n;
      f.cost.value = (s.cost || 0) * n;
      f.procedure.value = s.name + (n > 1 ? ' — ' + n + ' diş' : '');
      sum();
    }
    function sum() {
      var fee = +f.fee.value || 0, cost = +f.cost.value || 0, paid = +f.paid.value || 0;
      $('.js-rp', m).innerHTML = fee ? 'Kâr: <b>' + money(fee - cost) + '</b> · Kalan borç: <b>' + money(Math.max(0, fee - paid)) + '</b>' : '';
    }
    f.service_id.addEventListener('change', fill);
    f.units.addEventListener('input', fill);
    ['fee', 'cost', 'paid'].forEach(function (n) { f[n].addEventListener('input', sum); });
    $('.js-full', m).onclick = function (e) { e.preventDefault(); f.paid.value = f.fee.value; sum(); };
    sum();
    $('.js-cancel', m).onclick = closeModal;
    $('.js-save', m).onclick = function () {
      if (!f.procedure.value.trim() && f.service_id.value) fill();
      var b = { date: f.date.value, tooth: f.tooth.value, doctor_id: f.doctor_id.value ? +f.doctor_id.value : null, procedure: f.procedure.value, note: f.note.value,
        fee: +f.fee.value || 0, paid: +f.paid.value || 0, cost: +f.cost.value || 0, service_id: f.service_id.value ? +f.service_id.value : null };
      api(r.id ? 'PUT' : 'POST', r.id ? '/records/' + r.id : '/patients/' + pid + '/records', b)
        .then(function () { closeModal(); toast('Kayıt kaydedildi'); route(); })
        .catch(function (e) { var al = $('.js-err', m); al.textContent = e.message; al.hidden = false; });
    };
    if (r.id) $('.js-del', m).onclick = function () {
      if (!confirm('Kayıt silinsin mi?')) return;
      api('DELETE', '/records/' + r.id).then(function () { closeModal(); route(); }).catch(oops);
    };
  }

  /* ── Yapılan işlemler ──────────────────────────────────────────────────
     Tüm hastaların işlem kayıtları tek listede; ücret, maliyet ve ödenen tutar satırın içinde değişir. */
  var RF = { from: '', to: '', doctor: '', service: '', q: '', unpaid: false };
  function recBody(r) {
    return { date: r.date, tooth: r.tooth, doctor_id: r.doctor_id, procedure: r.procedure, note: r.note, fee: r.fee, paid: r.paid, cost: r.cost, service_id: r.service_id };
  }
  function vRecords(v) {
    if (!RF.from) { RF.from = today().slice(0, 7) + '-01'; RF.to = today(); }
    v.innerHTML = top('Yapılan işlemler', 'Hastalara yapılan tüm işlemler. Tutarları doğrudan tabloda değiştirebilir, satıra tıklayıp ayrıntıyı açabilirsiniz.',
      '<button class="btn btn--p js-new">' + ic('plus') + 'İşlem ekle</button>') +
      '<div class="card"><div class="card__b row">' +
      '<label class="f"><span>Başlangıç</span><input type="date" name="from" value="' + RF.from + '"></label>' +
      '<label class="f"><span>Bitiş</span><input type="date" name="to" value="' + RF.to + '"></label>' +
      '<label class="f"><span>Hekim</span><select name="doctor"><option value="">Tümü</option>' + S.doctors.map(function (d) {
        return '<option value="' + d.id + '"' + (String(d.id) === RF.doctor ? ' selected' : '') + '>' + esc(docName(d)) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Tedavi</span><select name="service"><option value="">Tümü</option>' + S.services.map(function (s) {
        return '<option value="' + s.id + '"' + (String(s.id) === RF.service ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f grow"><span>Ara</span><input type="search" name="q" value="' + esc(RF.q) + '" placeholder="Hasta adı ya da işlem"></label>' +
      '<label class="check" style="align-self:end;padding-bottom:.5rem"><input type="checkbox" name="unpaid"' + (RF.unpaid ? ' checked' : '') + '> Yalnızca borcu olanlar</label>' +
      '</div><div class="sumrow js-sum"></div><div class="scroll js-out"></div></div>';
    $('.js-new', v).onclick = function () { pickPatient(function (pid) { editRecord(pid, {}); }); };
    var t;
    $$('.card__b [name]', v).forEach(function (el) {
      el.addEventListener('input', function () { RF[el.name] = el.type === 'checkbox' ? el.checked : el.value; clearTimeout(t); t = setTimeout(load, 250); });
    });
    function load() {
      var qs = ['from', 'to', 'doctor', 'service', 'q'].filter(function (k) { return RF[k]; }).map(function (k) { return k + '=' + encodeURIComponent(RF[k]); }).join('&') + (RF.unpaid ? '&unpaid=1' : '');
      return api('GET', '/records?' + qs).then(function (r) {
        var sm = r.sum;
        $('.js-sum', v).innerHTML = '<span><small>İşlem</small><b>' + sm.n.toLocaleString('tr-TR') + '</b></span><span><small>Ücret</small><b>' + money(sm.fee) + '</b></span>' +
          '<span><small>Maliyet</small><b>' + money(sm.cost) + '</b></span><span><small>Kâr</small><b>' + money(sm.fee - sm.cost) + '</b></span>' +
          '<span><small>Tahsil edilen</small><b>' + money(sm.paid) + '</b></span><span><small>Kalan</small><b' + (sm.fee - sm.paid > 0 ? ' class="neg"' : '') + '>' + money(sm.fee - sm.paid) + '</b></span>';
        var out = $('.js-out', v);
        if (!r.items.length) { out.innerHTML = '<p class="empty">Bu filtreyle işlem yok.</p>'; return; }
        out.innerHTML = '<table class="tbl rtbl"><thead><tr><th>Tarih</th><th>Hasta</th><th>İşlem</th><th class="hide-m">Hekim</th><th class="r">Ücret ₺</th><th class="r">Maliyet ₺</th><th class="r">Ödenen ₺</th><th class="r">Kalan</th><th></th></tr></thead><tbody>' +
          r.items.map(function (x) {
            var rest = x.fee - x.paid;
            return '<tr class="click" data-id="' + x.id + '"><td class="mono">' + fmtDate(x.date, { day: 'numeric', month: 'short', year: '2-digit' }) + '</td>' +
              '<td><a href="#/hasta/' + x.patient_id + '">' + esc(x.patient_name) + '</a></td>' +
              '<td>' + esc(x.procedure) + (x.tooth ? ' <span class="mut mono">· ' + esc(x.tooth) + '</span>' : '') + '</td><td class="hide-m">' + esc(x.doctor_name || '—') + '</td>' +
              ['fee', 'cost', 'paid'].map(function (f) { return '<td class="r"><input class="cell js-in" type="number" min="0" step="50" inputmode="numeric" data-f="' + f + '" value="' + x[f] + '" aria-label="' + { fee: 'Ücret', cost: 'Maliyet', paid: 'Ödenen' }[f] + '"></td>'; }).join('') +
              '<td class="r mono js-rest' + (rest > 0 ? ' neg' : '') + '">' + money(rest) + '</td>' +
              '<td class="r"><button type="button" class="btn btn--sm btn--ghost js-del" aria-label="İşlemi sil" title="Sil">✕</button></td></tr>';
          }).join('') + '</tbody></table>' + (r.items.length >= 500 ? '<p class="mut" style="padding:0 1rem">İlk 500 işlem gösteriliyor; tarih aralığını daraltın.</p>' : '');
        $$('tr.click', out).forEach(function (tr) {
          var x = r.items.filter(function (i) { return i.id === +tr.dataset.id; })[0];
          tr.addEventListener('click', function (e) { if (e.target.closest('input, button, a')) return; editRecord(x.patient_id, x); });
          $$('.js-in', tr).forEach(function (inp) {
            inp.addEventListener('change', function () {
              var val = Math.max(0, Math.round(+inp.value || 0)), b = recBody(x);
              b[inp.dataset.f] = val;
              api('PUT', '/records/' + x.id, b).then(function () {
                x[inp.dataset.f] = val; inp.value = val;
                var rest = x.fee - x.paid, c = $('.js-rest', tr);
                c.textContent = money(rest); c.classList.toggle('neg', rest > 0);
                inp.classList.add('is-saved'); setTimeout(function () { inp.classList.remove('is-saved'); }, 900);
                toast('Kaydedildi');
              }).catch(function (e) { inp.value = x[inp.dataset.f]; oops(e); });
            });
            inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });
          });
          $('.js-del', tr).onclick = function () {
            if (!confirm(x.patient_name + ' — ' + x.procedure + ' (' + money(x.fee) + ') silinsin mi?')) return;
            api('DELETE', '/records/' + x.id).then(function () { toast('İşlem silindi'); load(); }).catch(oops);
          };
        });
      }).catch(oops);
    }
    return load();
  }

  /* İşlem eklemeden önce hasta seçimi (kayıtlı ya da yeni) */
  function pickPatient(next) {
    var m = openModal('Hangi hastaya?', '<form class="form" novalidate><div class="js-pp"></div><div class="alert js-err" hidden></div></form>',
      '<span class="grow"></span><button class="btn js-cancel">Vazgeç</button><button class="btn btn--p js-go">Devam</button>');
    var pp = patientPicker(m, null, function (p) { if (p) { closeModal(); next(p.id); } });
    $('.js-cancel', m).onclick = closeModal;
    $('.js-go', m).onclick = function () {
      var p = pp.get(), al = $('.js-err', m);
      if (p) { closeModal(); return next(p.id); }
      var name = $('[name=patient_name]', m).value.trim();
      if (name.length < 2) { al.textContent = 'Hastayı arayıp seçin ya da yeni hasta adını yazın.'; al.hidden = false; return; }
      api('POST', '/patients', { name: name, phone: $('[name=patient_phone]', m).value }).then(function (r) { closeModal(); next(r.id); })
        .catch(function (e) { al.textContent = e.message; al.hidden = false; });
    };
  }

  /* ── Hekimler ──────────────────────────────────────────────────────── */
  var TITLES = ['Dt.', 'Uzm. Dt.', 'Dr. Dt.', 'Dr. Öğr. Üyesi', 'Doç. Dr.', 'Prof. Dr.'];
  var SPECIALTIES = ['Genel diş hekimliği', 'Protetik diş tedavisi', 'Estetik diş hekimliği', 'Ağız, diş ve çene cerrahisi', 'Ortodonti',
    'Endodonti (kanal tedavisi)', 'Periodontoloji (dişeti)', 'Pedodonti (çocuk diş hekimliği)', 'Restoratif diş tedavisi', 'İmplantoloji'];
  var initials = function (n) { return String(n || '?').trim().split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toLocaleUpperCase('tr'); };

  function vDoctors(v) {
    return loadRefs().then(function () {
      v.innerHTML = top('Hekimler', 'Sitede görünen hekim kartları ve randevu ayarları. Bir karta tıklayarak düzenleyin.',
        '<a class="btn" href="#/site">' + ic('web') + 'Sitede gör</a>') +
        '<div class="dgrid">' + S.doctors.map(function (d, i) {
          return '<article class="dcard' + (d.active ? '' : ' is-off') + '" data-id="' + d.id + '">' +
            '<button type="button" class="dcard__ph js-edit" aria-label="' + esc(docName(d)) + ' düzenle">' +
            (d.photo ? '<img src="' + esc(d.photo) + '" alt="">' : '<span>' + esc(initials(d.name)) + '</span>') +
            '<em class="dcard__hint">Düzenle</em></button>' +
            '<div class="dcard__b"><small>' + esc(d.specialty || 'Uzmanlık eklenmemiş') + '</small><h3>' + esc(docName(d)) + '</h3>' +
            '<div class="row" style="gap:.3rem;margin-top:.5rem">' +
            (!d.active ? '<span class="badge st-cancelled">Pasif</span>' : d.on_site ? '<span class="badge st-confirmed">Sitede görünüyor</span>' : '<span class="badge">Sitede gizli</span>') +
            (d.active && d.online ? '<span class="badge st-arrived">Online randevu</span>' : '') + '</div></div>' +
            '<div class="dcard__f"><button type="button" class="btn btn--sm btn--p js-edit">Düzenle</button><span class="grow"></span>' +
            '<button type="button" class="btn btn--sm btn--ghost js-mv" data-dir="-1" aria-label="Öne al" title="Öne al"' + (i ? '' : ' disabled') + '>' + ic('left') + '</button>' +
            '<button type="button" class="btn btn--sm btn--ghost js-mv" data-dir="1" aria-label="Sona al" title="Sona al"' + (i < S.doctors.length - 1 ? '' : ' disabled') + '>' + ic('right') + '</button></div></article>';
        }).join('') +
        '<button type="button" class="dcard dcard--add js-new"><span>' + ic('plus') + '</span><b>Yeni hekim ekle</b></button></div>';
      $('.js-new', v).onclick = function () { editDoctor({}); };
      $$('.js-edit', v).forEach(function (b) { b.onclick = function () { editDoctor(findDoc(+b.closest('.dcard').dataset.id)); }; });
      $$('.js-mv', v).forEach(function (b) {
        b.onclick = function () {
          var ids = S.doctors.map(function (d) { return d.id; }), id = +b.closest('.dcard').dataset.id, i = ids.indexOf(id), j = i + +b.dataset.dir;
          ids.splice(i, 1); ids.splice(j, 0, id);
          api('POST', '/doctors/order', { ids: ids }).then(function () { toast('Sıra değişti'); route(); }).catch(oops);
        };
      });
    });
  }

  function hoursEditor(h) {
    return '<div class="hours">' + [1, 2, 3, 4, 5, 6, 0].map(function (d) {
      return '<div class="hours__d" data-d="' + d + '"><b>' + DAYS[d] + '</b><div class="hours__r">' + (h[d] || []).map(rangeHtml).join('') +
        '<button type="button" class="btn btn--sm js-add">+ Saat aralığı</button>' + (!(h[d] || []).length ? '<span class="mut js-closed">Çalışmıyor</span>' : '') +
        (d === 1 ? '<button type="button" class="btn btn--sm btn--ghost js-copy">Bu saatleri tüm hafta içine uygula</button>' : '') + '</div></div>';
    }).join('') + '</div>';
  }
  function rangeHtml(r) {
    return '<span class="rng"><input type="time" step="900" value="' + (r ? r[0] : '09:00') + '" aria-label="Başlangıç">–<input type="time" step="900" value="' + (r ? r[1] : '18:00') + '" aria-label="Bitiş">' +
      '<button type="button" class="btn btn--sm btn--ghost js-rm" aria-label="Bu aralığı kaldır">✕</button></span>';
  }
  function bindHours(root) {
    root.addEventListener('click', function (e) {
      if (e.target.closest('.js-add')) {
        var row = e.target.closest('.hours__r'), c = $('.js-closed', row); if (c) c.remove();
        e.target.closest('.js-add').insertAdjacentHTML('beforebegin', rangeHtml());
      }
      if (e.target.closest('.js-rm')) {
        var r = e.target.closest('.hours__r'); e.target.closest('.rng').remove();
        if (!$('.rng', r)) $('.js-add', r).insertAdjacentHTML('afterend', '<span class="mut js-closed">Çalışmıyor</span>');
      }
      if (e.target.closest('.js-copy')) {
        var h = readHours(root);
        $$('.hours__d', root).forEach(function (row) {
          var d = +row.dataset.d; if (d < 2 || d > 5) return;
          $$('.rng, .js-closed', row).forEach(function (x) { x.remove(); });
          var add = $('.js-add', row);
          (h[1] || []).forEach(function (rg) { add.insertAdjacentHTML('beforebegin', rangeHtml(rg)); });
          if (!(h[1] || []).length) add.insertAdjacentHTML('afterend', '<span class="mut js-closed">Çalışmıyor</span>');
        });
        toast('Pazartesi saatleri Salı–Cuma günlerine uygulandı');
      }
    });
  }
  function readHours(root) {
    var h = {};
    $$('.hours__d', root).forEach(function (row) {
      h[row.dataset.d] = $$('.rng', row).map(function (r) { var i = $$('input', r); return [i[0].value, i[1].value]; }).filter(function (r) { return r[0] && r[1] && r[0] < r[1]; });
    });
    return h;
  }

  /* Fotoğrafı tarayıcıda 4:5 dikey kırp, küçült ve JPEG'e çevir: sitede tam böyle görünür; dosya küçülür, EXIF (konum vb.) atılır */
  function shrink(file) {
    return new Promise(function (res, rej) {
      if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return rej(new Error('Lütfen bir fotoğraf seçin (JPEG, PNG ya da WebP).'));
      if (file.size > 20 * 1024 * 1024) return rej(new Error('Dosya çok büyük (en fazla 20 MB).'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var W = 800, H = 1000, sw = img.width, sh = img.height, r = W / H;
        var cw = sw / sh > r ? sh * r : sw, ch = sw / sh > r ? sh : sw / r;
        var sx = (sw - cw) / 2, sy = Math.max(0, (sh - ch) * 0.35);       // dikey fotoğrafta yüz üstte kalsın
        var c = document.createElement('canvas'); c.width = Math.min(W, Math.round(cw)); c.height = Math.round(c.width / r);
        c.getContext('2d').drawImage(img, sx, sy, cw, ch, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Bu dosya açılamadı. Başka bir fotoğraf deneyin.')); };
      img.src = url;
    });
  }

  function editDoctor(d, onDone) {
    d = d || {};
    onDone = onDone || route;
    var def = { 1: [['09:00', '13:00'], ['14:00', '19:00']], 2: [['09:00', '13:00'], ['14:00', '19:00']], 3: [['09:00', '13:00'], ['14:00', '19:00']],
      4: [['09:00', '13:00'], ['14:00', '19:00']], 5: [['09:00', '13:00'], ['14:00', '19:00']], 6: [['10:00', '15:00']], 0: [] };
    var titles = TITLES.indexOf(d.title || 'Dt.') < 0 ? TITLES.concat([d.title]) : TITLES;
    var photo = d.photo || '', photoData = null, removePhoto = false;

    var m = openModal(d.id ? docName(d) : 'Yeni hekim',
      '<div class="tabs js-tabs"><button type="button" class="on" data-t="site">1. Sitede görünen bilgiler</button><button type="button" data-t="appt">2. Randevu ve çalışma saatleri</button></div>' +
      '<form class="js-f" novalidate>' +
      '<div class="dedit" data-p="site"><div class="form">' +
      '<div class="f"><span>Fotoğraf</span><div class="drop js-drop" tabindex="0" role="button" aria-label="Fotoğraf seç ya da sürükleyip bırak">' +
      '<input type="file" accept="image/jpeg,image/png,image/webp" class="sr js-file">' +
      '<b>Fotoğrafı buraya sürükleyin</b><span>ya da <u>bilgisayardan seçin</u></span><small>Dikey, yüzün net göründüğü bir fotoğraf en iyisidir. Otomatik olarak kırpılır.</small></div>' +
      '<button type="button" class="btn btn--sm btn--d js-phdel"' + (photo ? '' : ' hidden') + '>Fotoğrafı kaldır</button></div>' +
      '<div class="grid g3" style="gap:.9rem"><label class="f"><span>Unvan</span><select name="title">' + titles.map(function (t) {
        return '<option' + (t === (d.title || 'Dt.') ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f" style="grid-column:span 2"><span>Ad soyad</span><input name="name" value="' + esc(d.name || '') + '" placeholder="örn. Ayşe Yılmaz" autocomplete="off"></label></div>' +
      '<label class="f"><span>Uzmanlık alanı</span><input name="specialty" list="specs" value="' + esc(d.specialty || '') + '" placeholder="Listeden seçin ya da yazın" autocomplete="off">' +
      '<datalist id="specs">' + SPECIALTIES.map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist></label>' +
      '<label class="f"><span>Tanıtım yazısı</span><textarea name="bio" rows="5" maxlength="2000" placeholder="Hekimi birkaç cümleyle tanıtın: ilgilendiği tedaviler, yaklaşımı…">' + esc(d.bio || '') + '</textarea>' +
      '<small class="js-cnt"></small></label>' +
      '<details class="more"' + (d.bio_en || d.bio_de ? ' open' : '') + '><summary>İngilizce ve Almanca tanıtım (isteğe bağlı)</summary><div class="form" style="margin-top:.8rem">' +
      '<label class="f"><span>English</span><textarea name="bio_en" rows="3" maxlength="2000" placeholder="Boş bırakırsanız Türkçe metin gösterilir.">' + esc(d.bio_en || '') + '</textarea></label>' +
      '<label class="f"><span>Deutsch</span><textarea name="bio_de" rows="3" maxlength="2000" placeholder="Boş bırakırsanız Türkçe metin gösterilir.">' + esc(d.bio_de || '') + '</textarea></label></div></details>' +
      '<label class="switch"><input type="checkbox" name="on_site"' + (d.on_site !== false ? ' checked' : '') + '><i></i><span><b>Sitede göster</b><small>Kapatırsanız kart sitede görünmez; randevu almaya devam edebilir.</small></span></label>' +
      '</div><aside class="pv"><span class="pv__l">Sitede böyle görünecek</span><div class="pv__card"><figure class="pv__ph js-pvph"></figure>' +
      '<p class="pv__sp js-pvsp"></p><h3 class="js-pvn"></h3><p class="pv__bio js-pvb"></p></div></aside></div>' +

      '<div class="dedit form" data-p="appt" hidden>' +
      '<label class="switch"><input type="checkbox" name="active"' + (d.active !== false ? ' checked' : '') + '><i></i><span><b>Klinikte çalışıyor</b><small>Kapatırsanız takvimde ve sitede görünmez; geçmiş kayıtlar saklanır.</small></span></label>' +
      '<label class="switch"><input type="checkbox" name="online"' + (d.online !== false ? ' checked' : '') + '><i></i><span><b>Web sitesinden randevu alınabilsin</b><small>Hastalar sitedeki formda bu hekimi seçip boş saatlerinden randevu alabilir.</small></span></label>' +
      '<div class="grid g2"><label class="f"><span>Randevular kaç dakikada bir başlasın?</span><select name="slot_min">' + [10, 15, 20, 30, 45, 60].map(function (n) {
        return '<option value="' + n + '"' + (n === (d.slot_min || 30) ? ' selected' : '') + '>' + n + ' dakikada bir</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Takvimdeki rengi</span><input type="color" name="color" value="' + esc(d.color || '#3f6454') + '"></label></div>' +
      '<div class="f"><span>Haftalık çalışma saatleri</span><small>Öğle arası için iki ayrı aralık girin (örn. 09:00–13:00 ve 14:00–19:00).</small>' + hoursEditor(d.hours || def) + '</div></div>' +
      '<div class="alert js-err" hidden style="margin-top:1rem"></div></form>',
      (d.id ? '<button class="btn btn--d js-del">Hekimi sil</button>' : '') + '<span class="grow"></span><button class="btn js-cancel">Vazgeç</button><button class="btn btn--p js-save">Kaydet</button>', true);

    var f = $('.js-f', m), err = $('.js-err', m);
    bindHours(f);
    $$('.js-tabs button', m).forEach(function (b) {
      b.onclick = function () {
        $$('.js-tabs button', m).forEach(function (x) { x.classList.toggle('on', x === b); });
        $$('.dedit', m).forEach(function (p) { p.hidden = p.dataset.p !== b.dataset.t; });
      };
    });

    function preview() {
      var src = photoData || (removePhoto ? '' : photo);
      $('.js-pvph', m).innerHTML = src ? '<img src="' + esc(src) + '" alt="">' : '<span>' + esc(initials(f.name.value || '?')) + '</span>';
      $('.js-pvsp', m).textContent = f.specialty.value || 'Uzmanlık alanı';
      $('.js-pvn', m).textContent = f.title.value + ' ' + (f.name.value || 'Ad Soyad');
      $('.js-pvb', m).textContent = f.bio.value || 'Tanıtım yazısı burada görünecek.';
      $('.pv__card', m).classList.toggle('is-off', !f.on_site.checked);
      $('.js-cnt', m).textContent = f.bio.value.length + ' / 2000 karakter · Yeni satır için Enter';
      $('.js-phdel', m).hidden = !src;
    }
    f.addEventListener('input', preview); f.addEventListener('change', preview);
    preview();

    var drop = $('.js-drop', m), file = $('.js-file', m);
    function take(fl) {
      if (!fl) return;
      drop.classList.add('is-busy');
      shrink(fl).then(function (url) { photoData = url; removePhoto = false; preview(); toast('Fotoğraf hazır — kaydetmeyi unutmayın'); })
        .catch(oops).then(function () { drop.classList.remove('is-busy'); });
    }
    drop.addEventListener('click', function () { file.click(); });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
    file.addEventListener('change', function () { take(file.files[0]); file.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); }); });
    drop.addEventListener('drop', function (e) { take(e.dataTransfer.files[0]); });
    $('.js-phdel', m).onclick = function () { photoData = null; removePhoto = true; preview(); };

    $('.js-cancel', m).onclick = closeModal;
    $('.js-save', m).onclick = function () {
      err.hidden = true;
      if (!f.name.value.trim()) {
        $('.js-tabs button', m).click(); f.name.focus();
        err.textContent = 'Lütfen hekimin adını yazın.'; err.hidden = false; return;
      }
      var b = { title: f.title.value, name: f.name.value.trim(), specialty: f.specialty.value, color: f.color.value, slot_min: +f.slot_min.value,
        sort: d.id ? d.sort : S.doctors.length, active: f.active.checked, online: f.online.checked, on_site: f.on_site.checked,
        bio: f.bio.value, bio_en: f.bio_en.value, bio_de: f.bio_de.value, hours: readHours(f) };
      var btn = $('.js-save', m); btn.disabled = true; btn.textContent = 'Kaydediliyor…';
      var id = d.id;
      api(id ? 'PUT' : 'POST', '/doctors' + (id ? '/' + id : ''), b)
        .then(function (r) {
          id = id || r.id;
          if (photoData) return api('POST', '/doctors/' + id + '/photo', { data: photoData });
          if (removePhoto && photo) return api('DELETE', '/doctors/' + id + '/photo');
        })
        .then(function () { closeModal(); toast('Kaydedildi — site güncellendi'); return loadRefs(); })
        .then(function () { onDone(); })
        .catch(function (e) { btn.disabled = false; btn.textContent = 'Kaydet'; err.textContent = e.message; err.hidden = false; });
    };
    if (d.id) $('.js-del', m).onclick = function () {
      if (!confirm(docName(d) + ' tamamen silinsin mi?\n\nSadece siteden kaldırmak istiyorsanız “Sitede göster” anahtarını kapatmanız yeterli.')) return;
      api('DELETE', '/doctors/' + d.id).then(function () { closeModal(); toast('Hekim silindi'); return loadRefs(); }).then(function () { onDone(); }).catch(oops);
    };
  }

  /* ── Tedaviler ve fiyatlar ────────────────────────────────────────── */
  function vServices(v) {
    return loadRefs().then(function () {
      v.innerHTML = top('Tedaviler ve fiyatlar', 'Her tedavinin süresi, hastaya fiyatı ve size maliyeti (malzeme + laboratuvar). Kâr otomatik hesaplanır.',
        '<button class="btn btn--p js-new">' + ic('plus') + 'Tedavi ekle</button>') +
        '<div class="card scroll"><table class="tbl"><thead><tr><th>Tedavi</th><th class="r">Süre</th><th class="r">Fiyat</th><th class="r">Maliyet</th><th class="r">Kâr</th><th class="r hide-m">Marj</th><th class="hide-m">Sitede</th><th></th></tr></thead><tbody>' +
        S.services.map(function (s) {
          var pr = s.price || 0, k = pr - (s.cost || 0);
          return '<tr class="click' + (s.active ? '' : ' is-off') + '" data-id="' + s.id + '"><td><b>' + esc(s.name) + '</b>' + (s.active ? '' : ' <span class="badge">Pasif</span>') + '</td>' +
            '<td class="r mono">' + s.duration_min + ' dk</td>' +
            '<td class="r"><input class="cell js-in" type="number" min="0" step="50" inputmode="numeric" data-f="price" value="' + pr + '" aria-label="' + esc(s.name) + ' fiyatı"></td>' +
            '<td class="r"><input class="cell js-in" type="number" min="0" step="50" inputmode="numeric" data-f="cost" value="' + (s.cost || 0) + '" aria-label="' + esc(s.name) + ' maliyeti"></td>' +
            '<td class="r mono js-k"><b>' + money(k) + '</b></td>' +
            '<td class="r mono hide-m js-mg">' + (pr ? '%' + Math.round(k / pr * 100) : '—') + '</td>' +
            '<td class="hide-m">' + (s.online ? 'Randevu formunda' : '<span class="mut">Hayır</span>') + '</td>' +
            '<td class="r"><button class="btn btn--sm js-edit" data-id="' + s.id + '">Düzenle</button></td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="mut" style="font-size:.85rem">Fiyat ve maliyeti doğrudan tabloda değiştirebilirsiniz; yeni işlem kayıtlarına bu fiyat gelir, geçmiş kayıtlar değişmez. ' +
        'Fiyat ve maliyet yalnızca panelde görünür. Diş başına ücretlendirilen tedavilerde tek diş fiyatını girin. ' +
        'Kira, maaş gibi genel giderler <a href="#/analiz/giderler">Analiz → Giderler</a> sayfasında.</p>';
      $('.js-new', v).onclick = function () { editService({}); };
      $$('tr.click', v).forEach(function (tr) {
        var s = findSvc(+tr.dataset.id);
        tr.onclick = function (e) { if (!e.target.closest('input')) editService(s); };
        $$('.js-in', tr).forEach(function (inp) {
          inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });
          inp.addEventListener('change', function () {
            var b = { name: s.name, duration_min: s.duration_min, price: s.price, cost: s.cost, sort: s.sort, online: !!s.online, active: !!s.active };
            b[inp.dataset.f] = Math.max(0, Math.round(+inp.value || 0));
            api('PUT', '/services/' + s.id, b).then(function () {
              s[inp.dataset.f] = b[inp.dataset.f];
              var k = (s.price || 0) - (s.cost || 0);
              $('.js-k', tr).innerHTML = '<b>' + money(k) + '</b>'; $('.js-mg', tr).textContent = s.price ? '%' + Math.round(k / s.price * 100) : '—';
              inp.classList.add('is-saved'); setTimeout(function () { inp.classList.remove('is-saved'); }, 900);
              toast(s.name + ' güncellendi');
            }).catch(function (e) { inp.value = s[inp.dataset.f] || 0; oops(e); });
          });
        });
      });
    });
  }
  function editService(s) {
    var m = openModal(s.id ? s.name : 'Yeni tedavi',
      '<form class="form" novalidate><label class="f"><span>Tedavi adı</span><input name="name" value="' + esc(s.name || '') + '" placeholder="örn. Zirkonyum kaplama"></label>' +
      '<div class="grid g3"><label class="f"><span>Hastaya fiyatı (₺)</span><input type="number" name="price" min="0" step="50" inputmode="numeric" value="' + (s.price || '') + '"></label>' +
      '<label class="f"><span>Size maliyeti (₺)</span><input type="number" name="cost" min="0" step="50" inputmode="numeric" value="' + (s.cost || '') + '"><small>Malzeme + laboratuvar</small></label>' +
      '<div class="f"><span>Kâr</span><div class="profit js-pf"></div></div></div>' +
      '<label class="f"><span>Randevu süresi</span><select name="duration_min">' + [15, 20, 30, 45, 60, 75, 90, 120].concat(s.duration_min && [15, 20, 30, 45, 60, 75, 90, 120].indexOf(s.duration_min) < 0 ? [s.duration_min] : []).map(function (n) {
        return '<option value="' + n + '"' + (n === (s.duration_min || 30) ? ' selected' : '') + '>' + n + ' dakika</option>'; }).join('') + '</select></label>' +
      '<label class="switch"><input type="checkbox" name="online"' + (s.online !== 0 ? ' checked' : '') + '><i></i><span><b>Sitedeki randevu formunda seçilebilsin</b></span></label>' +
      '<label class="switch"><input type="checkbox" name="active"' + (s.active !== 0 ? ' checked' : '') + '><i></i><span><b>Kullanımda</b><small>Kapatırsanız yeni randevu ve kayıtlarda çıkmaz; geçmiş kayıtlar kalır.</small></span></label>' +
      '<div class="alert js-err" hidden></div></form>',
      (s.id ? '<button class="btn btn--d js-del">Sil</button>' : '') + '<span class="grow"></span><button class="btn js-cancel">Vazgeç</button><button class="btn btn--p js-save">Kaydet</button>');
    var f = $('form', m);
    function pf() {
      var p = +f.price.value || 0, c = +f.cost.value || 0, k = p - c;
      $('.js-pf', m).innerHTML = p ? '<b class="' + (k < 0 ? 'neg' : '') + '">' + money(k) + '</b> <span class="mut">%' + Math.round(k / p * 100) + ' marj</span>' : '<span class="mut">Fiyat girin</span>';
    }
    f.addEventListener('input', pf); pf();
    $('.js-cancel', m).onclick = closeModal;
    $('.js-save', m).onclick = function () {
      api(s.id ? 'PUT' : 'POST', '/services' + (s.id ? '/' + s.id : ''), { name: f.name.value, duration_min: +f.duration_min.value, price: +f.price.value || null, cost: +f.cost.value || 0,
        sort: s.sort || S.services.length, online: f.online.checked, active: f.active.checked })
        .then(function () { closeModal(); toast('Kaydedildi'); route(); })
        .catch(function (e) { var al = $('.js-err', m); al.textContent = e.message; al.hidden = false; });
    };
    if (s.id) $('.js-del', m).onclick = function () {
      if (!confirm(s.name + ' tedavi listesinden silinsin mi?')) return;
      var done = function () { closeModal(); toast(s.name + ' silindi'); loadRefs().then(route); };
      api('DELETE', '/services/' + s.id).then(done).catch(function (e) {
        if (e.status !== 409) return oops(e);
        if (!confirm(e.message + '\n\nYine de silinsin mi? Geçmiş işlem kayıtlarındaki açıklamalar ve ücretler aynen kalır; ' +
          'randevuların notuna tedavi adı yazılır.\n\nYalnızca listeden kaldırmak isterseniz “Vazgeç” deyip “Kullanımda” anahtarını kapatın.')) return;
        api('DELETE', '/services/' + s.id + '?force=1').then(done).catch(oops);
      });
    };
  }

  /* ── Grafikler ─────────────────────────────────────────────────────────
     Bağımlılıksız SVG. Renkler admin.css'teki --s1..--s3 (doğrulanmış kategorik palet) ve --q1..--q5 (sıralı mavi).
     İnce çizgiler, 4px yuvarlak veri ucu, 2px yüzey boşluğu, üzerine gelince ipucu; her grafiğin tablo görünümü var. */
  var SVGNS = 'http://www.w3.org/2000/svg';
  var MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  function compact(n) {
    var a = Math.abs(n), s = n < 0 ? '−' : '';
    if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',').replace(',0', '') + ' Mn';
    if (a >= 1e3) return s + Math.round(a / 1e3) + ' B';
    return s + Math.round(a);
  }
  var tl = function (n) { return (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('tr-TR') + ' ₺'; };
  var pct = function (x) { return '%' + (Math.round(x * 1000) / 10).toLocaleString('tr-TR'); };
  function niceStep(span, n) {
    var raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw || 1))), m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  function scaleY(min, max, n) {
    var step = niceStep((max - min) || 1, n || 4), lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
    if (hi === lo) hi = lo + step;
    for (var t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t * 100) / 100);
    return { lo: lo, hi: hi, ticks: ticks };
  }
  function el(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function svgText(parent, x, y, str, cls, anchor) { var t = el('text', { x: x, y: y, class: cls || 'ax', 'text-anchor': anchor || 'start' }, parent); t.textContent = str; return t; }
  /* çubuk: taban tarafı düz, veri ucu 4px yuvarlak */
  function barPath(x0, x1, y, h, horizontal) {
    var r = Math.min(4, Math.abs(x1 - x0) / 2, h / 2);
    if (horizontal) {
      var dir = x1 >= x0 ? 1 : -1;
      return 'M' + x0 + ',' + y + 'H' + (x1 - dir * r) + 'Q' + x1 + ',' + y + ' ' + x1 + ',' + (y + r) + 'V' + (y + h - r) + 'Q' + x1 + ',' + (y + h) + ' ' + (x1 - dir * r) + ',' + (y + h) + 'H' + x0 + 'Z';
    }
    // dikey: x0=sol, x1=sağ, y=üst, h=yükseklik (taban altta)
    return 'M' + x0 + ',' + (y + h) + 'V' + (y + r) + 'Q' + x0 + ',' + y + ' ' + (x0 + r) + ',' + y + 'H' + (x1 - r) + 'Q' + x1 + ',' + y + ' ' + x1 + ',' + (y + r) + 'V' + (y + h) + 'Z';
  }

  var tipEl;
  function tip(html, x, y) {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'chtip'; tipEl.setAttribute('role', 'status'); document.body.appendChild(tipEl); }
    if (html === null) { tipEl.hidden = true; return; }
    tipEl.innerHTML = html; tipEl.hidden = false;
    var w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var left = x + 14 + w > window.innerWidth - 8 ? x - w - 14 : x + 14;
    tipEl.style.left = Math.max(8, left) + 'px';
    tipEl.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, y - h / 2)) + 'px';
  }
  document.addEventListener('scroll', function () { tip(null); }, true);

  /* Çizgi grafik: aynı birimde (₺) en fazla 3 seri, tek eksen */
  function lineChart(box, labels, series, opt) {
    opt = opt || {};
    box.innerHTML = '';
    var W = Math.max(320, box.clientWidth), H = opt.h || 280, L = 58, Rm = 92, T = 14, B = 30;
    var all = []; series.forEach(function (s) { all = all.concat(s.values); });
    var sc = scaleY(Math.min(0, Math.min.apply(null, all)), Math.max.apply(null, all), 4);
    var x = function (i) { return L + (labels.length < 2 ? (W - L - Rm) / 2 : i * (W - L - Rm) / (labels.length - 1)); };
    var y = function (v) { return T + (sc.hi - v) / (sc.hi - sc.lo) * (H - T - B); };
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': opt.aria || '' }, box);
    sc.ticks.forEach(function (t) {
      el('line', { x1: L, x2: W - Rm + 8, y1: y(t), y2: y(t), class: t === 0 ? 'base' : 'grid' }, svg);
      svgText(svg, L - 8, y(t) + 4, compact(t), 'ax', 'end');
    });
    var every = Math.max(1, Math.ceil(labels.length / Math.floor((W - L - Rm) / 64)));
    labels.forEach(function (lb, i) { if (i % every === 0 || i === labels.length - 1) svgText(svg, x(i), H - 8, lb, 'ax', 'middle'); });
    series.forEach(function (s) {
      el('path', { d: s.values.map(function (v, i) { return (i ? 'L' : 'M') + x(i) + ',' + y(v); }).join(''), class: 'ln', style: 'stroke:' + s.color }, svg);
    });
    // sağ uçta etiket: birbirine çok yakınsa yazılmaz (lejant ve ipucu taşır)
    var ends = series.map(function (s) { return { s: s, y: y(s.values[s.values.length - 1]) }; }).sort(function (a, b) { return a.y - b.y; });
    ends.forEach(function (e, i) {
      el('circle', { cx: x(labels.length - 1), cy: e.y, r: 4, class: 'dot', style: 'fill:' + e.s.color }, svg);
      var near = ends.some(function (o, j) { return j !== i && Math.abs(o.y - e.y) < 15; });
      if (!near) svgText(svg, x(labels.length - 1) + 10, e.y + 4, e.s.name, 'lbl');
    });
    // üzerine gelince dikey çizgi + değerler
    var cross = el('line', { y1: T, y2: H - B, class: 'cross', visibility: 'hidden' }, svg);
    var marks = series.map(function (s) { return el('circle', { r: 4, class: 'dot', style: 'fill:' + s.color, visibility: 'hidden' }, svg); });
    var hit = el('rect', { x: L - 10, y: 0, width: W - L - Rm + 20, height: H, fill: 'transparent' }, svg);
    function at(ev) {
      var r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width;
      var i = Math.max(0, Math.min(labels.length - 1, Math.round((px - L) / ((W - L - Rm) / Math.max(1, labels.length - 1)))));
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
      marks.forEach(function (m, k) { m.setAttribute('cx', x(i)); m.setAttribute('cy', y(series[k].values[i])); m.setAttribute('visibility', 'visible'); });
      tip('<b>' + esc(opt.full ? opt.full[i] : labels[i]) + '</b>' + series.map(function (s) {
        return '<span class="row"><i class="sw" style="background:' + s.color + '"></i>' + esc(s.name) + '<em>' + tl(s.values[i]) + '</em></span>';
      }).join('') + (opt.note && opt.note(i) ? '<small>' + esc(opt.note(i)) + '</small>' : ''), ev.clientX, ev.clientY);
    }
    hit.addEventListener('mousemove', at);
    hit.addEventListener('mouseleave', function () { cross.setAttribute('visibility', 'hidden'); marks.forEach(function (m) { m.setAttribute('visibility', 'hidden'); }); tip(null); });
  }

  /* Yatay çubuk: tek seri, sıralı; negatif değerleri tabanın soluna çizer */
  function hbarChart(box, rows, opt) {
    opt = opt || {};
    box.innerHTML = '';
    if (!rows.length) { box.innerHTML = '<p class="empty">Bu dönemde veri yok.</p>'; return; }
    var W = Math.max(300, box.clientWidth), LW = Math.min(170, W * 0.36), RW = 70, RH = 32, BH = 16, H = rows.length * RH + 6;
    var vals = rows.map(function (r) { return r.value; });
    var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(0, Math.max.apply(null, vals)) || 1;
    var xs = function (v) { return LW + (v - lo) / (hi - lo) * (W - LW - RW); };
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': opt.aria || '' }, box);
    el('line', { x1: xs(0), x2: xs(0), y1: 0, y2: H, class: 'base' }, svg);
    rows.forEach(function (r, i) {
      var y0 = i * RH + (RH - BH) / 2;
      var g = el('g', { class: 'hrow' }, svg);
      el('rect', { x: 0, y: i * RH, width: W, height: RH, class: 'hbg' }, g);
      var name = r.label.length > 24 ? r.label.slice(0, 23) + '…' : r.label;
      svgText(g, LW - 10, y0 + BH / 2 + 4, name, 'ax2', 'end');
      if (r.value !== 0) el('path', { d: barPath(xs(0), xs(r.value), y0, BH, true), style: 'fill:' + (r.color || opt.color) }, g);
      var tx = r.value >= 0 ? xs(r.value) + 6 : xs(r.value) - 6;
      svgText(g, tx, y0 + BH / 2 + 4, (opt.fmt || compact)(r.value), 'val', r.value >= 0 ? 'start' : 'end');
      g.addEventListener('mousemove', function (ev) { tip('<b>' + esc(r.label) + '</b>' + (r.tip || ''), ev.clientX, ev.clientY); });
      g.addEventListener('mouseleave', function () { tip(null); });
    });
  }

  /* Sütun: tek seri zaman dizisi */
  function colChart(box, labels, values, opt) {
    opt = opt || {};
    box.innerHTML = '';
    var W = Math.max(300, box.clientWidth), H = opt.h || 240, L = 40, Rm = 10, T = 18, B = 30;
    var sc = scaleY(0, Math.max.apply(null, values.concat([1])), 4);
    var band = (W - L - Rm) / labels.length, bw = Math.min(24, band - 2);
    var y = function (v) { return T + (sc.hi - v) / (sc.hi - sc.lo) * (H - T - B); };
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': opt.aria || '' }, box);
    sc.ticks.forEach(function (t) { el('line', { x1: L, x2: W - Rm, y1: y(t), y2: y(t), class: t ? 'grid' : 'base' }, svg); svgText(svg, L - 8, y(t) + 4, compact(t), 'ax', 'end'); });
    var every = Math.max(1, Math.ceil(labels.length / Math.floor((W - L) / 46)));
    var mx = values.indexOf(Math.max.apply(null, values));
    labels.forEach(function (lb, i) {
      var cx = L + band * i + band / 2, g = el('g', {}, svg);
      el('rect', { x: L + band * i, y: T, width: band, height: H - T - B, fill: 'transparent' }, g);
      if (values[i] > 0) el('path', { d: barPath(cx - bw / 2, cx + bw / 2, y(values[i]), y(0) - y(values[i]), false), style: 'fill:' + opt.color }, g);
      if (i === mx || i === labels.length - 1) svgText(g, cx, y(values[i]) - 6, String(values[i]), 'val', 'middle');
      if (i % every === 0 || i === labels.length - 1) svgText(svg, cx, H - 8, lb, 'ax', 'middle');
      g.addEventListener('mousemove', function (ev) { tip('<b>' + esc(opt.full ? opt.full[i] : lb) + '</b><span class="row">' + esc(opt.name) + '<em>' + values[i].toLocaleString('tr-TR') + '</em></span>', ev.clientX, ev.clientY); });
      g.addEventListener('mouseleave', function () { tip(null); });
    });
  }

  /* Isı haritası: gün × saat, haftalık ortalama randevu; 5 adımlı sıralı mavi */
  function heatmap(box, hm) {
    box.innerHTML = '';
    var all = []; hm.cells.forEach(function (r) { r.forEach(function (v) { if (v > 0) all.push(v); }); });
    all.sort(function (a, b) { return a - b; });
    var q = [0.2, 0.4, 0.6, 0.8].map(function (p) { return all[Math.floor(p * (all.length - 1))] || 0; });
    var step = function (v) { if (!v) return 0; for (var i = 0; i < q.length; i++) if (v <= q[i]) return i + 1; return 5; };
    var DN = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'], DF = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    var W = Math.max(320, box.clientWidth), L = 44, T = 22, gap = 2;
    var cw = Math.min(64, (W - L) / hm.hours.length), ch = 30, H = T + hm.days.length * ch + 4;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': 'Gün ve saate göre randevu yoğunluğu' }, box);
    hm.hours.forEach(function (h, j) { svgText(svg, L + j * cw + cw / 2, 14, String(h).padStart(2, '0') + ':00', 'ax', 'middle'); });
    hm.days.forEach(function (d, i) {
      svgText(svg, L - 8, T + i * ch + ch / 2 + 4, DN[d], 'ax2', 'end');
      hm.hours.forEach(function (h, j) {
        var v = hm.cells[i][j], c = el('rect', { x: L + j * cw + gap / 2, y: T + i * ch + gap / 2, width: cw - gap, height: ch - gap, rx: 3, class: 'q' + step(v) }, svg);
        c.addEventListener('mousemove', function (ev) {
          tip('<b>' + DF[d] + ' ' + String(h).padStart(2, '0') + ':00–' + String(h + 1).padStart(2, '0') + ':00</b><span class="row">Haftada ortalama<em>' + v.toLocaleString('tr-TR') + ' randevu</em></span>', ev.clientX, ev.clientY);
        });
        c.addEventListener('mouseleave', function () { tip(null); });
      });
    });
    var lg = document.createElement('div');
    lg.className = 'hm-legend';
    lg.innerHTML = '<span>Az</span>' + [1, 2, 3, 4, 5].map(function (i) { return '<i class="q' + i + '"></i>'; }).join('') + '<span>Yoğun</span>';
    box.appendChild(lg);
  }

  function tableHtml(head, rows) {
    return '<div class="scroll"><table class="tbl"><thead><tr>' + head.map(function (h, i) { return '<th' + (i ? ' class="r"' : '') + '>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (i ? ' class="r mono"' : '') + '>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function chartCard(cls, title, sub, legend) {
    return '<section class="card chc ' + cls + '"><div class="card__h"><div><h2>' + esc(title) + '</h2>' + (sub ? '<p class="mut chc__sub">' + sub + '</p>' : '') + '</div>' +
      '<button type="button" class="btn btn--sm btn--ghost js-tbl" aria-pressed="false">Tablo</button></div>' +
      (legend ? '<div class="chlegend">' + legend + '</div>' : '') +
      '<div class="card__b"><div class="ch"></div><div class="chtbl" hidden></div></div></section>';
  }
  function legendHtml(items) { return items.map(function (s) { return '<span><i class="sw" style="background:' + s.color + '"></i>' + esc(s.name) + '</span>'; }).join(''); }

  /* ── Analiz ────────────────────────────────────────────────────────── */
  var AN = { period: '12m', from: '', to: '', doctor: '' };
  function periodRange(p) {
    var t = today(), y = t.slice(0, 4);
    if (p === '30d') return [addDays(t, -29), t];
    if (p === '3m') return [addDays(t, -90), t];
    if (p === 'ytd') return [y + '-01-01', t];
    if (p === 'custom') return [AN.from || addDays(t, -29), AN.to || t];
    var d = new Date(t.slice(0, 7) + '-01T12:00:00'); d.setMonth(d.getMonth() - 11);
    return [ymd(d), t];
  }
  function bucketLabel(key, bucket, full) {
    if (bucket === 'month') { var m = +key.slice(5, 7) - 1; return full ? ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][m] + ' ' + key.slice(0, 4) : MONTHS[m] + ' ' + key.slice(2, 4); }
    return full ? fmtDate(key, { day: 'numeric', month: 'long' }) + ' haftası' : fmtDate(key, { day: 'numeric', month: 'short' });
  }

  function vAnalytics(v, args) {
    if (args[0] === 'giderler') return vExpenses(v);
    var r = periodRange(AN.period);
    v.innerHTML = top('Analiz', 'Ciro, kâr, tedaviler ve randevu yoğunluğu.',
      '<div class="seg"><a class="on" href="#/analiz">Genel bakış</a><a href="#/analiz/giderler">Giderler</a></div>') +
      '<div class="card filt"><div class="card__b row">' +
      '<div class="seg js-per" role="group" aria-label="Dönem">' + [['30d', 'Son 30 gün'], ['3m', 'Son 3 ay'], ['12m', 'Son 12 ay'], ['ytd', 'Bu yıl'], ['custom', 'Özel']].map(function (p) {
        return '<button type="button" data-p="' + p[0] + '" class="' + (AN.period === p[0] ? 'on' : '') + '">' + p[1] + '</button>'; }).join('') + '</div>' +
      '<span class="row js-custom"' + (AN.period === 'custom' ? '' : ' hidden') + '><input type="date" class="js-from" value="' + r[0] + '" style="width:auto">–<input type="date" class="js-to" value="' + r[1] + '" style="width:auto"></span>' +
      '<span class="grow"></span><select class="js-doc" style="width:auto"><option value="">Tüm hekimler</option>' + S.doctors.map(function (d) {
        return '<option value="' + d.id + '"' + (String(d.id) === AN.doctor ? ' selected' : '') + '>' + esc(docName(d)) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="js-an"><p class="boot">Hesaplanıyor…</p></div>';

    $$('.js-per button', v).forEach(function (b) { b.onclick = function () { AN.period = b.dataset.p; route(); }; });
    $('.js-doc', v).onchange = function (e) { AN.doctor = e.target.value; route(); };
    $$('.js-from, .js-to', v).forEach(function (i) { i.onchange = function () { AN.from = $('.js-from', v).value; AN.to = $('.js-to', v).value; route(); }; });

    return api('GET', '/analytics?from=' + r[0] + '&to=' + r[1] + (AN.doctor ? '&doctor=' + AN.doctor : '')).then(function (d) { drawAnalytics($('.js-an', v), d); });
  }

  function delta(cur, prev, upGood, isRate) {
    if (prev === undefined) return '';
    if (prev === null || cur === null) return '';
    if (!prev && !cur) return '';
    if (!prev) return '<span class="dl">önceki dönemde veri yok</span>';
    var ch = isRate ? cur - prev : (cur - prev) / Math.abs(prev);
    if (Math.abs(ch) < 0.005) return '<span class="dl">önceki döneme göre aynı</span>';
    var good = (ch > 0) === upGood;
    return '<span class="dl ' + (good ? 'up' : 'down') + '">' + (ch > 0 ? '▲ ' : '▼ ') + (isRate ? (Math.round(Math.abs(ch) * 1000) / 10).toLocaleString('tr-TR') + ' puan' : pct(Math.abs(ch))) + '<small> önceki döneme göre</small></span>';
  }

  function drawAnalytics(box, d) {
    var t = d.totals, p = d.prev || {}, doc = !!d.range.doctor;
    var labels = d.series.map(function (s) { return bucketLabel(s.key, d.range.bucket); });
    var full = d.series.map(function (s) { return bucketLabel(s.key, d.range.bucket, true); });
    var C = { s1: 'var(--s1)', s2: 'var(--s2)', s3: 'var(--s3)' };
    var lastPartial = d.series.length && (d.range.bucket === 'month' ? today().slice(0, 7) === d.series[d.series.length - 1].key : true);

    var tiles = [
      ['Ciro', tl(t.revenue), delta(t.revenue, p.revenue, true)],
      doc ? ['Brüt kâr', tl(t.grossProfit), delta(t.grossProfit, p.grossProfit, true)] : ['Net kâr', tl(t.netProfit), delta(t.netProfit, p.netProfit, true)],
      ['Tahsil edilen', tl(t.collected), '<span class="dl">Cironun ' + pct(t.revenue ? t.collected / t.revenue : 0) + ' kadarı</span>'],
      ['Açık bakiye (tümü)', tl(d.outstanding), '<span class="dl">Hastaların henüz ödemediği</span>'],
      ['Randevu', t.appts.toLocaleString('tr-TR'), delta(t.appts, p.appts, true)],
      ['Yeni hasta', t.newPatients.toLocaleString('tr-TR'), delta(t.newPatients, p.newPatients, true)],
      ['Gelmeme oranı', pct(t.noshowRate), delta(t.noshowRate, p.noshowRate, false, true)],
      ['Online randevu payı', pct(t.onlineShare), delta(t.onlineShare, p.onlineShare, true, true)]
    ];

    // öne çıkanlar: sayıları cümleye çevir
    var best = d.byService.filter(function (s) { return s.revenue > 0; });
    var topS = best[0], topM = best.slice().sort(function (a, b) { return b.margin - a.margin; })[0];
    var busy = null; d.heatmap.cells.forEach(function (r, i) { r.forEach(function (v, j) { if (!busy || v > busy.v) busy = { v: v, d: d.heatmap.days[i], h: d.heatmap.hours[j] }; }); });
    var DF = ['pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi'];
    var bestMonth = d.series.slice().sort(function (a, b) { return b.revenue - a.revenue; })[0];
    var facts = [];
    if (topS) facts.push('En çok kâr bırakan tedavi <b>' + esc(topS.name) + '</b>: ' + tl(topS.profit) + ' (' + topS.count + ' işlem).');
    if (topM && topM !== topS) facts.push('Kâr marjı en yüksek tedavi <b>' + esc(topM.name) + '</b>: ' + pct(topM.margin) + '.');
    if (bestMonth && d.range.bucket === 'month') facts.push('En yüksek cirolu ay <b>' + bucketLabel(bestMonth.key, 'month', true) + '</b>: ' + tl(bestMonth.revenue) + '.');
    if (busy && busy.v) facts.push('En yoğun zaman <b>' + DF[busy.d] + ' ' + String(busy.h).padStart(2, '0') + ':00</b> civarı (haftada ort. ' + busy.v.toLocaleString('tr-TR') + ' randevu).');
    if (!d.prev) facts.push('<span class="mut">Önceki dönemle karşılaştırma için o döneme ait kayıt yok; kayıtlar biriktikçe kutularda artış/azalış da görünecek.</span>');
    if (!doc && t.expenses) facts.push('Genel giderler cironun <b>' + pct(t.expenses / (t.revenue || 1)) + '</b> kadarı; tedavi malzeme/laboratuvar maliyeti ' + pct(t.treatmentCost / (t.revenue || 1)) + ' kadarı.');

    var lineS = doc
      ? [{ name: 'Ciro', color: C.s1, k: 'revenue' }, { name: 'Tedavi maliyeti', color: C.s2, k: 'cost' }, { name: 'Brüt kâr', color: C.s3, k: 'gross' }]
      : [{ name: 'Ciro', color: C.s1, k: 'revenue' }, { name: 'Toplam gider', color: C.s2, k: 'allcost' }, { name: 'Net kâr', color: C.s3, k: 'net' }];
    lineS.forEach(function (s) {
      s.values = d.series.map(function (b) { return s.k === 'gross' ? b.revenue - b.cost : s.k === 'allcost' ? b.cost + b.expenses : b[s.k]; });
    });

    box.innerHTML =
      '<div class="grid g4 tiles">' + tiles.map(function (x) { return '<div class="card stat2"><span>' + x[0] + '</span><b>' + x[1] + '</b>' + (x[2] || '') + '</div>'; }).join('') + '</div>' +
      (facts.length ? '<section class="card facts"><div class="card__h"><h2>Öne çıkanlar</h2><span class="mut" style="font-size:.85rem">' + fmtDate(d.range.from) + ' – ' + fmtDate(d.range.to) + '</span></div><ul>' +
        facts.map(function (f) { return '<li>' + f + '</li>'; }).join('') + '</ul></section>' : '') +
      chartCard('js-c1', doc ? 'Ciro, tedavi maliyeti ve brüt kâr' : 'Ciro, giderler ve net kâr',
        (d.range.bucket === 'month' ? 'Aylık' : 'Haftalık') + (doc ? '. Genel giderler hekime bölünmediği için net kâr gösterilmez.' : '. Toplam gider = tedavi malzeme/laboratuvar maliyeti + kira, maaş gibi genel giderler.') +
        (lastPartial ? ' Son ' + (d.range.bucket === 'month' ? 'ay' : 'hafta') + ' henüz bitmedi.' : ''), legendHtml(lineS)) +
      '<div class="grid g2">' +
      chartCard('js-c2', 'Tedavilere göre kâr', 'Ücret − malzeme/laboratuvar maliyeti. Üzerine gelince ciro, maliyet ve marj.') +
      chartCard('js-c3', 'Hekimlere göre ciro', 'Üzerine gelince kâr, randevu sayısı ve gelmeme oranı.') +
      '</div><div class="grid g2">' +
      chartCard('js-c4', 'Yeni hastalar', 'İlk kez randevu alan hasta sayısı, ' + (d.range.bucket === 'month' ? 'aylık' : 'haftalık') + '.') +
      (doc ? '' : chartCard('js-c5', 'Giderlerin dağılımı', 'Genel giderler (tedavi maliyetleri hariç). <a href="#/analiz/giderler">Gider ekle</a>')) +
      '</div>' + chartCard('js-c6', 'Randevu yoğunluğu', 'Gün ve saate göre haftalık ortalama randevu sayısı (iptaller hariç).');

    function render() {
      lineChart($('.js-c1 .ch', box), labels, lineS, { full: full, aria: 'Dönemlere göre ciro, gider ve kâr',
        note: function (i) { return lastPartial && i === labels.length - 1 ? 'Dönem henüz bitmedi' : ''; } });
      hbarChart($('.js-c2 .ch', box), d.byService.map(function (s) {
        return { label: s.name, value: s.profit, tip: '<span class="row">Ciro<em>' + tl(s.revenue) + '</em></span><span class="row">Maliyet<em>' + tl(s.cost) + '</em></span>' +
          '<span class="row">Kâr<em>' + tl(s.profit) + '</em></span><span class="row">Marj<em>' + pct(s.margin) + '</em></span><span class="row">İşlem<em>' + s.count + '</em></span>' };
      }), { color: C.s1, aria: 'Tedavilere göre kâr' });
      hbarChart($('.js-c3 .ch', box), d.byDoctor.map(function (s) {
        return { label: s.name, value: s.revenue, tip: '<span class="row">Ciro<em>' + tl(s.revenue) + '</em></span><span class="row">Brüt kâr<em>' + tl(s.profit) + '</em></span>' +
          '<span class="row">Randevu<em>' + s.appts + '</em></span><span class="row">Gelmeme<em>' + pct(s.noshowRate) + '</em></span>' };
      }), { color: C.s1, aria: 'Hekimlere göre ciro' });
      colChart($('.js-c4 .ch', box), labels, d.series.map(function (s) { return s.newPatients; }), { color: C.s1, name: 'Yeni hasta', full: full, aria: 'Dönemlere göre yeni hasta' });
      if (!doc) hbarChart($('.js-c5 .ch', box), d.expensesByCat.map(function (e) {
        return { label: e.category, value: e.amount, tip: '<span class="row">Tutar<em>' + tl(e.amount) + '</em></span><span class="row">Toplam giderin<em>' + pct(e.amount / (t.expenses || 1)) + '</em></span>' };
      }), { color: C.s2, aria: 'Gider türlerine göre dağılım' });
      heatmap($('.js-c6 .ch', box), d.heatmap);
    }
    render();
    AN.render = render;

    // tablo görünümleri
    var tables = {
      'js-c1': tableHtml([d.range.bucket === 'month' ? 'Ay' : 'Hafta'].concat(lineS.map(function (s) { return s.name; })), d.series.map(function (b, i) { return [full[i]].concat(lineS.map(function (s) { return tl(s.values[i]); })); })),
      'js-c2': tableHtml(['Tedavi', 'İşlem', 'Ciro', 'Maliyet', 'Kâr', 'Marj'], d.byService.map(function (s) { return [s.name, s.count, tl(s.revenue), tl(s.cost), tl(s.profit), pct(s.margin)]; })),
      'js-c3': tableHtml(['Hekim', 'Ciro', 'Brüt kâr', 'Randevu', 'Gelmeme'], d.byDoctor.map(function (s) { return [s.name, tl(s.revenue), tl(s.profit), s.appts, pct(s.noshowRate)]; })),
      'js-c4': tableHtml([d.range.bucket === 'month' ? 'Ay' : 'Hafta', 'Yeni hasta', 'Randevu'], d.series.map(function (b, i) { return [full[i], b.newPatients, b.appts]; })),
      'js-c5': tableHtml(['Gider türü', 'Tutar', 'Pay'], d.expensesByCat.map(function (e) { return [e.category, tl(e.amount), pct(e.amount / (t.expenses || 1))]; })),
      'js-c6': tableHtml(['Gün'].concat(d.heatmap.hours.map(function (h) { return String(h).padStart(2, '0') + ':00'; })),
        d.heatmap.cells.map(function (r, i) { return [DF[d.heatmap.days[i]]].concat(r.map(function (v) { return v.toLocaleString('tr-TR'); })); }))
    };
    $$('.chc', box).forEach(function (c) {
      var k = Object.keys(tables).filter(function (x) { return c.classList.contains(x); })[0], b = $('.js-tbl', c);
      b.onclick = function () {
        var on = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Grafik' : 'Tablo';
        $('.chtbl', c).innerHTML = on ? tables[k] : ''; $('.chtbl', c).hidden = !on; $('.ch', c).hidden = on;
        var lg = $('.chlegend', c); if (lg) lg.hidden = on;
      };
    });
  }
  var rzT;
  window.addEventListener('resize', function () {
    clearTimeout(rzT);
    rzT = setTimeout(function () { if (/^analiz$/.test(current) && AN.render && $('.js-c1')) AN.render(); }, 150);
  });

  /* ── Giderler ──────────────────────────────────────────────────────── */
  var expMonth = '';
  function vExpenses(v) {
    if (!expMonth) expMonth = today().slice(0, 7);
    var from = expMonth + '-01', to = expMonth + '-31';
    return api('GET', '/expenses?from=' + from + '&to=' + to).then(function (r) {
      var total = r.items.reduce(function (s, e) { return s + e.amount; }, 0), byCat = {};
      r.items.forEach(function (e) { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
      v.innerHTML = top('Analiz', 'Kira, maaş, fatura gibi genel giderleri buraya girin; net kâr bunlardan hesaplanır.',
        '<div class="seg"><a href="#/analiz">Genel bakış</a><a class="on" href="#/analiz/giderler">Giderler</a></div>') +
        '<div class="card"><div class="card__b row"><button type="button" class="btn js-prev" aria-label="Önceki ay">' + ic('left') + '</button>' +
        '<input type="month" class="js-m" value="' + expMonth + '" style="width:auto"><button type="button" class="btn js-next" aria-label="Sonraki ay">' + ic('right') + '</button>' +
        '<span class="grow"></span><span class="stat-inline">Bu ay toplam <b>' + tl(total) + '</b></span>' +
        '<button type="button" class="btn btn--p js-new">' + ic('plus') + 'Gider ekle</button></div></div>' +
        '<div class="grid g-side"><section class="card scroll">' + (r.items.length ? '<table class="tbl"><thead><tr><th>Tarih</th><th>Tür</th><th class="hide-m">Açıklama</th><th class="r">Tutar</th></tr></thead><tbody>' +
          r.items.map(function (e) {
            return '<tr class="click" data-id="' + e.id + '"><td class="mono">' + fmtDate(e.date, { day: 'numeric', month: 'short' }) + '</td><td>' + esc(e.category) + '</td>' +
              '<td class="hide-m mut">' + esc(e.note) + '</td><td class="r mono">' + tl(e.amount) + '</td></tr>';
          }).join('') + '</tbody></table>' : '<p class="empty">Bu ay için gider girilmemiş.</p>') + '</section>' +
        '<aside class="card"><div class="card__h"><h2>Türe göre</h2></div><div class="card__b">' + (Object.keys(byCat).length ? '<div class="ch js-ec"></div>' : '<p class="mut">—</p>') +
        '<p class="mut" style="font-size:.82rem;margin:.8rem 0 0">Tedavi başına malzeme ve laboratuvar maliyetini burada değil, <a href="#/hizmetler">Tedaviler ve fiyatlar</a> sayfasında ya da hasta kartındaki tedavi kaydında girin.</p></div></aside></div>';
      var go = function (m) { expMonth = m; route(); };
      var shift = function (n) { var d = new Date(expMonth + '-01T12:00:00'); d.setMonth(d.getMonth() + n); go(ymd(d).slice(0, 7)); };
      $('.js-prev', v).onclick = function () { shift(-1); };
      $('.js-next', v).onclick = function () { shift(1); };
      $('.js-m', v).onchange = function (e) { if (e.target.value) go(e.target.value); };
      $('.js-new', v).onclick = function () { editExpense({ date: expMonth === today().slice(0, 7) ? today() : expMonth + '-01' }, r.categories); };
      $$('tr.click', v).forEach(function (tr) { tr.onclick = function () { editExpense(r.items.filter(function (e) { return e.id === +tr.dataset.id; })[0], r.categories); }; });
      var ec = $('.js-ec', v);
      if (ec) hbarChart(ec, Object.keys(byCat).map(function (k) { return { label: k, value: byCat[k], tip: '<span class="row">Tutar<em>' + tl(byCat[k]) + '</em></span>' }; })
        .sort(function (a, b) { return b.value - a.value; }), { color: 'var(--s2)', aria: 'Bu ayın giderleri türe göre' });
    });
  }
  function editExpense(e, cats) {
    var m = openModal(e.id ? 'Gider' : 'Yeni gider',
      '<form class="form" novalidate><div class="grid g2"><label class="f"><span>Tarih</span><input type="date" name="date" value="' + esc(e.date || today()) + '"></label>' +
      '<label class="f"><span>Tutar (₺)</span><input type="number" name="amount" min="1" step="50" inputmode="numeric" value="' + (e.amount || '') + '" placeholder="örn. 45000"></label></div>' +
      '<div class="f"><span>Gider türü</span><div class="chips js-cats">' + cats.map(function (c) {
        return '<button type="button" class="chip' + (c === e.category ? ' on' : '') + '" data-c="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div></div>' +
      '<label class="f"><span>Açıklama (isteğe bağlı)</span><input name="note" value="' + esc(e.note || '') + '" placeholder="örn. Ekim kirası"></label><div class="alert js-err" hidden></div></form>',
      (e.id ? '<button class="btn btn--d js-del">Sil</button>' : '') + '<span class="grow"></span><button class="btn js-cancel">Vazgeç</button><button class="btn btn--p js-save">Kaydet</button>');
    var f = $('form', m), cat = e.category || '';
    $$('.js-cats .chip', m).forEach(function (b) { b.onclick = function () { cat = b.dataset.c; $$('.js-cats .chip', m).forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
    $('.js-cancel', m).onclick = closeModal;
    $('.js-save', m).onclick = function () {
      api(e.id ? 'PUT' : 'POST', '/expenses' + (e.id ? '/' + e.id : ''), { date: f.date.value, amount: +f.amount.value, category: cat, note: f.note.value })
        .then(function () { closeModal(); toast('Gider kaydedildi'); route(); })
        .catch(function (er) { var al = $('.js-err', m); al.textContent = er.message; al.hidden = false; });
    };
    if (e.id) $('.js-del', m).onclick = function () {
      if (!confirm('Gider silinsin mi?')) return;
      api('DELETE', '/expenses/' + e.id).then(function () { closeModal(); route(); }).catch(oops);
    };
  }

  /* ── Siteyi düzenle ────────────────────────────────────────────────────
     Görsel düzenleyici: site panelin içinde açılır; yazıya tıklayıp yerinde değiştirilir.
     Liste görünümü: sayfada görünmeyen metinler (sekme başlığı, Google açıklaması, kayan şerit…) için. */
  var SECTIONS = {
    hdr: 'Üst menü', menu: 'Mobil menü', top: 'Giriş', zirkonyum: 'Neden zirkonyum', ton: 'Diş tonu', secenekler: 'Zirkonyum / lamine / E-max',
    tedaviler: 'Tedaviler', surec: 'Tedavi süreci', yorumlar: 'Hasta yorumları', sorular: 'Sık sorulanlar', hekimler: 'Hekimler', iletisim: 'İletişim',
    book: 'Randevu formu', footer: 'Sayfa altı', dock: 'Telefondaki alt düğmeler', meta: 'Google’da görünen başlık ve açıklama', js: 'Randevu formu mesajları'
  };
  var LANGS = { tr: 'Türkçe', en: 'English', de: 'Deutsch' };
  var ceLang = 'tr';
  function loadDict() {
    if (window.AtlasDict) return Promise.resolve(window.AtlasDict);
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = '/assets/js/i18n.js?panel'; s.onload = function () { res(window.AtlasDict || { en: {}, de: {}, trJs: {} }); }; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  /* Sitedeki tüm metin anahtarları ve varsayılanları (index.html + i18n.js) */
  function loadTexts() {
    return Promise.all([fetch('/', { credentials: 'same-origin' }).then(function (r) { return r.text(); }), loadDict(), api('GET', '/content')]).then(function (r) {
      var html = new DOMParser().parseFromString(r[0], 'text/html'), dict = r[1];
      var items = [], byKey = {};
      function add(key, tr, sec, hidden) {
        if (byKey[key]) return;
        byKey[key] = { key: key, sec: sec, hidden: !!hidden, def: { tr: tr, en: (dict.en || {})[key] || '', de: (dict.de || {})[key] || '' } };
        items.push(byKey[key]);
      }
      add('meta.title', html.title, 'meta', 1);
      var md = html.querySelector('meta[name="description"]'); add('meta.desc', md ? md.getAttribute('content') : '', 'meta', 1);
      $$('[data-i18n], [data-i18n-attr]', html).forEach(function (el) {
        var host = el.closest('[id]:not(main):not(#stage):not(#main)'), sec = host ? host.id : '';
        if (!SECTIONS[sec]) sec = el.closest('footer') ? 'footer' : el.closest('.dock') ? 'dock' : 'hdr';
        if (el.hasAttribute('data-i18n')) add(el.getAttribute('data-i18n'), el.innerHTML.trim().replace(/\s+/g, ' '), sec, el.tagName === 'OPTION');
        if (el.hasAttribute('data-i18n-attr')) el.getAttribute('data-i18n-attr').split(',').forEach(function (p) {
          var i = p.indexOf(':'), attr = p.slice(0, i).trim(), key = p.slice(i + 1).trim();
          add(key, el.getAttribute(attr) || '', sec, 1);
        });
      });
      Object.keys(dict.trJs || {}).forEach(function (k) { add(k, dict.trJs[k], 'js', 1); });
      return { items: items, byKey: byKey, ovr: r[2] };
    });
  }

  /* Paylaşılan düzenleme durumu: görsel ve liste görünümü aynı bekleyen değişiklikleri kullanır */
  var CE = { pending: {} };
  function ceSaved(t, lang, key) { return t.ovr[lang] && key in t.ovr[lang] ? t.ovr[lang][key] : (t.byKey[key] ? t.byKey[key].def[lang] : ''); }
  function ceVal(t, lang, key) { var k = lang + '|' + key; return k in CE.pending ? CE.pending[k] : ceSaved(t, lang, key); }
  function ceSet(t, lang, key, v) { var k = lang + '|' + key; if (v === ceSaved(t, lang, key)) delete CE.pending[k]; else CE.pending[k] = v; }
  function cePublish(t) {
    var changes = Object.keys(CE.pending).map(function (k) {
      var i = k.indexOf('|'), lang = k.slice(0, i), key = k.slice(i + 1), it = t.byKey[key];
      return { lang: lang, key: key, value: it && CE.pending[k] === it.def[lang] ? null : CE.pending[k] };
    });
    return api('PUT', '/content', { changes: changes }).then(function (c) { t.ovr = c; CE.pending = {}; });
  }

  /* contenteditable içeriğini izinli biçime indirger: yalnızca metin, satır sonu ve vurgu */
  function cleanHtml(root) {
    var out = '';
    (function walk(n) {
      n.childNodes.forEach(function (c) {
        if (c.nodeType === 3) { out += esc(c.nodeValue.replace(/ /g, ' ')); return; }
        if (c.nodeType !== 1) return;
        var t = c.tagName;
        if (t === 'BR') { out += '<br>'; return; }
        if (t === 'EM' || t === 'I') { out += '<em>'; walk(c); out += '</em>'; return; }
        if (t === 'STRONG' || t === 'B') { out += '<strong>'; walk(c); out += '</strong>'; return; }
        if ((t === 'DIV' || t === 'P') && out && !/<br>$/.test(out)) out += '<br>';
        walk(c);
      });
    })(root);
    return out.replace(/(<br>)+$/, '').replace(/<em><\/em>|<strong><\/strong>/g, '').replace(/\s+/g, ' ').trim();
  }

  function vSite(v, args) {
    var mode = args[0] === 'liste' ? 'list' : 'visual';
    v.innerHTML = top('Siteyi düzenle', mode === 'visual'
      ? 'Değiştirmek istediğiniz yazının üzerine tıklayın ve yazın. Bitince “Yayınla” düğmesine basın.'
      : 'Sayfada doğrudan görünmeyen metinler: Google açıklaması, kayan şerit, form mesajları…',
      '<div class="seg"><a class="' + (mode === 'visual' ? 'on' : '') + '" href="#/site">Sayfa üzerinde</a><a class="' + (mode === 'list' ? 'on' : '') + '" href="#/site/liste">Tüm metinler (liste)</a></div>' +
      '<a class="btn" href="/" target="_blank" rel="noopener">' + ic('ext') + 'Siteyi yeni sekmede aç</a>') + '<div class="js-ce"><p class="boot">Site yükleniyor…</p></div>';
    return loadTexts().then(function (t) { (mode === 'visual' ? visualEditor : listEditor)($('.js-ce', v), t); });
  }

  function saveBar(box, t, after) {
    box.insertAdjacentHTML('beforeend', '<div class="savebar js-bar" hidden><span><b class="js-cnt"></b><small class="js-cnt2"></small></span>' +
      '<span class="row"><button class="btn btn--sm js-undo">Değişiklikleri geri al</button><button class="btn btn--sm js-pub">Yayınla</button></span></div>');
    var bar = $('.js-bar', box);
    function count() {
      var n = Object.keys(CE.pending).length;
      bar.hidden = !n; unsaved = !!n;
      $('.js-cnt', bar).textContent = n + ' değişiklik yayınlanmayı bekliyor';
      $('.js-cnt2', bar).textContent = ' — ziyaretçiler henüz eski hâlini görüyor';
    }
    $('.js-undo', bar).onclick = function () {
      if (!confirm('Yayınlanmamış tüm değişiklikler geri alınsın mı?')) return;
      CE.pending = {}; count(); after('undo');
    };
    $('.js-pub', bar).onclick = function () {
      var b = this; b.disabled = true; b.textContent = 'Yayınlanıyor…';
      cePublish(t).then(function () { count(); toast('Yayınlandı — site güncellendi'); after('publish'); })
        .catch(oops).then(function () { b.disabled = false; b.textContent = 'Yayınla'; });
    };
    count();
    return count;
  }

  function visualEditor(box, t) {
    box.innerHTML =
      '<div class="ve"><div class="ve__bar">' +
      '<div class="seg js-mode" role="group" aria-label="Mod"><button type="button" data-m="edit" class="on">✎ Düzenle</button><button type="button" data-m="browse">Gez</button></div>' +
      '<div class="seg js-lang" role="group" aria-label="Dil">' + Object.keys(LANGS).map(function (l) {
        return '<button type="button" data-l="' + l + '" class="' + (l === ceLang ? 'on' : '') + '">' + LANGS[l] + '</button>'; }).join('') + '</div>' +
      '<div class="seg js-dev" role="group" aria-label="Görünüm"><button type="button" data-w="" class="on">Bilgisayar</button><button type="button" data-w="390">Telefon</button></div>' +
      '<span class="grow"></span><span class="ve__state js-state">Bir yazıya tıklayın</span>' +
      '<button type="button" class="btn btn--sm js-em" disabled title="Seçili kelimeleri eğik (vurgulu) yapar">Vurgula</button>' +
      '<button type="button" class="btn btn--sm js-done" disabled>Bitti</button></div>' +
      '<div class="ve__help js-help"><p style="margin:0"><b>Nasıl çalışır?</b> Üzerine geldiğiniz yazılar yeşil çerçeveyle işaretlenir. Tıklayın, yazın, bitince boş bir yere tıklayın. ' +
      'Hekim kartına tıklarsanız fotoğraf ve tanıtım formu açılır. Kapalı bir soruyu ya da başka bir sekmeyi açmak için önce <b>Gez</b>’e geçin, sonra <b>Düzenle</b>’ye dönün.</p>' +
      '<button type="button" class="btn btn--sm btn--ghost js-hide">Anladım</button></div>' +
      '<div class="ve__frame"><iframe class="js-if" title="Site düzenleme önizlemesi" src="/?duzenle"></iframe></div></div>';
    try { if (localStorage.getItem('atlas-ve-help') === '0') $('.js-help', box).hidden = true; } catch (e) {}
    $('.js-hide', box).onclick = function () { $('.js-help', box).hidden = true; try { localStorage.setItem('atlas-ve-help', '0'); } catch (e) {} };

    var frame = $('.js-if', box), w, d, editing = null, mode = 'edit', scrollKeep = 0;
    var state = $('.js-state', box), emBtn = $('.js-em', box), doneBtn = $('.js-done', box);
    var count = saveBar(box, t, function () { reload(); });

    function reload() { try { scrollKeep = w.scrollY; } catch (e) {} frame.contentWindow.location.reload(); }

    function els(key) { return $$('[data-i18n="' + key.replace(/"/g, '') + '"]', d); }
    function markChanged() {
      $$('.ve-changed', d).forEach(function (e) { e.classList.remove('ve-changed'); });
      Object.keys(CE.pending).forEach(function (k) {
        var i = k.indexOf('|'); if (k.slice(0, i) !== ceLang) return;
        els(k.slice(i + 1)).forEach(function (e) { e.classList.add('ve-changed'); });
      });
    }
    function applyPending() {
      Object.keys(CE.pending).forEach(function (k) {
        var i = k.indexOf('|'); if (k.slice(0, i) !== ceLang) return;
        els(k.slice(i + 1)).forEach(function (e) { e.innerHTML = CE.pending[k]; });
      });
      markChanged();
    }

    function multiline(key) { var v = ceVal(t, ceLang, key); return /<br>/.test(v) || stripTags(v).length > 60; }
    function startEdit(el) {
      finishEdit();
      var key = el.getAttribute('data-i18n');
      el.innerHTML = ceVal(t, ceLang, key);              // başlıklardaki animasyon katmanlarını çıkar, asıl metni koy
      el.contentEditable = 'true'; el.spellcheck = true;
      el.classList.add('ve-on');
      editing = { el: el, key: key, orig: el.innerHTML };
      el.focus();
      var r = d.createRange(); r.selectNodeContents(el); r.collapse(false);
      var s = w.getSelection(); s.removeAllRanges(); s.addRange(r);
      var it = t.byKey[key];
      state.innerHTML = '<b>' + esc(it ? SECTIONS[it.sec] || '' : '') + '</b> · ' + (multiline(key) ? 'Yeni satır için Enter' : 'Bitirmek için Enter') + ' · Vazgeçmek için Esc';
      emBtn.disabled = doneBtn.disabled = false;
    }
    function finishEdit(cancel) {
      if (!editing) return;
      var el = editing.el, key = editing.key;
      if (cancel) el.innerHTML = editing.orig;
      var html = cleanHtml(el);
      if (!stripTags(html)) { html = editing.orig; toast('Yazı boş bırakılamaz; eski hâline döndü', true); }
      el.contentEditable = 'false'; el.classList.remove('ve-on');
      ceSet(t, ceLang, key, html);
      els(key).forEach(function (e) { e.innerHTML = html; });
      editing = null;
      state.textContent = 'Bir yazıya tıklayın';
      emBtn.disabled = doneBtn.disabled = true;
      markChanged(); count();
    }

    emBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });    // seçim kaybolmasın
    emBtn.onclick = function () { if (editing) d.execCommand('italic'); };
    doneBtn.onclick = function () { finishEdit(); };

    $$('.js-mode button', box).forEach(function (b) {
      b.onclick = function () {
        finishEdit(); mode = b.dataset.m;
        $$('.js-mode button', box).forEach(function (x) { x.classList.toggle('on', x === b); });
        d.documentElement.classList.toggle('ve-edit', mode === 'edit');
        state.textContent = mode === 'edit' ? 'Bir yazıya tıklayın' : 'Gezinme modu: site normal çalışır, düzenleme kapalı';
      };
    });
    $$('.js-lang button', box).forEach(function (b) {
      b.onclick = function () {
        finishEdit(); ceLang = b.dataset.l;
        $$('.js-lang button', box).forEach(function (x) { x.classList.toggle('on', x === b); });
        w.AtlasI18n.set(ceLang);
        try { w.localStorage.removeItem('atlas-lang'); } catch (e) {}      // ziyaretçi dili olarak kalmasın
        applyPending();
      };
    });
    $$('.js-dev button', box).forEach(function (b) {
      b.onclick = function () {
        $$('.js-dev button', box).forEach(function (x) { x.classList.toggle('on', x === b); });
        frame.style.width = b.dataset.w ? b.dataset.w + 'px' : '';
        $('.ve__frame', box).classList.toggle('is-phone', !!b.dataset.w);
      };
    });

    frame.addEventListener('load', function () {
      w = frame.contentWindow; d = w.document; editing = null;
      var st = d.createElement('style');
      st.textContent =
        'html.ve-edit [data-i18n]{cursor:text;border-radius:3px;transition:outline-color .15s}' +
        'html.ve-edit [data-i18n]:hover{outline:2px dashed #6fbf98;outline-offset:4px}' +
        'html.ve-edit .ve-changed{outline:2px solid #e6c59a;outline-offset:4px}' +
        '[data-i18n].ve-on,[data-i18n].ve-on:hover{outline:3px solid #e6c59a!important;outline-offset:4px;background:rgba(230,197,154,.12);cursor:text}' +
        '[data-i18n].ve-on .ln,[data-i18n].ve-on .ln__in{display:inline!important;transform:none!important}' +
        'html.ve-edit [data-doctor]{cursor:pointer;position:relative}' +
        'html.ve-edit [data-doctor]:hover{outline:2px dashed #6fbf98;outline-offset:8px}' +
        'html.ve-edit [data-doctor]::after{content:"✎ Fotoğraf ve bilgileri düzenle";position:absolute;left:12px;top:12px;padding:.45rem .7rem;border-radius:99px;background:#0b0d0c;color:#f2eee6;font:600 13px system-ui;opacity:0;transition:.2s;pointer-events:none}' +
        'html.ve-edit [data-doctor]:hover::after{opacity:1}' +
        '.ve-add{display:grid;place-items:center;align-content:center;gap:.6rem;min-height:320px;aspect-ratio:4/5;border:2px dashed rgba(11,13,12,.25);background:none;color:inherit;font:inherit;cursor:pointer;border-radius:2px}' +
        '.ve-add:hover{border-color:#3f6454;background:rgba(63,100,84,.06)}.ve-add b{font-size:1.1rem}.ve-add span{font-size:2.4rem;line-height:1}' +
        'html:not(.ve-edit) .ve-add{display:none}';
      d.head.appendChild(st);
      d.documentElement.classList.toggle('ve-edit', mode === 'edit');
      // hekim bölümü boşsa da görünsün ki ilk hekim eklenebilsin
      $$('[data-team]', d).forEach(function (e) { e.hidden = false; });
      var grid = $('[data-team-grid]', d);
      if (grid) grid.insertAdjacentHTML('beforeend', '<button type="button" class="ve-add"><span>+</span><b>Yeni hekim ekle</b></button>');
      if (ceLang !== 'tr') { w.AtlasI18n.set(ceLang); try { w.localStorage.removeItem('atlas-lang'); } catch (e) {} }
      applyPending();
      if (scrollKeep) setTimeout(function () { w.scrollTo(0, scrollKeep); scrollKeep = 0; }, 60);

      // düzenleme modunda sitenin kendi tıklama davranışları (bağlantı, sekme, form) devre dışı
      d.addEventListener('click', function (e) {
        if (mode !== 'edit') return;
        var docEl = e.target.closest('[data-doctor]'), add = e.target.closest('.ve-add'), el = e.target.closest('[data-i18n]');
        if (docEl && !el) { e.preventDefault(); e.stopPropagation(); finishEdit(); editDoctor(findDoc(+docEl.getAttribute('data-doctor')), reload); return; }
        if (docEl && el) { e.preventDefault(); e.stopPropagation(); finishEdit(); editDoctor(findDoc(+docEl.getAttribute('data-doctor')), reload); return; }
        if (add) { e.preventDefault(); e.stopPropagation(); finishEdit(); editDoctor({}, reload); return; }
        if (el && el.closest('a[href^="tel:"]') || el && el.getAttribute('data-i18n') === 'phone.display') {
          e.preventDefault(); e.stopPropagation(); finishEdit(); editContact(reload); return;
        }
        if (el) {
          e.stopPropagation();
          if (editing && editing.el === el) return;           // imleci yazının içinde taşımaya izin ver
          e.preventDefault(); startEdit(el); return;
        }
        if (e.target.closest('a, button, label, select, input, textarea, summary')) { e.preventDefault(); e.stopPropagation(); }
        finishEdit();
      }, true);
      d.addEventListener('submit', function (e) { if (mode === 'edit') { e.preventDefault(); e.stopPropagation(); } }, true);
      d.addEventListener('keydown', function (e) {
        if (!editing) return;
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); finishEdit(true); }
        else if (e.key === 'Enter') {
          e.preventDefault();
          if (multiline(editing.key) && !e.metaKey && !e.ctrlKey) d.execCommand('insertLineBreak'); else finishEdit();
        } else if ((e.metaKey || e.ctrlKey) && /^[iI]$/.test(e.key)) { e.preventDefault(); d.execCommand('italic'); }
        else if ((e.metaKey || e.ctrlKey) && /^[bBuU]$/.test(e.key)) e.preventDefault();
      }, true);
      d.addEventListener('paste', function (e) {
        if (!editing) return;
        e.preventDefault();
        d.execCommand('insertText', false, (e.clipboardData || w.clipboardData).getData('text/plain').replace(/\s*\n\s*/g, ' '));
      }, true);
      d.addEventListener('drop', function (e) { if (editing) e.preventDefault(); }, true);
    });
  }

  /* Telefon / WhatsApp: tek alan, gerisi otomatik */
  function editContact(onDone) {
    var st = S.settings, wa = String(st.whatsapp || ''), tel = String(st.phone_e164 || '');
    var same = wa.slice(-10) === tel.replace(/\D/g, '').slice(-10);
    var m = openModal('Telefon ve WhatsApp',
      '<form class="form" novalidate><label class="f"><span>Klinik telefonu</span><input name="phone" inputmode="tel" value="' + esc(st.phone_display) + '" placeholder="0546 177 43 77">' +
      '<small>Sitede nasıl görünmesini istiyorsanız öyle yazın. Arama düğmeleri otomatik güncellenir.</small></label>' +
      '<label class="switch"><input type="checkbox" name="same"' + (same ? ' checked' : '') + '><i></i><span><b>WhatsApp da bu numarada</b></span></label>' +
      '<label class="f js-waf"' + (same ? ' hidden' : '') + '><span>WhatsApp numarası</span><input name="wa" inputmode="tel" value="' + esc(wa ? '0' + wa.slice(-10) : '') + '"></label>' +
      '<div class="alert js-err" hidden></div></form>',
      '<span class="grow"></span><button class="btn js-cancel">Vazgeç</button><button class="btn btn--p js-save">Kaydet</button>');
    var f = $('form', m);
    f.same.onchange = function () { $('.js-waf', m).hidden = f.same.checked; };
    $('.js-cancel', m).onclick = closeModal;
    $('.js-save', m).onclick = function () {
      var p = f.phone.value.replace(/\D/g, ''), w = (f.same.checked ? f.phone.value : f.wa.value).replace(/\D/g, '');
      var al = $('.js-err', m);
      if (p.length < 10 || w.length < 10) { al.textContent = 'Numarayı alan koduyla birlikte yazın (örn. 0546 177 43 77).'; al.hidden = false; return; }
      api('PUT', '/settings', { phone_display: f.phone.value.trim(), phone_e164: '+90' + p.slice(-10), whatsapp: '90' + w.slice(-10) })
        .then(function (s) { S.settings = s; closeModal(); toast('Telefon güncellendi'); (onDone || route)(); })
        .catch(function (e) { al.textContent = e.message; al.hidden = false; });
    };
  }

  /* Liste görünümü */
  function listEditor(box, t) {
    var only = false;
    box.innerHTML = '<div class="card"><div class="card__b row"><div class="seg js-lang">' + Object.keys(LANGS).map(function (l) {
        return '<button type="button" data-l="' + l + '" class="' + (l === ceLang ? 'on' : '') + '">' + LANGS[l] + '</button>'; }).join('') + '</div>' +
      '<input type="search" class="grow js-q" placeholder="Aramak istediğiniz kelimeyi yazın…" style="min-width:200px">' +
      '<label class="check"><input type="checkbox" class="js-only"> Yalnızca sayfada görünmeyenler</label></div></div><div class="js-list"></div>';
    var list = $('.js-list', box), q = $('.js-q', box);
    var count = saveBar(box, t, function () { draw(); });
    // satır sonları kutuda gerçek satır olarak görünsün
    var toText = function (h) { return h.replace(/<br\s*\/?>/g, '\n'); };
    var toHtml = function (s) { return s.replace(/\r?\n/g, '<br>'); };
    function draw() {
      var term = q.value.trim().toLocaleLowerCase('tr'), groups = {};
      t.items.forEach(function (it) {
        if (only && !it.hidden) return;
        var cur = ceVal(t, ceLang, it.key);
        if (term && stripTags(cur + ' ' + it.def.tr).toLocaleLowerCase('tr').indexOf(term) < 0) return;
        (groups[it.sec] = groups[it.sec] || []).push(it);
      });
      var keys = Object.keys(SECTIONS).filter(function (s) { return groups[s]; });
      list.innerHTML = keys.length ? keys.map(function (s) {
        return '<section class="card ce__sec"><h3>' + esc(SECTIONS[s]) + '</h3>' + groups[s].map(function (it) {
          var cur = toText(ceVal(t, ceLang, it.key)), mod = (ceLang + '|' + it.key) in CE.pending, ovrd = t.ovr[ceLang] && it.key in t.ovr[ceLang];
          var label = it.key === 'ticker' ? 'Kayan şerit (aralarına | koyun)' : it.key === 'meta.title' ? 'Tarayıcı sekmesi ve Google başlığı' : it.key === 'meta.desc' ? 'Google’daki açıklama' : stripTags(it.def.tr).slice(0, 60) || it.key;
          return '<div class="ce__it' + (mod ? ' is-mod' : ovrd ? ' is-ovr' : '') + '" data-k="' + esc(it.key) + '"><div class="ce__k"><b>' + esc(label) + '</b>' +
            (mod ? '<span class="badge st-pending">Yayınlanmadı</span>' : ovrd ? '<span class="badge st-confirmed">Değiştirildi</span>' : '') +
            (ovrd || mod ? '<br><button type="button" class="btn btn--sm js-reset">İlk hâline döndür</button>' : '') + '</div><div>' +
            '<textarea rows="' + Math.min(6, Math.max(1, Math.ceil(cur.length / 80) + (cur.match(/\n/g) || []).length)) + '">' + esc(cur) + '</textarea>' +
            (ceLang !== 'tr' ? '<div class="ce__def">Türkçesi: ' + esc(stripTags(ceVal(t, 'tr', it.key))) + '</div>' : '') + '</div></div>';
        }).join('') + '</section>';
      }).join('') : '<div class="card"><p class="empty">Eşleşen metin yok.</p></div>';
    }
    list.addEventListener('input', function (e) {
      var row = e.target.closest('.ce__it'); if (!row) return;
      ceSet(t, ceLang, row.dataset.k, toHtml(e.target.value));
      row.classList.toggle('is-mod', (ceLang + '|' + row.dataset.k) in CE.pending);
      count();
    });
    list.addEventListener('click', function (e) {
      if (!e.target.closest('.js-reset')) return;
      var key = e.target.closest('.ce__it').dataset.k, it = t.byKey[key];
      ceSet(t, ceLang, key, it.def[ceLang]);
      draw(); count();
    });
    $$('.js-lang button', box).forEach(function (b) {
      b.onclick = function () { ceLang = b.dataset.l; $$('.js-lang button', box).forEach(function (x) { x.classList.toggle('on', x === b); }); draw(); };
    });
    q.addEventListener('input', draw);
    $('.js-only', box).onchange = function (e) { only = e.target.checked; draw(); };
    draw();
  }

  /* ── Ayarlar ───────────────────────────────────────────────────────── */
  function vSettings(v) {
    var admin = isAdmin();
    return Promise.all([api('GET', '/settings'), admin ? api('GET', '/users') : Promise.resolve({ items: [] })]).then(function (r) {
      var st = r[0], users = r[1].items, closed = (st.closed_dates || []).slice();
      v.innerHTML = top('Ayarlar', '') +
        (admin ? '<div class="grid g2"><section class="card"><div class="card__h"><h2>Klinik iletişim</h2></div><div class="card__b form">' +
        '<dl class="kv"><div><dt>Telefon</dt><dd>' + esc(st.phone_display) + '</dd></div><div><dt>WhatsApp</dt><dd>' + esc(phone('0' + String(st.whatsapp).slice(-10))) + '</dd></div></dl>' +
        '<div class="row"><button type="button" class="btn btn--p js-tel">Telefonu değiştir</button><a class="btn" href="#/site">Site yazılarını düzenle</a></div>' +
        '<small class="mut">Adres, çalışma saatleri ve diğer yazılar “Siteyi düzenle” sayfasında, yazının üzerine tıklanarak değişir.</small></div></section>' +
        '<section class="card"><div class="card__h"><h2>Online randevu</h2></div><form class="card__b form js-book" novalidate>' +
        '<label class="check"><input type="checkbox" name="booking_enabled"' + (st.booking_enabled ? ' checked' : '') + '> Web sitesinden online randevu alınsın</label>' +
        '<div class="grid g2"><label class="f"><span>Kaç gün ilerisi açık</span><input type="number" name="booking_days" min="1" max="180" value="' + st.booking_days + '"></label>' +
        '<label class="f"><span>En erken (dakika sonra)</span><input type="number" name="booking_notice_min" min="0" step="15" value="' + st.booking_notice_min + '"><small>Örn. 120 = en erken 2 saat sonrası</small></label></div>' +
        '<div class="f"><span>Kapalı günler (resmî tatil, izin)</span><div class="row"><input type="date" class="js-cd" style="width:auto"><button type="button" class="btn btn--sm js-cdadd">Ekle</button></div>' +
        '<div class="row js-cdl" style="margin-top:.4rem"></div></div>' +
        '<div><button class="btn btn--p">Kaydet</button></div></form></section></div>' +
        '<section class="card"><div class="card__h"><h2>Kullanıcılar</h2><button class="btn btn--sm btn--p js-unew">' + ic('plus') + 'Kullanıcı ekle</button></div><div class="scroll">' +
        '<table class="tbl"><thead><tr><th>Ad</th><th>E-posta</th><th>Rol</th><th class="hide-m">2 adım</th><th class="hide-m">Son giriş</th><th>Durum</th><th></th></tr></thead><tbody>' + users.map(function (u) {
          return '<tr><td><b>' + esc(u.name) + '</b></td><td>' + esc(u.email) + '</td><td>' + ROLE[u.role] + (u.doctor_id && findDoc(u.doctor_id) ? ' · ' + esc(docName(findDoc(u.doctor_id))) : '') + '</td>' +
            '<td class="hide-m">' + (u.totp_enabled ? '<span class="badge st-confirmed">Açık</span>' : '<span class="badge' + (u.role === 'admin' ? ' st-pending' : '') + '">Kapalı</span>') + '</td>' +
            '<td class="hide-m mono">' + esc(u.last_login ? u.last_login.slice(0, 16) + ' UTC' : '—') + '</td>' +
            '<td>' + (u.active ? '<span class="badge st-confirmed">Aktif</span>' : '<span class="badge">Pasif</span>') + '</td><td class="r"><button class="btn btn--sm js-uedit" data-id="' + u.id + '">Düzenle</button></td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="card__b mut" style="font-size:.85rem;border-top:1px solid var(--line)">Yönetici her şeyi yönetir. Sekreter ve hekimler randevu, hasta ve tedavi kayıtlarıyla çalışır; site, hekim, hizmet ve ayarları değiştiremez.</div></section>' : '') +
        '<div class="grid g2"><section class="card"><div class="card__h"><h2>Parolamı değiştir</h2></div><form class="card__b form js-pw" novalidate>' +
        '<label class="f"><span>Mevcut parola</span><input type="password" name="current" autocomplete="current-password"></label>' +
        '<label class="f"><span>Yeni parola</span><input type="password" name="next" autocomplete="new-password" minlength="12"><small>En az 12 karakter. Değiştirince diğer cihazlardaki oturumlarınız kapanır.</small></label>' +
        '<div><button class="btn btn--p">Değiştir</button></div></form></section>' +
        '<section class="card"><div class="card__h"><h2>İki adımlı doğrulama</h2>' + (S.user.totp_enabled ? '<span class="badge st-confirmed">Açık</span>' : '<span class="badge st-pending">Kapalı</span>') + '</div>' +
        '<div class="card__b form js-2fa"></div></section></div>' +
        (admin ? '<section class="card js-sample" hidden><div class="card__h"><h2>Örnek veriler</h2></div><div class="card__b row">' +
          '<p class="grow" style="margin:0"><span class="js-scount"></span> Gerçek hastalarınızı girmeye başlamadan önce silebilirsiniz; hekimler, tedaviler, fiyatlar ve site metinleri kalır.</p>' +
          '<button type="button" class="btn btn--d js-sclear">Tüm örnek verileri sil</button></div></section>' : '') +
        (admin ? '<section class="card"><div class="card__h"><h2>Güvenlik günlüğü</h2><span class="mut" style="font-size:.85rem">Girişler, başarısız denemeler, yetki ve ayar değişiklikleri</span></div><div class="scroll js-audit"><p class="empty">Yükleniyor…</p></div></section>' : '');

      $('.js-pw', v).addEventListener('submit', function (e) {
        e.preventDefault();
        var f = e.target;
        api('POST', '/auth/password', { current: f.current.value, next: f.next.value }).then(function () { f.reset(); toast('Parola değiştirildi'); }).catch(oops);
      });
      twoFactor($('.js-2fa', v));
      if (!admin) return;
      api('GET', '/sample').then(function (sm) {
        if (!sm.patients && !sm.expenses) return;
        $('.js-sample', v).hidden = false;
        $('.js-scount', v).textContent = 'Panelde ' + sm.patients.toLocaleString('tr-TR') + ' örnek hasta (randevu ve işlemleriyle) ve ' + sm.expenses + ' örnek gider var.';
        $('.js-sclear', v).onclick = function () {
          if (prompt('Örnek hastalar, randevuları, işlemleri ve örnek giderler kalıcı olarak silinecek.\nOnaylamak için SİL yazın:') !== 'SİL') return;
          api('POST', '/sample/clear', {}).then(function () { toast('Örnek veriler silindi'); refreshBadge(); route(); }).catch(oops);
        };
      }).catch(function () {});
      api('GET', '/audit').then(function (r) {
        var A = { login: 'Giriş', 'login.fail': 'Başarısız giriş', 'mfa.fail': 'Hatalı 2FA kodu', setup: 'İlk kurulum', 'password.change': 'Parola değişti',
          '2fa.enable': '2FA açıldı', '2fa.disable': '2FA kapatıldı', 'user.create': 'Kullanıcı eklendi', 'user.update': 'Kullanıcı değişti', 'user.delete': 'Kullanıcı silindi',
          settings: 'Ayar değişti', content: 'Site metni değişti', 'patient.delete': 'Hasta silindi', 'doctor.create': 'Hekim eklendi', 'doctor.delete': 'Hekim silindi', 'doctor.photo': 'Hekim fotoğrafı', 'service.delete': 'Tedavi silindi', 'sample.clear': 'Örnek veriler silindi' };
        $('.js-audit', v).innerHTML = r.items.length ? '<table class="tbl"><thead><tr><th>Zaman (UTC)</th><th>Olay</th><th>Kullanıcı</th><th class="hide-m">IP</th><th>Ayrıntı</th></tr></thead><tbody>' +
          r.items.map(function (a) {
            var bad = /fail/.test(a.action);
            return '<tr><td class="mono">' + esc(a.at.slice(0, 16)) + '</td><td>' + (bad ? '<span class="badge st-cancelled">' : '<span class="badge">') + esc(A[a.action] || a.action) + '</span></td>' +
              '<td>' + esc(a.user_name || '—') + '</td><td class="hide-m mono">' + esc(a.ip.replace(/^::ffff:/, '')) + '</td><td>' + esc(a.detail) + '</td></tr>';
          }).join('') + '</tbody></table>' : '<p class="empty">Kayıt yok.</p>';
      }).catch(oops);

      function drawClosed() {
        $('.js-cdl', v).innerHTML = closed.length ? closed.map(function (d, i) {
          return '<span class="badge">' + fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' }) + ' <button type="button" class="btn btn--ghost btn--sm" data-i="' + i + '" aria-label="Kaldır" style="padding:0 .2rem">✕</button></span>';
        }).join('') : '<span class="mut" style="font-size:.85rem">Yok</span>';
        $$('.js-cdl button', v).forEach(function (b) { b.onclick = function () { closed.splice(+b.dataset.i, 1); drawClosed(); }; });
      }
      drawClosed();
      $('.js-cdadd', v).onclick = function () {
        var d = $('.js-cd', v).value;
        if (d && closed.indexOf(d) < 0) { closed.push(d); closed.sort(); drawClosed(); }
      };
      $('.js-tel', v).onclick = function () { editContact(); };
      $('.js-book', v).addEventListener('submit', function (e) {
        e.preventDefault(); var f = e.target;
        api('PUT', '/settings', { booking_enabled: f.booking_enabled.checked, booking_days: +f.booking_days.value, booking_notice_min: +f.booking_notice_min.value, closed_dates: closed })
          .then(function (s) { S.settings = s; toast('Kaydedildi'); }).catch(oops);
      });
      $('.js-unew', v).onclick = function () { editUser({}); };
      $$('.js-uedit', v).forEach(function (b) { b.onclick = function () { editUser(users.filter(function (u) { return u.id === +b.dataset.id; })[0]); }; });
    });
  }

  function twoFactor(box) {
    if (S.user.totp_enabled) {
      box.innerHTML = '<p style="margin:0">Girişte parolanızın yanında uygulamadaki 6 haneli kod da isteniyor.</p>' +
        '<label class="f"><span>Kapatmak için parolanız</span><input type="password" name="pw" autocomplete="current-password"></label><div><button type="button" class="btn btn--d js-off">Kapat</button></div>';
      $('.js-off', box).onclick = function () {
        api('POST', '/auth/2fa/disable', { password: $('[name=pw]', box).value }).then(function () { S.user.totp_enabled = false; toast('İki adımlı doğrulama kapatıldı'); route(); }).catch(oops);
      };
      return;
    }
    box.innerHTML = '<p style="margin:0">Parolanız ele geçirilse bile hesabınıza girilemesin. Google Authenticator, Microsoft Authenticator ya da benzeri bir uygulama gerekir.' +
      (isAdmin() ? ' <b>Yönetici hesapları için şiddetle önerilir.</b>' : '') + '</p><div><button type="button" class="btn btn--p js-on">Kurulumu başlat</button></div>';
    $('.js-on', box).onclick = function () {
      api('POST', '/auth/2fa/start', {}).then(function (r) {
        box.innerHTML = '<ol style="margin:0;padding-left:1.2rem;display:grid;gap:.4rem"><li>Uygulamada “Kurulum anahtarı gir” / “Enter a setup key” seçin.</li>' +
          '<li>Hesap adı: <b>Atlas Panel</b>, anahtar:<div class="mono" style="margin-top:.3rem;padding:.6rem;border:1px solid var(--line-2);border-radius:8px;word-break:break-all;user-select:all">' +
          esc(r.secret.replace(/(.{4})/g, '$1 ').trim()) + '</div></li><li>Uygulamanın gösterdiği 6 haneli kodu aşağıya yazın.</li></ol>' +
          '<label class="f"><span>Kod</span><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></label><div><button type="button" class="btn btn--p js-en">Etkinleştir</button></div>';
        $('.js-en', box).onclick = function () {
          api('POST', '/auth/2fa/enable', { code: $('[name=code]', box).value }).then(function () { S.user.totp_enabled = true; toast('İki adımlı doğrulama açıldı'); route(); }).catch(oops);
        };
      }).catch(oops);
    };
  }

  function editUser(u) {
    var m = openModal(u.id ? u.name : 'Yeni kullanıcı',
      '<form class="form" novalidate><div class="grid g2"><label class="f"><span>Ad soyad</span><input name="name" value="' + esc(u.name || '') + '"></label>' +
      '<label class="f"><span>E-posta</span><input type="email" name="email" value="' + esc(u.email || '') + '" autocomplete="off"></label></div>' +
      '<div class="grid g2"><label class="f"><span>Rol</span><select name="role">' + Object.keys(ROLE).map(function (k) {
        return '<option value="' + k + '"' + (k === (u.role || 'staff') ? ' selected' : '') + '>' + ROLE[k] + '</option>'; }).join('') + '</select></label>' +
      '<label class="f js-docf"><span>Bağlı hekim</span><select name="doctor_id"><option value="">—</option>' + S.doctors.map(function (d) {
        return '<option value="' + d.id + '"' + (d.id === u.doctor_id ? ' selected' : '') + '>' + esc(docName(d)) + '</option>'; }).join('') + '</select></label></div>' +
      '<label class="f"><span>' + (u.id ? 'Yeni parola (değiştirmek için doldurun)' : 'Parola') + '</span><input type="password" name="password" autocomplete="new-password" minlength="12"><small>En az 12 karakter. Kullanıcıya güvenli bir yoldan iletin; ilk girişte değiştirmesini isteyin.</small></label>' +
      (u.totp_enabled ? '<label class="check"><input type="checkbox" name="reset_2fa"> İki adımlı doğrulamayı sıfırla (telefonunu kaybettiyse)</label>' : '') +
      '<label class="check"><input type="checkbox" name="active"' + (u.active !== 0 ? ' checked' : '') + '> Aktif</label><div class="alert js-err" hidden></div></form>',
      (u.id ? '<button class="btn btn--d js-del">Sil</button>' : '') + '<span class="grow"></span><button class="btn js-cancel">Vazgeç</button><button class="btn btn--p js-save">Kaydet</button>');
    var f = $('form', m);
    var sync = function () { $('.js-docf', m).hidden = f.role.value !== 'doctor'; };
    f.role.addEventListener('change', sync); sync();
    $('.js-cancel', m).onclick = closeModal;
    $('.js-save', m).onclick = function () {
      var b = { name: f.name.value, email: f.email.value, role: f.role.value, doctor_id: f.doctor_id.value ? +f.doctor_id.value : null, active: f.active.checked };
      if (f.password.value) b.password = f.password.value;
      if (f.reset_2fa && f.reset_2fa.checked) b.reset_2fa = true;
      api(u.id ? 'PUT' : 'POST', '/users' + (u.id ? '/' + u.id : ''), b).then(function () { closeModal(); toast('Kullanıcı kaydedildi'); route(); })
        .catch(function (e) { var al = $('.js-err', m); al.textContent = e.message; al.hidden = false; });
    };
    if (u.id) $('.js-del', m).onclick = function () {
      if (!confirm(u.name + ' silinsin mi?')) return;
      api('DELETE', '/users/' + u.id).then(function () { closeModal(); route(); }).catch(oops);
    };
  }

  boot();
})();
