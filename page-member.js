/* ==========================================================================
   猫头鹰教 The Owl Cult — page-member.js
   member.html 专用逻辑：会员中心（账号信息、我的预约记录、站点公告）
   ========================================================================== */

(function (window, document) {
  'use strict';

  var OWL = window.OWL;
  if (!OWL) { return; }

  var t = OWL.t;
  var esc = OWL.esc;

  var reservations = [];
  var loadingRes = false;
  var resError = null;

  function gate() { return document.getElementById('memberGate'); }
  function app() { return document.getElementById('memberApp'); }

  function showGate(html) {
    var g = gate(), a = app();
    if (g) { g.innerHTML = html; g.hidden = false; }
    if (a) { a.hidden = true; }
  }

  function showApp() {
    var g = gate(), a = app();
    if (g) { g.hidden = true; }
    if (a) { a.hidden = false; }
  }

  function pickZhEn(zh, en) { return OWL.lang() === 'en' ? (en || zh || '') : (zh || en || ''); }

  /* ------------------------------------------------------------ 状态文案 */

  function roleText(user) {
    if (!user) { return ''; }
    if (user.status === 'banned') { return t('已禁用', 'Disabled'); }
    return user.role === 'admin' ? t('管理员', 'Administrator') : t('会员', 'Member');
  }

  function resStatusText(s) {
    switch (s) {
      case 'confirmed': return t('已确认', 'Confirmed');
      case 'done': return t('已完成', 'Completed');
      case 'cancelled': return t('已取消', 'Cancelled');
      default: return t('待处理', 'Pending');
    }
  }

  /* ------------------------------------------------------------ 账号信息 */

  function renderProfile(user) {
    var host = document.getElementById('memberProfile');
    if (!host) { return; }
    var name = user.nickname || user.giteeLogin || t('会员', 'Member');
    var rows = [
      ['Gitee', user.giteeLogin ? '@' + user.giteeLogin : '—'],
      [t('邮箱', 'Email'), user.email || '—'],
      [t('角色', 'Role'), roleText(user)],
      [t('加入时间', 'Joined'), OWL.fmtDate(user.createdAt) || '—'],
      [t('最近登录', 'Last sign-in'), OWL.fmtDate(user.lastLoginAt) || '—']
    ];

    var html = '<div class="member-card card">'
      + '<div class="auth-profile">'
      + '<img class="auth-avatar" src="' + esc(user.avatar || 'owl1.jpg') + '" alt="' + esc(name) + '" loading="lazy">'
      + '<div class="auth-profile-text">'
      + '<h3 class="auth-title">' + esc(name) + '</h3>'
      + '<p class="auth-desc">' + esc(roleText(user)) + '</p>'
      + '</div></div>'
      + '<dl class="auth-meta">';
    for (var i = 0; i < rows.length; i++) {
      html += '<div><dt>' + esc(rows[i][0]) + '</dt><dd>' + esc(rows[i][1]) + '</dd></div>';
    }
    html += '</dl><div class="auth-actions">'
      + '<a class="btn" href="shop.html">' + t('去商城逛逛', 'Visit the shop') + '</a>';
    if (user.role === 'admin' && user.status !== 'banned') {
      html += '<a class="btn" href="admin.html">' + t('管理后台', 'Admin console') + '</a>';
    }
    html += '<button class="btn btn-ghost" type="button" id="memberLogout">' + t('退出登录', 'Sign out') + '</button>'
      + '</div></div>';

    host.innerHTML = html;
    var out = document.getElementById('memberLogout');
    if (out) {
      out.addEventListener('click', function () {
        OWL.auth.logout().then(function () {
          OWL.ui.toast(t('已退出登录', 'Signed out'));
          render();
        });
      });
    }
  }

  /* ------------------------------------------------------------ 我的预约 */

  function renderReservations() {
    var host = document.getElementById('memberReservations');
    if (!host) { return; }

    if (loadingRes) {
      host.innerHTML = '<div class="shop-loading"><div class="auth-spinner" aria-hidden="true"></div>'
        + '<p>' + t('正在读取预约记录…', 'Loading your requests…') + '</p></div>';
      return;
    }
    if (resError) {
      host.innerHTML = '<p class="state-note is-danger">' + esc(OWL.errText(resError)) + '</p>';
      return;
    }
    if (!reservations.length) {
      host.innerHTML = '<p class="state-note">' + t('还没有预约记录。去商城看看，点击「我想要」即可登记。',
        'No requests yet. Browse the shop and click “I want it”.') + '</p>';
      return;
    }

    var html = '<div class="table-wrap"><table class="data-table"><thead><tr>'
      + '<th>' + t('商品', 'Product') + '</th>'
      + '<th>' + t('状态', 'Status') + '</th>'
      + '<th>' + t('留言', 'Message') + '</th>'
      + '<th>' + t('时间', 'Time') + '</th>'
      + '</tr></thead><tbody>';
    for (var i = 0; i < reservations.length; i++) {
      var r = reservations[i];
      var name = r.productName || pickZhEn(r.name, r.nameEn) || '—';
      html += '<tr>'
        + '<td>' + esc(name) + '</td>'
        + '<td><span class="chip">' + esc(resStatusText(r.status)) + '</span></td>'
        + '<td class="cell-soft">' + esc(r.message || '—') + '</td>'
        + '<td class="cell-soft">' + esc(OWL.fmtDate(r.createdAt) || '—') + '</td>'
        + '</tr>';
    }
    html += '</tbody></table></div>';
    host.innerHTML = html;
  }

  function loadReservations() {
    if (!OWL.isConfigured()) { return; }
    loadingRes = true;
    resError = null;
    renderReservations();
    OWL.call('reservations.mine', { sessionToken: OWL.session.token(), limit: 50 }).then(function (d) {
      var items = (d && d.items) ? d.items : (d || []);
      reservations = (Object.prototype.toString.call(items) === '[object Array]') ? items : [];
      loadingRes = false;
      renderReservations();
    }).catch(function (e) {
      loadingRes = false;
      resError = e;
      renderReservations();
    });
  }

  /* ------------------------------------------------------------ 站点公告 */

  function renderAnnouncements() {
    var host = document.getElementById('memberAnnouncements');
    if (!host) { return; }

    var rows = (OWL.site && OWL.site.announcements) ? OWL.site.announcements.rows() : [];
    var html = '';

    if (rows && rows.length) {
      html += '<ul class="notice-list">';
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var title = pickZhEn(r.title, r.titleEn);
        var body = pickZhEn(r.body, r.bodyEn);
        var lvl = (r.level === 'notice') ? t('通知', 'Notice') : t('公告', 'Info');
        html += '<li class="notice-item">'
          + '<div class="notice-head"><span class="chip' + (r.level === 'notice' ? ' chip-gold' : '') + '">' + esc(lvl) + '</span>'
          + '<span class="notice-date">' + esc(OWL.fmtDate(r.publishedAt || r.updatedAt)) + '</span></div>'
          + '<h4 class="notice-title">' + esc(title) + '</h4>'
          + (body ? '<p class="notice-body">' + esc(body) + '</p>' : '')
          + (r.link ? '<a class="notice-link" href="' + esc(r.link) + '">' + esc(pickZhEn(r.linkText, r.linkTextEn) || t('查看详情', 'Learn more')) + '</a>' : '')
          + '</li>';
      }
      html += '</ul>';
      host.innerHTML = html;
      return;
    }

    /* 回退：data.js 中的静态公告 */
    var statics = (window.OWL_SITE && window.OWL_SITE.announcements) ? window.OWL_SITE.announcements : [];
    if (statics.length) {
      html += '<ul class="notice-list">';
      for (var j = 0; j < statics.length; j++) {
        var s = statics[j];
        html += '<li class="notice-item">'
          + '<div class="notice-head"><span class="chip' + (s.level === 'notice' ? ' chip-gold' : '') + '">'
          + esc(s.level === 'notice' ? t('通知', 'Notice') : t('公告', 'Info')) + '</span>'
          + '<span class="notice-date">' + esc(s.date || '') + '</span></div>'
          + '<h4 class="notice-title">' + esc(pickZhEn(s.zh, s.en)) + '</h4>'
          + '</li>';
      }
      html += '</ul>';
      host.innerHTML = html;
      return;
    }

    host.innerHTML = '<p class="state-note">' + t('暂无公告。', 'No announcements yet.') + '</p>';
  }

  /* ------------------------------------------------------------ 渲染总入口 */

  function render() {
    if (!OWL.isConfigured()) {
      showGate('<div class="card state-card"><h3>' + t('还没有配置云开发环境', 'CloudBase environment not configured yet') + '</h3>'
        + '<p>' + t('请按 docs/部署手册.md 完成部署，并把环境 ID 填入 config.js。', 'Follow docs/部署手册.md to deploy, then fill the env ID into config.js.') + '</p></div>');
      return;
    }

    var user = OWL.auth.user();
    if (OWL.auth.state.loading) {
      showGate('<div class="card state-card"><div class="auth-spinner" aria-hidden="true"></div>'
        + '<p>' + t('正在确认登录状态…', 'Checking your sign-in status…') + '</p></div>');
      return;
    }
    if (!user) {
      showGate('<div class="card state-card"><h3>' + t('请先登录', 'Please sign in first') + '</h3>'
        + '<p>' + t('会员中心需要 Gitee 登录后访问。', 'The member center requires a Gitee sign-in.') + '</p>'
        + '<div class="auth-actions"><button class="btn btn-primary" type="button" id="memberLogin">'
        + t('使用 Gitee 登录', 'Sign in with Gitee') + '</button></div></div>');
      var btn = document.getElementById('memberLogin');
      if (btn) {
        btn.addEventListener('click', function () {
          OWL.auth.login('member.html').catch(function (e) { OWL.ui.toast(OWL.errText(e)); });
        });
      }
      return;
    }

    showApp();
    renderProfile(user);
    renderReservations();
    renderAnnouncements();
    if (!loadingRes && !resError && !reservations.length) { loadReservations(); }
  }

  function boot() {
    OWL.auth.ready.then(render);
    OWL.auth.onChange(function () { render(); });
    window.addEventListener('owl:lang-changed', function () { render(); });
    window.addEventListener('owl:announcements-updated', function () { renderAnnouncements(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
