/* ==========================================================================
   猫头鹰教 The Owl Cult — assets/page-admin-console.js
   admin.html 专用逻辑：管理后台

   功能：
     ① 管理员登录 / 注册账号（首个内置管理员：Harmony，加入日期 2026-06-01）
     ② 签发「登录标识符」（OWL1）与二维码 —— 这是普通访客无法自行生成的东西
     ③ 校验访客发来的「申请标识符」（OWLR）
     ④ 修改密码
     ⑤ 未来功能的占位区

   说明：本页的权限判断在前端完成（按需求「不考虑安全性问题」）。
        真正的权限校验应当在服务端进行。
   ========================================================================== */

(function (window, document) {
  'use strict';

  var OWL = window.OWL;
  var ID = window.OWLID;
  var QR = window.OWLQR;
  var IDCARD = window.OWLIDCARD;
  var ADM = window.OWLADMIN;
  if (!OWL || !ID || !QR || !ADM || !IDCARD) { return; }

  var t = OWL.t;
  var esc = OWL.esc;

  var busy = false;
  var notice = null;               /* 登录/注册区提示 */
  var lastIssued = null;
  var verifyResult = null;         /* 申请标识符校验结果 */

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }

  var ISSUED_KEY = 'owl-cult-issued-ids';

  function root() { return document.getElementById('adminApp'); }

  function loadIssued() {
    var raw = lsGet(ISSUED_KEY);
    if (!raw) { return []; }
    try {
      var list = JSON.parse(raw);
      return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
    } catch (e) {
      return [];
    }
  }

  function saveIssued(list) { lsSet(ISSUED_KEY, JSON.stringify(list)); }

  function setNotice(type, text) { notice = text ? { type: type, text: text } : null; }

  function todayInput() { return ID.todayStr(); }

  function noticeMarkup() {
    if (!notice) { return ''; }
    return '<p class="qr-notice is-' + notice.type + '">' + esc(notice.text) + '</p>';
  }

  /* ------------------------------------------------------------ 未登录视图 */

  function gateMarkup() {
    return '<div class="card admin-gate">'
      + '<div class="qr-head">'
      + '<h2 class="qr-title">' + t('管理后台', 'Admin console') + '</h2>'
      + '<p class="qr-sub">' + t(
        '管理员登录后可签发会员的登录标识符与二维码。',
        'Administrators sign in here to issue member sign-in identifiers and QR codes.'
      ) + '</p></div>'

      + '<div class="admin-grid">'
      /* --- 登录 --- */
      + '<div class="admin-panel">'
      + '<h3 class="admin-panel-title">' + t('管理员登录', 'Administrator sign-in') + '</h3>'
      + '<label class="qr-label" for="admLoginName">' + t('英文名', 'English name') + '</label>'
      + '<input id="admLoginName" class="qr-input" type="text" spellcheck="false" placeholder="Harmony">'
      + '<label class="qr-label" for="admLoginPw">' + t('密码', 'Password') + '</label>'
      + '<input id="admLoginPw" class="qr-input" type="password" autocomplete="current-password">'
      + '<div class="qr-actions">'
      + '<button class="btn btn-primary" type="button" id="admLoginGo">' + t('登录', 'Sign in') + '</button>'
      + '</div>'
      + '<p class="admin-hint">' + t(
        '已内置一位管理员 Harmony（加入时间 2026-06-01）。初始密码不在此公示，请向站点作者索取。',
        'One administrator, Harmony (joined 2026-06-01), is built in. The initial password is not shown here — ask the site author for it.'
      ) + '</p>'
      + '</div>'

      /* --- 注册 --- */
      + '<div class="admin-panel">'
      + '<h3 class="admin-panel-title">' + t('注册管理员账号', 'Register an administrator') + '</h3>'
      + '<label class="qr-label" for="admRegName">' + t('英文名', 'English name') + '</label>'
      + '<input id="admRegName" class="qr-input" type="text" spellcheck="false" maxlength="64" placeholder="Lin Yue">'
      + '<p class="qr-help">' + t(
        '只允许英文字母、数字、空格与 . \' - _',
        'Letters, digits, spaces and . \' - _ only'
      ) + '</p>'
      + '<label class="qr-label" for="admRegPw">' + t('密码（至少 6 位）', 'Password (min 6 chars)') + '</label>'
      + '<input id="admRegPw" class="qr-input" type="password" autocomplete="new-password">'
      + '<label class="qr-label" for="admRegPw2">' + t('确认密码', 'Confirm password') + '</label>'
      + '<input id="admRegPw2" class="qr-input" type="password" autocomplete="new-password">'
      + '<div class="qr-actions">'
      + '<button class="btn btn-primary" type="button" id="admRegGo">' + t('注册账号', 'Register') + '</button>'
      + '</div>'
      + '</div>'
      + '</div>'

      + noticeMarkup() + '</div>';
  }

  /* -------------------------------------------------------------- 已登录视图 */

  function consoleMarkup(user) {
    var admins = ADM.list();
    var adminsHtml = '';
    for (var i = 0; i < admins.length; i++) {
      var a = admins[i];
      adminsHtml += '<div class="admin-idrow">'
        + '<span class="chip' + (a.builtin ? ' chip-gold' : '') + '">'
        + esc(ID.roleLabel(a.role, OWL.lang())) + '</span>'
        + '<span class="admin-idrow-code">' + esc(a.nameEn) + ' · '
        + esc(t('加入 ', 'joined ')) + esc(a.joinedAt) + '</span>'
        + '</div>';
    }

    var issuedList = '';
    var list = loadIssued();
    if (list.length) {
      for (var j = 0; j < list.length; j++) {
        issuedList += '<div class="admin-idrow">'
          + '<span class="admin-idrow-code">' + esc(list[j].text) + '</span>'
          + '<button class="btn btn-mini" type="button" data-copy-idx="' + j + '">'
          + t('复制', 'Copy') + '</button>'
          + '</div>';
      }
    } else {
      issuedList = '<p class="admin-empty">' + t('还没有签发过标识符。', 'No identifiers issued yet.') + '</p>';
    }

    return '<div class="admin-shell">'

      /* 当前管理员 */
      + '<div class="admin-who">'
      + '<span class="admin-who-name">' + esc(user.nameEn) + '</span>'
      + '<span class="chip chip-gold">' + t('管理员', 'Administrator') + '</span>'
      + '<span class="chip">' + t('加入 ', 'Joined ') + esc(user.joinedAt) + '</span>'
      + '<button class="btn btn-mini btn-ghost" type="button" id="admLogout" style="margin-left:auto">'
      + t('退出登录', 'Sign out') + '</button>'
      + '</div>'

      /* 签发登录标识符（核心功能） */
      + '<div class="admin-panel">'
      + '<h3 class="admin-panel-title">' + t('签发登录标识符', 'Issue a sign-in identifier') + '</h3>'
      + '<p class="admin-hint">' + t(
        '为通过审核的会员生成登录标识符与二维码。这是登录用的 OWL1 标识符，普通访客无法自行生成。',
        'Generate a sign-in identifier and QR code for an approved member. This is the OWL1 code, which visitors cannot create themselves.'
      ) + '</p>'
      + '<div class="admin-grid" style="margin-top:1rem">'
      + '<div>'
      + '<label class="qr-label" for="issueName">' + t('会员英文名', 'Member English name') + '</label>'
      + '<input id="issueName" class="qr-input" type="text" spellcheck="false" maxlength="64" placeholder="Zhang Wei">'
      + '<label class="qr-label" for="issueRole">' + t('身份', 'Role') + '</label>'
      + '<select id="issueRole" class="qr-input">'
      + '<option value="member">' + t('会员（member）', 'Member (member)') + '</option>'
      + '<option value="admin">' + t('管理员（admin）', 'Administrator (admin)') + '</option>'
      + '</select>'
      + '<label class="qr-label" for="issueJoined">' + t('加入时间', 'Join date') + '</label>'
      + '<input id="issueJoined" class="qr-input" type="date" value="' + esc(todayInput()) + '">'
      + '<div class="qr-actions">'
      + '<button class="btn btn-primary" type="button" id="issueGo">' + t('生成标识符与二维码', 'Generate identifier and QR') + '</button>'
      + '</div>'
      + '</div>'
      + '<div id="issueResult" class="qr-result"></div>'
      + '</div>'
      + '<div class="admin-idlist">' + issuedList + '</div>'
      + noticeMarkup()
      + '</div>'

      /* 校验申请标识符 */
      + '<div class="admin-panel">'
      + '<h3 class="admin-panel-title">' + t('校验入会申请', 'Verify an application code') + '</h3>'
      + '<p class="admin-hint">' + t(
        '把访客发来的申请标识符（OWLR）粘贴到这里，确认内容与校验码是否有效。',
        'Paste the application code (OWLR) a visitor sent you to confirm it is valid.'
      ) + '</p>'
      + '<label class="qr-label" for="verifyInput">' + t('申请标识符', 'Application code') + '</label>'
      + '<textarea id="verifyInput" class="qr-input qr-textarea qr-mono" rows="2" spellcheck="false"'
      + ' placeholder="OWLR|Your Name|member|2026-01-01|0000000000000000"></textarea>'
      + '<div class="qr-actions">'
      + '<button class="btn btn-primary" type="button" id="verifyGo">' + t('校验', 'Verify') + '</button>'
      + '<button class="btn" type="button" id="verifyToIssue">' + t('通过，去签发登录标识符', 'Approve and issue a sign-in code') + '</button>'
      + '</div>'
      + '<div id="verifyResult" class="qr-result"></div>'
      + '</div>'

      /* 账号管理 */
      + '<div class="admin-panel">'
      + '<h3 class="admin-panel-title">' + t('账号', 'Accounts') + '</h3>'
      + '<div class="admin-localnote">'
      + '<strong>' + t('账号只保存在本机浏览器中', 'Accounts live only in this browser') + '</strong>'
      + '<p>' + t(
        '管理员账号与密码保存在本机 localStorage，不会上传、也不会同步。换浏览器、换设备或清除浏览器数据后，你改过的密码和新增的账号都会消失，内置管理员会回到初始密码。如需跨设备使用，需要接入服务端账号体系。',
        'Administrator accounts and passwords are stored in this browser\'s localStorage. Nothing is uploaded or synced. Switching browsers or devices, or clearing browser data, will lose your changed password and any accounts you added — the built-in administrator reverts to its initial password. Cross-device use would require a server-side account system.'
      ) + '</p></div>'
      + '<h4 class="qr-label">' + t('现有管理员', 'Current administrators') + '</h4>'
      + '<div class="admin-idlist">' + adminsHtml + '</div>'
      + '<h4 class="qr-label" style="margin-top:1.4rem">' + t('修改我的密码', 'Change my password') + '</h4>'
      + '<p class="admin-hint">' + t(
        '新密码只写入本机浏览器；换个浏览器或设备就不同步了。',
        'The new password is written to this browser only — it will not carry over to another browser or device.'
      ) + '</p>'
      + '<div class="admin-grid">'
      + '<div>'
      + '<label class="qr-label" for="pwOld">' + t('当前密码', 'Current password') + '</label>'
      + '<input id="pwOld" class="qr-input" type="password" autocomplete="current-password">'
      + '<label class="qr-label" for="pwNew">' + t('新密码（至少 6 位）', 'New password (min 6 chars)') + '</label>'
      + '<input id="pwNew" class="qr-input" type="password" autocomplete="new-password">'
      + '<label class="qr-label" for="pwNew2">' + t('确认新密码', 'Confirm new password') + '</label>'
      + '<input id="pwNew2" class="qr-input" type="password" autocomplete="new-password">'
      + '<div class="qr-actions">'
      + '<button class="btn btn-primary" type="button" id="pwGo">' + t('修改密码', 'Change password') + '</button>'
      + '</div>'
      + '</div><div></div>'
      + '</div>'
      + '</div>'

      /* 未来功能占位 */
      + '<div class="admin-panel">'
      + '<h3 class="admin-panel-title">' + t('后续功能', 'Coming later') + '</h3>'
      + '<p class="admin-hint">' + t(
        '这些功能会陆续加入，目前保留入口占位。',
        'These features will be added over time; the entries are placeholders for now.'
      ) + '</p>'
      + '<div class="admin-soon" style="margin-top:1rem">'
      + soonItem(t('会员名册', 'Member roster'))
      + soonItem(t('批量签发与导出', 'Bulk issue and export'))
      + soonItem(t('公告发布', 'Announcement publishing'))
      + soonItem(t('预约审核', 'Request review'))
      + soonItem(t('商城商品管理', 'Shop product management'))
      + soonItem(t('操作日志', 'Audit log'))
      + '</div>'
      + '</div>'

      + '</div>';
  }

  function soonItem(label) {
    return '<div class="admin-soon-item"><span class="chip">' + t('待开发', 'Planned') + '</span>'
      + '<span>' + esc(label) + '</span></div>';
  }

  /* ---------------------------------------------------------------- 渲染 */

  function render() {
    var box = root();
    if (!box) { return; }
    var user = ADM.current();
    box.innerHTML = user ? consoleMarkup(user) : gateMarkup();
    bind(user);
    if (user && lastIssued) { paintIssued(); }
    if (user && verifyResult) { paintVerify(); }
  }

  /* ------------------------------------------------------------ 事件绑定 */

  function bind(user) {
    if (!user) {
      var loginGo = document.getElementById('admLoginGo');
      if (loginGo) { loginGo.addEventListener('click', doLogin); }

      var regGo = document.getElementById('admRegGo');
      if (regGo) { regGo.addEventListener('click', doRegister); }

      /* 回车提交 */
      var pw = document.getElementById('admLoginPw');
      if (pw) {
        pw.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { doLogin(); }
        });
      }
      return;
    }

    var out = document.getElementById('admLogout');
    if (out) {
      out.addEventListener('click', function () {
        ADM.logout();
        setNotice('ok', t('已退出管理后台。', 'Signed out of the admin console.'));
        render();
      });
    }

    var issueGo = document.getElementById('issueGo');
    if (issueGo) { issueGo.addEventListener('click', doIssue); }

    var verifyGo = document.getElementById('verifyGo');
    if (verifyGo) { verifyGo.addEventListener('click', doVerify); }

    var toIssue = document.getElementById('verifyToIssue');
    if (toIssue) { toIssue.addEventListener('click', useVerifiedForIssue); }

    var pwGo = document.getElementById('pwGo');
    if (pwGo) { pwGo.addEventListener('click', doChangePassword); }

    var copies = document.querySelectorAll('[data-copy-idx]');
    for (var i = 0; i < copies.length; i++) {
      copies[i].addEventListener('click', function () {
        var idx = parseInt(this.getAttribute('data-copy-idx'), 10);
        var list = loadIssued();
        if (!list[idx]) { return; }
        copyText(list[idx].text);
      });
    }

    var copyIssued = document.getElementById('issueCopy');
    if (copyIssued) {
      copyIssued.addEventListener('click', function () {
        if (lastIssued) { copyText(lastIssued.text); }
      });
    }
    var dlIssued = document.getElementById('issueDownload');
    if (dlIssued) { dlIssued.addEventListener('click', downloadIssued); }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        OWL.ui.toast(t('已复制', 'Copied'));
      }).catch(function () { OWL.ui.toast(t('复制失败', 'Copy failed')); });
    } else {
      OWL.ui.toast(t('当前浏览器不支持一键复制，请手动选择', 'Copy is unavailable — please select manually'));
    }
  }

  /* ------------------------------------------------------------ 登录 / 注册 */

  function doLogin() {
    if (busy) { return; }
    var n = document.getElementById('admLoginName');
    var p = document.getElementById('admLoginPw');
    busy = true;
    ADM.login({ nameEn: n ? n.value : '', password: p ? p.value : '' }).then(function (r) {
      busy = false;
      if (!r.ok) {
        setNotice('error', OWL.lang() === 'en' ? (r.messageEn || r.message) : r.message);
        render();
        return;
      }
      setNotice('ok', t('欢迎回来，', 'Welcome back, ') + r.user.nameEn);
      render();
      OWL.ui.toast(t('已登录管理后台', 'Signed in to the admin console'));
    }).catch(function (e) {
      busy = false;
      setNotice('error', String(e && e.message ? e.message : e));
      render();
    });
  }

  function doRegister() {
    if (busy) { return; }
    var n = document.getElementById('admRegName');
    var p1 = document.getElementById('admRegPw');
    var p2 = document.getElementById('admRegPw2');

    var nameEn = n ? n.value : '';
    var pw = p1 ? p1.value : '';
    var pw2 = p2 ? p2.value : '';

    if (!nameEn.trim()) {
      setNotice('error', t('请填写管理员英文名。', 'Please enter an administrator name.'));
      render();
      return;
    }
    if (pw !== pw2) {
      setNotice('error', t('两次输入的密码不一致。', 'The two passwords do not match.'));
      render();
      return;
    }

    busy = true;
    ADM.register({ nameEn: nameEn, password: pw }).then(function (r) {
      busy = false;
      if (!r.ok) {
        setNotice('error', OWL.lang() === 'en' ? (r.messageEn || r.message) : r.message);
        render();
        return;
      }
      setNotice('ok', t('管理员账号已创建：', 'Administrator created: ') + r.user.nameEn
        + t('。现在可以用它登录。', '. You can sign in with it now.'));
      render();
    }).catch(function (e) {
      busy = false;
      setNotice('error', String(e && e.message ? e.message : e));
      render();
    });
  }

  /* ------------------------------------------------------------ 签发标识符 */

  function doIssue() {
    if (busy) { return; }
    var n = document.getElementById('issueName');
    var r = document.getElementById('issueRole');
    var j = document.getElementById('issueJoined');

    var nameEn = n ? n.value : '';
    var isAdmin = r ? r.value === 'admin' : false;
    var joinedAt = j ? j.value : '';

    if (!nameEn.trim()) {
      setNotice('error', t('请填写会员英文名。', 'Please enter the member name.'));
      render();
      return;
    }
    if (!joinedAt) {
      setNotice('error', t('请选择加入时间。', 'Please pick a join date.'));
      render();
      return;
    }

    busy = true;
    ID.build({ nameEn: nameEn, isAdmin: isAdmin, joinedAt: joinedAt }).then(function (text) {
      return ID.verifyLogin(text).then(function (v) {
        busy = false;
        if (!v.ok) {
          setNotice('error', OWL.lang() === 'en' ? (v.messageEn || v.message) : v.message);
          render();
          return;
        }
        lastIssued = { text: text, data: v.data };
        var list = loadIssued();
        /* 同名同角色的旧记录替换掉，避免列表里堆积重复项 */
        var kept = [];
        for (var i = 0; i < list.length; i++) {
          if (String(list[i].text) !== text) { kept.push(list[i]); }
        }
        kept.unshift({ text: text, nameEn: v.data.nameEn, role: v.data.role, joinedAt: v.data.joinedAt });
        saveIssued(kept);
        setNotice('ok', t('已签发登录标识符：', 'Sign-in identifier issued for ') + v.data.nameEn);
        render();
        OWL.ui.toast(t('标识符已生成', 'Identifier generated'));
      });
    }).catch(function (e) {
      busy = false;
      setNotice('error', (e && e.message) ? e.message : String(e));
      render();
    });
  }

  function paintIssued() {
    if (!lastIssued) { return; }
    var host = document.getElementById('issueResult');
    if (!host) { return; }
    var d = lastIssued.data;
    host.innerHTML = '<div class="qr-result-inner">'
      /* 完整信息图：二维码 + 英文名 + 身份 + 加入时间 + 校验码 */
      + '<div class="owl-idcard-wrap" id="issueCard"></div>'
      + '<div class="qr-result-side">'
      + '<h4 class="qr-result-title">' + esc(d.nameEn) + '</h4>'
      + '<p class="owl-apply-badge" style="border-color:rgba(217,180,91,.5);background:rgba(217,180,91,.12);color:var(--gold-bright)">'
      + t('登录标识符 · 可扫码登录', 'Sign-in identifier · ready to scan') + '</p>'
      + '<dl class="qr-meta">'
      + '<div><dt>' + t('身份', 'Role') + '</dt><dd>' + esc(ID.roleLabel(d.role, OWL.lang())) + '</dd></div>'
      + '<div><dt>' + t('加入时间', 'Joined') + '</dt><dd>' + esc(d.joinedAt) + '</dd></div>'
      + '<div><dt>' + t('校验码', 'Checksum') + '</dt><dd class="qr-mono">' + esc(ID.groupChecksum(d.checksum)) + '</dd></div>'
      + '</dl>'
      + '<label class="qr-label" for="issueTextOut">' + t('标识符文本', 'Identifier text') + '</label>'
      + '<textarea id="issueTextOut" class="qr-input qr-textarea qr-mono" rows="2" readonly>'
      + esc(lastIssued.text) + '</textarea>'
      + '<div class="qr-actions">'
      + '<button class="btn btn-primary" type="button" id="issueCopy">' + t('复制标识符', 'Copy identifier') + '</button>'
      + '<button class="btn" type="button" id="issueDownload">' + t('保存信息图', 'Save info card') + '</button>'
      + '</div>'
      + '</div></div>';

    var cardHost = document.getElementById('issueCard');
    if (cardHost && window.OWLIDCARD) {
      try {
        OWLIDCARD.previewInto(cardHost, {
          identifier: lastIssued.text,
          data: d,
          kind: 'login',
          width: 340,
          scale: 2
        });
      } catch (e) {
        if (window.console && console.warn) { console.warn('[owl] 信息图生成失败：', e); }
      }
    }
    bind(ADM.current());
  }

  function downloadIssued() {
    if (!lastIssued || !window.OWLIDCARD) { return; }
    var ok = OWLIDCARD.download({
      identifier: lastIssued.text,
      data: lastIssued.data,
      kind: 'login',
      width: 420,
      scale: 3
    }, OWLIDCARD.defaultName({ data: lastIssued.data, kind: 'login' }));
    OWL.ui.toast(ok
      ? t('信息图已保存', 'Info card saved')
      : t('保存失败', 'Save failed'));
  }

  /* ------------------------------------------------------------ 校验申请 */

  function doVerify() {
    if (busy) { return; }
    var ta = document.getElementById('verifyInput');
    var text = ta ? ta.value : '';
    if (!text.trim()) {
      setNotice('error', t('请先粘贴申请标识符。', 'Please paste an application code first.'));
      render();
      return;
    }
    busy = true;
    ID.verifyRequest(text).then(function (r) {
      busy = false;
      if (!r.ok) {
        verifyResult = { ok: false, code: r.code, message: (OWL.lang() === 'en' ? (r.messageEn || r.message) : r.message) };
      } else {
        verifyResult = { ok: true, data: r.data };
      }
      render();
    }).catch(function (e) {
      busy = false;
      verifyResult = { ok: false, code: 'ERROR', message: String(e && e.message ? e.message : e) };
      render();
    });
  }

  function paintVerify() {
    if (!verifyResult) { return; }
    var host = document.getElementById('verifyResult');
    if (!host) { return; }

    if (!verifyResult.ok) {
      host.innerHTML = '<p class="qr-notice is-error">'
        + esc(t('校验未通过：', 'Verification failed: ') + verifyResult.message) + '</p>';
      return;
    }

    var d = verifyResult.data;
    host.innerHTML = '<div class="qr-usercard" style="margin-top:1rem">'
      + '<div class="qr-usercard-head">'
      + '<h3 class="qr-name">' + esc(d.nameEn) + '</h3>'
      + '<span class="chip chip-gold">' + t('校验通过', 'Verified') + '</span>'
      + '<span class="chip">' + esc(ID.roleLabel(d.role, OWL.lang())) + '</span>'
      + '</div><dl class="qr-meta">'
      + '<div><dt>' + t('申请日期', 'Applied on') + '</dt><dd>' + esc(d.appliedAt || d.joinedAt) + '</dd></div>'
      + '<div><dt>' + t('校验码', 'Checksum') + '</dt><dd class="qr-mono">' + esc(ID.groupChecksum(d.checksum)) + '</dd></div>'
      + '</dl></div>';
  }

  /** 校验通过后，把名字与身份填进签发表单，省去重复输入 */
  function useVerifiedForIssue() {
    if (!verifyResult || !verifyResult.ok) {
      setNotice('error', t('请先校验一份有效的申请标识符。', 'Verify a valid application code first.'));
      render();
      return;
    }
    var d = verifyResult.data;
    var n = document.getElementById('issueName');
    var r = document.getElementById('issueRole');
    if (n) { n.value = d.nameEn; }
    if (r) { r.value = d.role === 'admin' ? 'admin' : 'member'; }
    OWL.ui.toast(t('已填入签发表单，请确认加入时间', 'Filled into the form — please confirm the join date'));
  }

  /* ------------------------------------------------------------ 修改密码 */

  function doChangePassword() {
    if (busy) { return; }
    var user = ADM.current();
    if (!user) { return; }
    var o = document.getElementById('pwOld');
    var n1 = document.getElementById('pwNew');
    var n2 = document.getElementById('pwNew2');

    if ((n1 ? n1.value : '') !== (n2 ? n2.value : '')) {
      setNotice('error', t('两次输入的新密码不一致。', 'The two new passwords do not match.'));
      render();
      return;
    }

    busy = true;
    ADM.changePassword({
      nameEn: user.nameEn,
      oldPassword: o ? o.value : '',
      newPassword: n1 ? n1.value : ''
    }).then(function (r) {
      busy = false;
      if (!r.ok) {
        setNotice('error', OWL.lang() === 'en' ? (r.messageEn || r.message) : r.message);
        render();
        return;
      }
      setNotice('ok', t('密码已更新。', 'Password updated.'));
      render();
      OWL.ui.toast(t('密码已更新', 'Password updated'));
    }).catch(function (e) {
      busy = false;
      setNotice('error', String(e && e.message ? e.message : e));
      render();
    });
  }

  /* ---------------------------------------------------------------- 启动 */

  function boot() {
    lastIssued = null;

    /* 确保内置管理员（Harmony，2026-06-01）已被写入 */
    ADM.init().then(function () {
      render();
    }).catch(function () {
      render();
    });

    window.addEventListener('owl:lang-changed', function () { render(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window, document);
