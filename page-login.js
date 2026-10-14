/* ==========================================================================
   猫头鹰教 The Owl Cult — assets/page-login.js
   login.html 专用逻辑：Gitee 授权跳转、回调换会话、登录态展示与退出

   流程：
     ① 点击「使用 Gitee 登录」→ 调云函数取授权地址（state 由服务端签名）→ 跳转 Gitee
     ② Gitee 授权后回到 login.html?code=xxx&state=xxx
     ③ 前端把 code/state 交给云函数换取本站会话令牌（sessionToken）→ 写入 localStorage
     ④ CloudBase 侧使用自定义登录 ticket 建立登录态（失败不影响本站功能）
   ========================================================================== */

(function (window, document) {
  'use strict';

  var OWL = window.OWL;
  if (!OWL) { return; }

  var t = OWL.t;
  var esc = OWL.esc;

  var phase = 'loading';       /* loading | guest | exchanging | ready | error */
  var lastError = null;
  var redirectTo = 'index.html';
  var redirectTimer = null;

  /* ---------------------------------------------------------------- 工具 */

  function params() {
    var out = {};
    var q = window.location.search.replace(/^\?/, '');
    if (!q) { return out; }
    var parts = q.split('&');
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) { continue; }
      var kv = parts[i].split('=');
      try {
        out[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      } catch (e) {
        out[kv[0]] = kv[1] || '';
      }
    }
    return out;
  }

  function cleanUrl() {
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  function card() { return document.getElementById('authCard'); }

  function roleBadge(user) {
    if (!user) { return ''; }
    if (user.status === 'banned') { return '<span class="chip chip-danger">' + t('已禁用', 'Disabled') + '</span>'; }
    if (user.role === 'admin') { return '<span class="chip chip-gold">' + t('管理员', 'Administrator') + '</span>'; }
    return '<span class="chip">' + t('会员', 'Member') + '</span>';
  }

  function avatarUrl(user) {
    return (user && user.avatar) ? user.avatar : 'images/owl1.jpg';
  }

  /* ------------------------------------------------------------- 各区块模板 */

  function loadingMarkup() {
    return '<div class="auth-body">'
      + '<div class="auth-spinner" aria-hidden="true"></div>'
      + '<p class="auth-desc">' + t('正在确认登录状态…', 'Checking your sign-in status…') + '</p>'
      + '</div>';
  }

  function unconfiguredMarkup() {
    return '<div class="auth-body">'
      + '<h3 class="auth-title">' + t('还没有配置云开发环境', 'CloudBase environment not configured yet') + '</h3>'
      + '<p class="auth-desc">' + t(
        '请先按 docs/部署手册.md 完成部署，并把环境 ID 填写到 assets/config.js 的 envId 中。填写后本页的登录功能即刻可用。',
        'Please follow docs/部署手册.md to deploy, then fill the environment ID into envId in assets/config.js.'
      ) + '</p>'
      + '<p class="auth-note">' + t('当前站点仍可正常浏览，只是登录、商城与后台不可用。', 'The site itself still works; only sign-in, shop and admin are unavailable.') + '</p>'
      + '</div>';
  }

  function guestMarkup() {
    return '<div class="auth-body">'
      + '<h3 class="auth-title">' + t('入会 · 登录', 'Join · Sign in') + '</h3>'
      + '<p class="auth-desc">' + t(
        '使用 Gitee 账号一键登录。我们只读取你的公开资料（昵称、头像、Gitee 用户名），不会获取任何仓库或密码信息。',
        'Sign in with your Gitee account. We only read your public profile (nickname, avatar, Gitee username) — never your repositories or password.'
      ) + '</p>'
      + '<div class="auth-actions">'
      + '<button class="btn btn-primary" type="button" id="giteeLogin">'
      + '<span class="btn-gitee-dot" aria-hidden="true"></span>' + t('使用 Gitee 登录', 'Sign in with Gitee')
      + '</button>'
      + '</div>'
      + '<p class="auth-note">' + t(
        '首次登录会自动创建会员账号，默认角色为「会员」；首个登录的账号将成为管理员。',
        'Your member account is created on first sign-in (role: member). The very first account becomes the administrator.'
      ) + '</p>'
      + '<p class="auth-hint" id="authHint" hidden></p>'
      + '</div>';
  }

  function userMarkup(user) {
    var name = user.nickname || user.giteeLogin || t('会员', 'Member');
    var rows = [];
    rows.push(['Gitee', user.giteeLogin ? '@' + user.giteeLogin : '—']);
    rows.push([t('加入时间', 'Joined'), OWL.fmtDate(user.createdAt) || '—']);
    rows.push([t('最近登录', 'Last sign-in'), OWL.fmtDate(user.lastLoginAt) || '—']);

    var html = '<div class="auth-body">'
      + '<div class="auth-profile">'
      + '<img class="auth-avatar" src="' + esc(avatarUrl(user)) + '" alt="' + esc(name) + '" loading="lazy">'
      + '<div class="auth-profile-text">'
      + '<h3 class="auth-title">' + esc(name) + ' ' + roleBadge(user) + '</h3>'
      + '<p class="auth-desc">' + t('你已登录，登录态在本站四个页面之间共享。', 'You are signed in. The session is shared across all pages.') + '</p>'
      + '</div></div>'
      + '<dl class="auth-meta">';
    for (var i = 0; i < rows.length; i++) {
      html += '<div><dt>' + esc(rows[i][0]) + '</dt><dd>' + esc(rows[i][1]) + '</dd></div>';
    }
    html += '</dl>'
      + '<div class="auth-actions">'
      + '<a class="btn btn-primary" href="member.html">' + t('进入会员中心', 'Member center') + '</a>';
    if (user.role === 'admin' && user.status !== 'banned') {
      html += '<a class="btn" href="admin.html">' + t('管理后台', 'Admin console') + '</a>';
    }
    html += '<button class="btn btn-ghost" type="button" id="btnLogout">' + t('退出登录', 'Sign out') + '</button>'
      + '</div>'
      + (user.status === 'banned'
        ? '<p class="auth-hint is-danger">' + t('该账号已被管理员禁用，如需恢复请联系站点管理员。', 'This account has been disabled by the administrator.') + '</p>'
        : '')
      + '</div>';
    return html;
  }

  function exchangingMarkup() {
    return '<div class="auth-body">'
      + '<div class="auth-spinner" aria-hidden="true"></div>'
      + '<h3 class="auth-title">' + t('正在完成登录…', 'Completing sign-in…') + '</h3>'
      + '<p class="auth-desc">' + t('正在用 Gitee 返回的授权码换取本站登录凭证。', 'Exchanging the authorization code for your session.') + '</p>'
      + '</div>';
  }

  function successMarkup(user) {
    return '<div class="auth-body">'
      + '<h3 class="auth-title">' + t('登录成功', 'Signed in') + '</h3>'
      + '<p class="auth-desc">'
      + esc(t('欢迎回来，', 'Welcome back, ') + (user.nickname || user.giteeLogin || t('会员', 'Member')) + t('。', '.'))
      + '</p>'
      + '<div class="auth-actions">'
      + '<a class="btn btn-primary" id="continueBtn" href="' + esc(redirectTo) + '">' + t('继续浏览', 'Continue') + '</a>'
      + '<button class="btn btn-ghost" type="button" id="btnLogout2">' + t('退出登录', 'Sign out') + '</button>'
      + '</div>'
      + '<p class="auth-note">' + t('即将自动跳转…', 'Redirecting automatically…') + '</p>'
      + '</div>';
  }

  function errorMarkup(err) {
    return '<div class="auth-body">'
      + '<h3 class="auth-title">' + t('登录失败', 'Sign-in failed') + '</h3>'
      + '<p class="auth-desc is-danger">' + esc(OWL.errText(err)) + '</p>'
      + '<p class="auth-note">' + t(
        '常见原因：Gitee 应用的「回调地址」与云函数环境变量 SITE_URL 不一致；云函数未部署；环境 ID 填写错误。详见 docs/部署手册.md 第 10 章排查清单。',
        'Common causes: Gitee callback URL does not match the SITE_URL env var, cloud function not deployed, or a wrong environment ID. See chapter 10 of the deployment guide.'
      ) + '</p>'
      + '<div class="auth-actions">'
      + '<button class="btn btn-primary" type="button" id="giteeLogin">' + t('重新登录', 'Try again') + '</button>'
      + '<a class="btn btn-ghost" href="index.html">' + t('返回首页', 'Back home') + '</a>'
      + '</div>'
      + '</div>';
  }

  /* ---------------------------------------------------------------- 渲染 */

  function render() {
    var box = card();
    if (!box) { return; }
    window.clearTimeout(redirectTimer);

    if (!OWL.isConfigured()) { box.innerHTML = unconfiguredMarkup(); return; }

    if (phase === 'exchanging') { box.innerHTML = exchangingMarkup(); return; }
    if (phase === 'error') { box.innerHTML = errorMarkup(lastError); bind(); return; }
    if (phase === 'loading') { box.innerHTML = loadingMarkup(); return; }

    var user = OWL.auth.user();
    if (!user) { box.innerHTML = guestMarkup(); bind(); return; }
    if (phase === 'ready' && window.__owlJustSignedIn) { box.innerHTML = successMarkup(user); bind(); return; }
    box.innerHTML = userMarkup(user);
    bind();
  }

  function bind() {
    var gitee = document.getElementById('giteeLogin');
    if (gitee) { gitee.addEventListener('click', startLogin); }

    var out1 = document.getElementById('btnLogout');
    var out2 = document.getElementById('btnLogout2');
    if (out1) { out1.addEventListener('click', doLogout); }
    if (out2) { out2.addEventListener('click', doLogout); }

    var cont = document.getElementById('continueBtn');
    if (cont && phase === 'ready' && window.__owlJustSignedIn) {
      redirectTimer = window.setTimeout(function () {
        window.location.href = redirectTo;
      }, 2200);
    }
  }

  /* ---------------------------------------------------------------- 行为 */

  function startLogin() {
    var hint = document.getElementById('authHint');
    var btn = document.getElementById('giteeLogin');
    if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
    if (hint) { hint.hidden = false; hint.textContent = t('正在跳转 Gitee…', 'Redirecting to Gitee…'); }

    OWL.auth.login(redirectTo).catch(function (e) {
      lastError = e;
      phase = 'error';
      render();
    });
  }

  function doLogout() {
    OWL.auth.logout().then(function () {
      window.__owlJustSignedIn = false;
      phase = 'ready';
      OWL.ui.toast(t('已退出登录', 'Signed out'));
      render();
    });
  }

  /* ---------------------------------------------------------------- 启动 */

  function boot() {
    var p = params();
    redirectTo = (p.redirect && !/^(https?:)?\/\//i.test(p.redirect)) ? p.redirect : (OWL.auth.redirectTarget() || 'index.html');

    if (p.error) {
      lastError = OWL.error('FORBIDDEN', t('Gitee 授权被取消或失败：', 'Gitee authorization was cancelled or failed: ') + p.error,
        'Gitee authorization failed: ' + p.error);
      phase = 'error';
      render();
      return;
    }

    if (p.code) {
      phase = 'exchanging';
      render();
      OWL.auth.exchange(p.code, p.state).then(function (d) {
        cleanUrl();
        OWL.auth.clearRedirect();
        if (d && d.redirect && !/^(https?:)?\/\//i.test(d.redirect)) { redirectTo = d.redirect; }
        window.__owlJustSignedIn = true;
        phase = 'ready';
        OWL.ui.toast(t('登录成功', 'Signed in'));
        render();
      }).catch(function (e) {
        cleanUrl();
        lastError = e;
        phase = 'error';
        render();
      });
      return;
    }

    OWL.auth.ready.then(function () {
      phase = 'ready';
      render();
    });

    OWL.auth.onChange(function () {
      if (phase === 'exchanging') { return; }
      render();
    });

    window.addEventListener('owl:lang-changed', function () { render(); });

    var p2 = document.getElementById('pageParams');
    if (p2) { p2.textContent = ''; }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
