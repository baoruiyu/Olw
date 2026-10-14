/* ==========================================================================
   猫头鹰教 The Owl Cult — owl-site.js
   全站通用能力（四个旧页面 + 四个新页面都会引入）：
     1. 导航栏登录态：根据登录结果渲染「登录 / 昵称」入口，管理员自动多出「管理后台」入口
     2. 公告：优先从云数据库读取（data.js 作为离线回退），读取成功后无缝刷新公告栏
     3. 语言联动：自行监听 documentElement 的 lang 变化重渲染动态文本（不使用 data-zh/data-en，
        避免被站点既有的语言切换循环覆盖）

   依赖：config.js、owl-sdk.js
   ========================================================================== */

(function (window, document) {
  'use strict';

  var OWL = window.OWL;
  if (!OWL) { return; }

  var t = OWL.t;
  var esc = OWL.esc;

  /* ======================================================================
     一、公告：数据库优先，data.js 回退
     ====================================================================== */

  /* 后端返回的公告行 → 站点公告栏认识的格式 */
  function mapRow(r) {
    if (!r) { return null; }
    var item = {
      id: 'db-' + (r._id || r.id || Math.random().toString(36).slice(2)),
      date: OWL.fmtDate(r.publishedAt || r.updatedAt),
      level: (r.level === 'notice') ? 'notice' : 'info',
      zh: r.title || '',
      en: r.titleEn || r.title || '',
      dbId: r._id || r.id || ''
    };
    if (r.link) {
      item.link = {
        href: r.link,
        zh: r.linkText || '查看详情',
        en: r.linkTextEn || 'Learn more'
      };
    }
    return item;
  }

  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

  function pushAnnouncements(rows) {
    if (!window.OWL_SITE || typeof window.OWL_SITE !== 'object') { window.OWL_SITE = {}; }
    var mapped = [];
    for (var i = 0; i < rows.length; i++) {
      var m = mapRow(rows[i]);
      if (m && m.zh) { mapped.push(m); }
    }
    /* 只在数据库确有公告时接管；数据库为空则继续沿用 data.js 中的静态公告 */
    if (!mapped.length) { return false; }
    window.OWL_SITE.announcements = mapped;
    try {
      window.dispatchEvent(new CustomEvent('owl:announcements-updated', { detail: { announcements: mapped, rows: rows } }));
    } catch (e) {
      window.dispatchEvent(new Event('owl:announcements-updated'));
    }
    return true;
  }

  var announcementsCache = [];
  var announcementsSource = 'static';

  function loadAnnouncements() {
    if (!OWL.isConfigured()) { return Promise.resolve([]); }
    return OWL.call('announcements.list', { limit: 10, scope: 'site' }).then(function (d) {
      var rows = (d && isArray(d.items)) ? d.items : (isArray(d) ? d : []);
      announcementsCache = rows;
      if (rows.length && pushAnnouncements(rows)) { announcementsSource = 'database'; }
      return rows;
    }).catch(function (e) {
      /* 云端不可用时静默回退到 data.js 的静态公告，不影响站点可用性 */
      if (window.console && console.warn) { console.warn('[owl] 公告读取失败，已回退静态公告：', OWL.errText(e)); }
      return [];
    });
  }

  /* ======================================================================
     二、导航栏登录态
     ====================================================================== */

  function accountText(user) {
    if (!user) { return t('登录', 'Sign in'); }
    var name = user.nameEn || user.nickname || user.giteeLogin || user.name || '';
    if (!name) { return t('会员中心', 'Member'); }
    return name.length > 8 ? name.slice(0, 8) + '…' : name;
  }

  function applyAccount(link, user) {
    link.textContent = accountText(user);
    link.setAttribute('href', user ? 'member.html' : 'login.html');
    link.classList.toggle('is-signed-in', !!user);
    if (user) {
      var displayName = user.nameEn || user.nickname || '';
      link.setAttribute('title',
        (user.role === 'admin' ? t('管理员', 'Administrator') : t('会员', 'Member'))
        + (displayName ? ' · ' + displayName : ''));
    } else {
      link.removeAttribute('title');
    }
    /* 未登录时点击进入登录页；已登录时进入会员中心 */
    if (!link.getAttribute('data-account-bound')) {
      link.setAttribute('data-account-bound', '1');
      link.addEventListener('click', function (e) {
        var u = OWL.auth.user();
        if (u) {
          e.preventDefault();
          window.location.href = 'member.html';
        }
      });
    }
  }

  /* 本地身份（二维码）登录的用户存在 localStorage 里。
     全站每个页面都要能读到，导航栏的登录态才会保持一致。 */
  var QR_USER_KEY = 'owl-cult-qr-user';

  function localIdentityUser() {
    var raw = null;
    try { raw = window.localStorage.getItem(QR_USER_KEY); } catch (e) { raw = null; }
    if (!raw) { return null; }
    try {
      var u = JSON.parse(raw);
      if (!u || !u.nameEn) { return null; }
      /* 补齐导航栏需要的字段 */
      if (!u.nickname) { u.nickname = u.nameEn; }
      if (!u.role) { u.role = u.isAdmin ? 'admin' : 'member'; }
      return u;
    } catch (e) {
      return null;
    }
  }

  /* 把本地身份并入 OWL.auth.state，使其表现与 Gitee 登录态一致 */
  function syncLocalIdentity() {
    var u = localIdentityUser();
    if (!u) { return null; }
    if (OWL.auth && OWL.auth.state && !OWL.auth.state.user) {
      OWL.auth.state.user = u;
      OWL.auth.state.loading = false;
    }
    return u;
  }

  function ensureAdminEntry(user) {
    var menu = document.querySelector('.nav-menu');
    if (!menu) { return; }
    var link = menu.querySelector('a[data-nav="admin"]');
    if (user && user.role === 'admin' && user.status !== 'banned') {
      if (link) { return; }
      var a = document.createElement('a');
      a.setAttribute('href', 'admin.html');
      a.setAttribute('data-nav', 'admin');
      a.textContent = t('管理后台', 'Admin');
      a.className = 'nav-admin-entry';
      var anchor = menu.querySelector('.lang-switch');
      if (anchor && anchor.parentNode === menu) { menu.insertBefore(a, anchor); } else { menu.appendChild(a); }
    } else if (link) {
      link.parentNode.removeChild(link);
    }
  }

  function renderAccountState(st) {
    var links = document.querySelectorAll('a[data-account-link]');
    for (var i = 0; i < links.length; i++) { applyAccount(links[i], st.user); }
    ensureAdminEntry(st.user);
  }

  /* ======================================================================
     三、初始化
     ====================================================================== */

  function boot() {
    /* 3.1 登录态：先渲染一次占位，登录态就绪后再渲染一次 */
    /* 本地身份（二维码登录）优先恢复，保证刷新后登录态不丢 */
    syncLocalIdentity();
    renderAccountState(OWL.auth.state);
    OWL.auth.onChange(renderAccountState);
    OWL.auth.ready.then(function () {
      syncLocalIdentity();
      renderAccountState(OWL.auth.state);
    });

    /* 3.1b 本地身份（二维码）登录/退出后同步导航栏 */
    window.addEventListener('owl:identity-changed', function () {
      syncLocalIdentity();
      renderAccountState(OWL.auth.state);
    });

    /* 3.2 公告：数据库优先 */
    loadAnnouncements();

    /* 3.3 语言切换后重渲染动态文本（与站点既有语言机制联动） */
    if (window.MutationObserver) {
      var last = document.documentElement.getAttribute('lang');
      var obs = new MutationObserver(function () {
        var now = document.documentElement.getAttribute('lang');
        if (now === last) { return; }
        last = now;
        renderAccountState(OWL.auth.state);
        if (announcementsCache.length) { pushAnnouncements(announcementsCache); }
        try {
          window.dispatchEvent(new CustomEvent('owl:lang-changed', { detail: { lang: OWL.lang() } }));
        } catch (e) {}
      });
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    }
  }

  window.OWL.site = {
    announcements: {
      load: loadAnnouncements,
      rows: function () { return announcementsCache; },
      source: function () { return announcementsSource; },
      map: mapRow
    },
    account: { render: renderAccountState },
    esc: esc
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
