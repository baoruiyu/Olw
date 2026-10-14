/* ==========================================================================
   猫头鹰教 The Owl Cult — assets/page-qr-login.js
   login.html 专用逻辑：身份登录 + 入会申请

   ┌──────────────────────────────────────────────────────────────────────┐
   │ 登录区（上方卡片，两个 tab）                                          │
   │   ① 扫码登录  —— 扫描管理员签发的「登录标识符」二维码                  │
   │   ② 手动输入  —— 粘贴或手打登录标识符（没有摄像头时使用）              │
   │                                                                      │
   │ 申请区（下方独立卡片）                                                │
   │   访客填写英文名与期望身份 → 本地生成「申请标识符」（OWLR），          │
   │   复制后通过微信或邮箱发给管理员。该标识符「不能用于登录」。           │
   └──────────────────────────────────────────────────────────────────────┘

   重要：本页不提供「生成登录二维码」的功能。
        登录标识符（OWL1）只能由管理员在管理后台签发。

   依赖：assets/config.js、assets/owl-sdk.js、assets/owl-id.js、assets/qr.js
   ========================================================================== */

(function (window, document) {
  'use strict';

  var OWL = window.OWL;
  var ID = window.OWLID;
  var QR = window.OWLQR;
  var IDCARD = window.OWLIDCARD;
  if (!OWL || !ID || !QR || !IDCARD) { return; }

  var t = OWL.t;
  var esc = OWL.esc;

  /* ---------------------------------------------------------------- 状态 */

  var mode = 'scan';              /* scan | manual */
  var currentUser = null;         /* 已登录用户 */
  var scanStream = null;          /* 摄像头视频流 */
  var scanTimer = null;           /* 摄像头轮询定时器 */
  var busy = false;               /* 防止重复提交 */
  var notice = null;              /* 登录区提示 { type, text } */
  var applyNotice = null;         /* 申请区提示 { type, text } */
  var lastApply = null;           /* 最近生成的申请 { text, data } */

  var USER_KEY = 'owl-cult-qr-user';

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) {} }

  function root() { return document.getElementById('qrLoginApp'); }
  function applyRoot() { return document.getElementById('owlApplyApp'); }

  function setNotice(type, text) { notice = text ? { type: type, text: text } : null; }
  function clearNotice() { notice = null; }
  function setApplyNotice(type, text) { applyNotice = text ? { type: type, text: text } : null; }

  /** 本地登录：写入本地存储并广播，供全站导航栏同步 */
  function saveLocalUser(data) {
    var user = {
      nameEn: data.nameEn,
      nickname: data.nameEn,
      role: data.role,
      isAdmin: data.isAdmin,
      joinedAt: data.joinedAt,
      checksum: data.checksum,
      identifier: [data.prefix || ID.PREFIX, data.nameEn, data.role, data.joinedAt, data.checksum].join('|'),
      loginAt: Date.now()
    };
    lsSet(USER_KEY, JSON.stringify(user));
    currentUser = user;
    if (OWL.auth && OWL.auth.state) {
      OWL.auth.state.user = user;
      OWL.auth.state.loading = false;
    }
    notifySite();
    return user;
  }

  function loadLocalUser() {
    var raw = lsGet(USER_KEY);
    if (!raw) { return null; }
    try {
      var u = JSON.parse(raw);
      return (u && u.nameEn) ? u : null;
    } catch (e) {
      return null;
    }
  }

  function signOut() {
    lsDel(USER_KEY);
    currentUser = null;
    if (OWL.auth && OWL.auth.state) { OWL.auth.state.user = null; }
    notifySite();
  }

  function notifySite() {
    try {
      window.dispatchEvent(new CustomEvent('owl:identity-changed', { detail: { user: currentUser } }));
    } catch (e) {
      window.dispatchEvent(new Event('owl:identity-changed'));
    }
  }

  function stopCamera() {
    window.clearInterval(scanTimer);
    scanTimer = null;
    if (scanStream) {
      var tracks = scanStream.getTracks ? scanStream.getTracks() : [];
      for (var i = 0; i < tracks.length; i++) {
        try { tracks[i].stop(); } catch (e) {}
      }
      scanStream = null;
    }
  }

  /* ---------------------------------------------------------------- 模板 */

  function tabsMarkup() {
    function tab(id, label) {
      return '<button class="qr-tab' + (mode === id ? ' is-active' : '')
        + '" type="button" data-mode="' + id + '">' + label + '</button>';
    }
    return '<div class="qr-tabs" role="tablist">'
      + tab('scan', t('扫码登录', 'Scan to sign in'))
      + tab('manual', t('手动输入', 'Enter code'))
      + '</div>';
  }

  function noticeMarkup(n) {
    n = n || notice;
    if (!n) { return ''; }
    return '<p class="qr-notice is-' + n.type + '">' + esc(n.text) + '</p>';
  }

  function userCardMarkup(user) {
    var rows = [
      [t('英文名', 'English name'), user.nameEn],
      [t('身份', 'Role'), ID.roleLabel(user.role, OWL.lang())],
      [t('加入时间', 'Joined'), user.joinedAt],
      [t('校验码', 'Checksum'), ID.groupChecksum(user.checksum)]
    ];
    var body = '';
    for (var i = 0; i < rows.length; i++) {
      body += '<div><dt>' + esc(rows[i][0]) + '</dt><dd>' + esc(rows[i][1]) + '</dd></div>';
    }
    return '<div class="qr-usercard">'
      + '<div class="qr-usercard-head">'
      + '<h3 class="qr-name">' + esc(user.nameEn) + '</h3>'
      + '<span class="chip' + (user.isAdmin ? ' chip-gold' : '') + '">'
      + esc(ID.roleLabel(user.role, OWL.lang())) + '</span>'
      + '</div><dl class="qr-meta">' + body + '</dl></div>';
  }

  /* ------------------------------------------------------- 登录区：模板 */

  function signInMarkup() {
    if (currentUser) {
      var nextLink = currentUser.isAdmin
        ? '<a class="btn btn-primary" href="admin.html">' + t('进入管理后台', 'Admin console') + '</a>'
        : '<a class="btn btn-primary" href="member.html">' + t('进入会员中心', 'Member centre') + '</a>';
      return '<div class="qr-panel">'
        + '<p class="qr-lead">' + t('你已登录。', 'You are signed in.') + '</p>'
        + userCardMarkup(currentUser)
        + '<div class="qr-actions">' + nextLink
        + '<button class="btn btn-ghost" type="button" id="qrSignOut">' + t('退出登录', 'Sign out') + '</button>'
        + '</div></div>';
    }

    var html = '<div class="qr-panel">';

    if (mode === 'scan') {
      html += '<p class="qr-lead">' + t(
        '把管理员发给你的登录二维码对准摄像头，识别成功后即可登录。',
        'Point the sign-in QR code from your administrator at the camera to sign in.'
      ) + '</p>'
        + '<div class="qr-scanbox' + (scanStream ? ' is-live' : ' is-idle') + '">'
        + '<video id="qrVideo" class="qr-video" playsinline muted></video>'
        + '<canvas id="qrCanvas" class="qr-hidden"></canvas>'
        /* 摄像头默认不启动：多数浏览器会拦截自动调用，且会打扰用户。
           这里给出明确的待机提示，由用户点击按钮后再请求权限。 */
        + '<div class="qr-scanhint" id="qrScanHint">'
        + (scanStream
            ? t('正在识别…请把二维码放入画面', 'Scanning… place the QR code in view')
            : '<span class="qr-scanhint-icon" aria-hidden="true">▣</span>'
              + '<span>' + t('摄像头未开启', 'Camera is off') + '</span>'
              + '<small>' + t('出于隐私与浏览器限制，需要你手动点击下方按钮才会开启',
                               'For privacy, and because browsers block it, the camera only starts when you click below') + '</small>')
        + '</div>'
        + '</div>'
        + '<div class="qr-actions">'
        + '<button class="btn btn-primary" type="button" id="qrCameraStart"'
        + (scanStream ? ' disabled' : '') + '>'
        + t('开启摄像头并扫描', 'Start camera and scan') + '</button>'
        + (scanStream
            ? '<button class="btn btn-ghost" type="button" id="qrCameraStop">' + t('关闭摄像头', 'Stop camera') + '</button>'
            : '')
        + '</div>'
        + '<div class="qr-or"><span>' + t('或者', 'or') + '</span></div>'
        + '<div class="qr-actions">'
        + '<label class="btn" for="qrFile">' + t('上传二维码图片', 'Upload a QR image') + '</label>'
        + '<input id="qrFile" class="qr-hidden" type="file" accept="image/*">'
        + '</div>'
        + '<p class="qr-note">' + t(
          '没有摄像头也没关系，可以切到「手动输入」直接粘贴标识符。',
          'No camera? Switch to “Enter code” and paste the identifier instead.'
        ) + '</p>';
    } else {
      html += '<p class="qr-lead">' + t(
        '把登录标识符粘贴或输入到下面（格式：OWL1|英文名|admin 或 member|加入时间|校验码）。',
        'Paste or type your sign-in identifier below (format: OWL1|name|admin or member|joined|checksum).'
      ) + '</p>'
        + '<label class="qr-label" for="qrManual">' + t('登录标识符', 'Sign-in identifier') + '</label>'
        + '<textarea id="qrManual" class="qr-input qr-textarea" rows="3" spellcheck="false"'
        + ' placeholder="OWL1|Your Name|member|2026-01-01|0000000000000000"></textarea>'
        + '<div class="qr-actions">'
        + '<button class="btn btn-primary" type="button" id="qrManualGo">' + t('验证并登录', 'Verify and sign in') + '</button>'
        + '<button class="btn btn-ghost" type="button" id="qrManualClear">' + t('清空', 'Clear') + '</button>'
        + '</div>'
        + '<p class="qr-note">' + t(
          '还没有登录标识符？请在下方生成「申请标识符」，发给管理员办理入会。',
          'No sign-in identifier yet? Generate an application code below and send it to the administrator.'
        ) + '</p>';
    }

    html += noticeMarkup() + '</div>';
    return html;
  }

  /* ------------------------------------------------------- 申请区：模板 */

  function applyMarkup() {
    return '<div class="qr-card card owl-apply-card">'
      + '<div class="qr-head">'
      + '<h2 class="qr-title">' + t('入会申请', 'Membership application') + '</h2>'
      + '<p class="qr-sub">' + t(
        '填写基本信息，本地生成一份「申请标识符」。把它发给管理员，通过后你会收到可以登录的标识符。',
        'Fill in your details to generate an application code locally. Send it to the administrator; once approved you will receive a sign-in identifier.'
      ) + '</p></div>'

      + '<div class="owl-apply-note">' + t(
        '申请标识符（OWLR）不能用于登录，它只是给管理员看的入会申请。',
        'An application code (OWLR) cannot be used to sign in — it is only a request for the administrator.'
      ) + '</div>'

      + '<label class="qr-label" for="applyName">' + t('英文名（必填）', 'English name (required)') + '</label>'
      + '<input id="applyName" class="qr-input" type="text" spellcheck="false" maxlength="64"'
      + ' placeholder="Zhang Wei">'
      + '<p class="qr-help">' + t(
        '只允许英文字母、数字、空格与 . \' - _ ，例如 Zhang Wei。',
        'Letters, digits, spaces and . \' - _ only, e.g. Zhang Wei.'
      ) + '</p>'

      + '<label class="qr-label" for="applyRole">' + t('期望身份', 'Requested role') + '</label>'
      + '<select id="applyRole" class="qr-input">'
      + '<option value="member">' + t('会员（member）', 'Member (member)') + '</option>'
      + '<option value="admin">' + t('管理员（admin）', 'Administrator (admin)') + '</option>'
      + '</select>'
      + '<p class="qr-help">' + t(
        '管理员身份最终由现任管理员审核决定。',
        'Administrator access is ultimately decided by the sitting administrator.'
      ) + '</p>'

      + '<div class="qr-actions">'
      + '<button class="btn btn-primary" type="button" id="applyCreate">' + t('生成申请标识符', 'Generate application code') + '</button>'
      + '</div>'

      + '<div id="applyResult" class="qr-result"></div>'
      + noticeMarkup(applyNotice)

      + '<div class="owl-apply-how">'
      + '<h4 class="owl-apply-how-title">' + t('接下来怎么做', 'What to do next') + '</h4>'
      + '<ol class="owl-apply-steps">'
      + '<li>' + t('复制上面的申请标识符。', 'Copy the application code above.') + '</li>'
      + '<li>' + t('通过微信或邮箱把它发给管理员，并说明你想加入。',
                  'Send it to the administrator by WeChat or email, and say you would like to join.') + '</li>'
      + '<li>' + t('管理员确认后，会把你的「登录标识符」和二维码发给你。',
                  'Once confirmed, the administrator sends you your sign-in identifier and QR code.') + '</li>'
      + '<li>' + t('回到本页，用扫码或手动输入的方式登录。',
                  'Come back to this page and sign in by scanning or entering the code.') + '</li>'
      + '</ol>'
      + '<div class="qr-actions">'
      + '<a class="btn" href="join.html">' + t('查看联系方式', 'See contact details') + '</a>'
      + '</div></div>'
      + '</div>';
  }

  function applyResultMarkup(text, data) {
    return '<div class="qr-result-inner">'
      /* 左侧展示完整信息图（二维码 + 英文名 + 身份 + 日期 + 校验码），
         而不是只有一个裸二维码 —— 保存下来就是一张可读的凭证。 */
      + '<div class="owl-idcard-wrap" id="applyCard"></div>'
      + '<div class="qr-result-side">'
      + '<h4 class="qr-result-title">' + esc(data.nameEn) + '</h4>'
      + '<p class="owl-apply-badge">' + t('申请标识符 · 不可用于登录', 'Application code · not for sign-in') + '</p>'
      + '<dl class="qr-meta">'
      + '<div><dt>' + t('期望身份', 'Requested role') + '</dt><dd>' + esc(ID.roleLabel(data.role, OWL.lang())) + '</dd></div>'
      + '<div><dt>' + t('申请日期', 'Applied on') + '</dt><dd>' + esc(data.appliedAt || data.joinedAt) + '</dd></div>'
      + '<div><dt>' + t('校验码', 'Checksum') + '</dt><dd class="qr-mono">' + esc(ID.groupChecksum(data.checksum)) + '</dd></div>'
      + '</dl>'
      + '<label class="qr-label" for="applyTextOut">' + t('申请标识符', 'Application code') + '</label>'
      + '<textarea id="applyTextOut" class="qr-input qr-textarea qr-mono" rows="3" readonly>' + esc(text) + '</textarea>'
      + '<div class="qr-actions">'
      + '<button class="btn btn-primary" type="button" id="applyCopy">' + t('复制申请标识符', 'Copy application code') + '</button>'
      + '<button class="btn" type="button" id="applyDownload">' + t('保存信息图', 'Save info card') + '</button>'
      + '<a class="btn btn-ghost" href="join.html">' + t('发给管理员', 'Send to administrator') + '</a>'
      + '</div>'
      + '</div></div>';
  }

  /* ---------------------------------------------------------------- 渲染 */

  function render() {
    var box = root();
    if (!box) { return; }
    var keepCamera = (mode === 'scan' && !currentUser && !!scanStream);
    if (!keepCamera) { stopCamera(); }

    var html = '<div class="qr-card card">';
    if (currentUser) {
      html += '<div class="qr-head"><h2 class="qr-title">' + t('身份登录', 'Identity sign-in') + '</h2></div>';
    } else {
      html += '<div class="qr-head"><h2 class="qr-title">' + t('身份登录', 'Identity sign-in') + '</h2>'
        + '<p class="qr-sub">' + t('用管理员签发的标识符登录', 'Sign in with the identifier issued by your administrator') + '</p></div>';
      html += tabsMarkup();
    }
    html += signInMarkup() + '</div>';
    box.innerHTML = html;

    bind();
    /* 摄像头只有在「扫码 tab + 未登录 + 用户已主动开启」时才绑定画面。
       render() 不会自动请求权限，避免浏览器静默拦截。 */
    if (mode === 'scan' && !currentUser && scanStream) { attachStream(); }
  }

  function renderApply() {
    var box = applyRoot();
    if (!box) { return; }
    box.innerHTML = applyMarkup();
    bindApply();
    if (lastApply) { paintApplyResult(); }
  }

  /* ------------------------------------------------------------ 事件绑定 */

  function bind() {
    var tabs = document.querySelectorAll('.qr-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        var m = this.getAttribute('data-mode');
        if (m === mode) { return; }
        /* 离开扫码 tab 时释放摄像头，避免后台一直占用设备 */
        if (m !== 'scan' && scanStream) { stopCamera(); }
        mode = m;
        clearNotice();
        render();
      });
    }

    var out = document.getElementById('qrSignOut');
    if (out) {
      out.addEventListener('click', function () {
        signOut();
        setNotice('ok', t('已退出登录。', 'Signed out.'));
        render();
      });
    }

    var go = document.getElementById('qrManualGo');
    if (go) { go.addEventListener('click', submitManual); }

    var clear = document.getElementById('qrManualClear');
    if (clear) {
      clear.addEventListener('click', function () {
        var ta = document.getElementById('qrManual');
        if (ta) { ta.value = ''; }
        clearNotice();
        render();
      });
    }

    var ta = document.getElementById('qrManual');
    if (ta) {
      ta.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { submitManual(); }
      });
      ta.focus();
    }

    var startBtn = document.getElementById('qrCameraStart');
    if (startBtn) { startBtn.addEventListener('click', startCamera); }

    var stopBtn = document.getElementById('qrCameraStop');
    if (stopBtn) {
      stopBtn.addEventListener('click', function () {
        stopCamera();
        setNotice('ok', t('已关闭摄像头。', 'Camera stopped.'));
        render();
      });
    }

    var file = document.getElementById('qrFile');
    if (file) { file.addEventListener('change', onFile); }
  }

  function bindApply() {
    var btn = document.getElementById('applyCreate');
    if (btn) { btn.addEventListener('click', doApply); }
    var copy = document.getElementById('applyCopy');
    if (copy) { copy.addEventListener('click', doApplyCopy); }
    var dl = document.getElementById('applyDownload');
    if (dl) { dl.addEventListener('click', doApplyDownload); }
  }

  /* ------------------------------------------------------- 提交：手动输入 */

  function submitManual() {
    if (busy) { return; }
    var ta = document.getElementById('qrManual');
    var text = ta ? ta.value : '';
    if (!text || !text.trim()) {
      setNotice('error', t('请先粘贴或输入登录标识符。', 'Please paste or type your sign-in identifier first.'));
      render();
      return;
    }
    busy = true;
    /* 只接受登录标识符（OWL1）。若粘贴的是申请标识符（OWLR），
       verifyLogin 会返回 WRONG_KIND，并提示「请发给管理员」。 */
    ID.verifyLogin(text).then(function (r) {
      busy = false;
      if (!r.ok) {
        setNotice('error', OWL.lang() === 'en' ? (r.messageEn || r.message) : r.message);
        render();
        return;
      }
      saveLocalUser(r.data);
      setNotice('ok', t('验证通过，登录成功：', 'Verified — signed in as ') + r.data.nameEn);
      render();
      OWL.ui.toast(t('登录成功', 'Signed in'));
    }).catch(function (e) {
      busy = false;
      setNotice('error', String(e && e.message ? e.message : e));
      render();
    });
  }

  /* ------------------------------------------------------------ 摄像头扫码 */

  function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setNotice('error', t(
        '当前浏览器不支持摄像头调用（也可能是因为页面不是 https 或 localhost）。请改用「上传二维码图片」或「手动输入」。',
        'This browser cannot use the camera (or the page is not served over https/localhost). Use “Upload a QR image” or “Enter code” instead.'
      ));
      render();
      return;
    }
    setNotice('ok', t('正在请求摄像头权限…请在浏览器弹窗中选择「允许」。',
      'Requesting camera permission… please choose “Allow” in the browser prompt.'));
    render();

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(function (stream) {
        scanStream = stream;
        clearNotice();
        /* render() 内部会调用 attachStream()，因为此时 scanStream 已就绪 */
        render();
        OWL.ui.toast(t('摄像头已开启', 'Camera started'));
      })
      .catch(function (e) {
        stopCamera();
        var name = (e && e.name) ? e.name : 'unknown';
        var why;
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          why = t('你拒绝了摄像头权限，或浏览器/系统不允许本站使用摄像头。',
                  'Camera permission was denied, or the browser/system blocks it for this site.');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          why = t('没有检测到可用的摄像头。', 'No usable camera was found.');
        } else if (name === 'NotReadableError') {
          why = t('摄像头被其它程序占用了。', 'The camera is being used by another application.');
        } else {
          why = t('浏览器未能打开摄像头。', 'The browser could not open the camera.');
        }
        setNotice('error', why + t(' 可以改用「上传二维码图片」或「手动输入」登录。',
          ' You can still sign in with “Upload a QR image” or “Enter code”.'));
        render();
      });
  }

  function attachStream() {
    var video = document.getElementById('qrVideo');
    var canvas = document.getElementById('qrCanvas');
    var hint = document.getElementById('qrScanHint');
    if (!video || !canvas || !scanStream) { return; }

    video.srcObject = scanStream;
    var p = video.play();
    if (p && p.catch) { p.catch(function () {}); }
    if (hint) { hint.hidden = true; }

    window.clearInterval(scanTimer);
    scanTimer = window.setInterval(function () {
      if (!scanStream || busy) { return; }
      var w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) { return; }

      var maxSide = 480;
      var scale = Math.min(1, maxSide / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * scale));
      var ch = Math.max(1, Math.round(h * scale));
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      var ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, cw, ch);

      var text = null;
      try { text = QR.decodeCanvas(canvas); } catch (e) { text = null; }
      if (text) { handleScanned(text); }
    }, 350);
  }

  /** 摄像头/图片识别到内容后的处理 */
  function handleScanned(text) {
    if (busy) { return; }
    busy = true;
    window.clearInterval(scanTimer);
    scanTimer = null;

    ID.verifyLogin(text).then(function (r) {
      busy = false;
      if (!r.ok) {
        setNotice('error', t('识别到二维码，但无法用于登录：', 'A QR code was found, but it cannot be used to sign in: ')
          + (OWL.lang() === 'en' ? (r.messageEn || r.message) : r.message));
        render();
        return;
      }
      saveLocalUser(r.data);
      stopCamera();
      setNotice('ok', t('扫码成功，登录为：', 'Scanned — signed in as ') + r.data.nameEn);
      render();
      OWL.ui.toast(t('扫码登录成功', 'Signed in by QR'));
    });
  }

  function onFile(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) { return; }
    setNotice('ok', t('正在识别图片…', 'Reading the image…'));
    render();

    QR.decodeFile(file).then(function (text) {
      if (!text) {
        setNotice('error', t(
          '没能从这张图片里识别出二维码。请换一张更清晰、更正的图片，或改用「手动输入」。',
          'No QR code could be read from that image. Try a clearer, less rotated image, or use “Enter code”.'
        ));
        render();
        return;
      }
      handleScanned(text);
    }).catch(function (err) {
      setNotice('error', t('图片读取失败：', 'Could not read the image: ')
        + String(err && err.message ? err.message : err));
      render();
    });
  }

  /* ------------------------------------------------------- 申请标识符生成 */

  function doApply() {
    if (busy) { return; }
    var nameEl = document.getElementById('applyName');
    var roleEl = document.getElementById('applyRole');

    var nameEn = nameEl ? nameEl.value : '';
    var isAdmin = roleEl ? roleEl.value === 'admin' : false;

    if (!nameEn.trim()) {
      setApplyNotice('error', t('请填写英文名。', 'Please enter your English name.'));
      renderApply();
      return;
    }

    busy = true;
    ID.buildRequest({ nameEn: nameEn, isAdmin: isAdmin }).then(function (text) {
      return ID.verifyRequest(text).then(function (v) {
        busy = false;
        if (!v.ok) {
          setApplyNotice('error', OWL.lang() === 'en' ? (v.messageEn || v.message) : v.message);
          renderApply();
          return;
        }
        setApplyNotice('ok', t(
          '已生成申请标识符。复制后发给管理员即可。',
          'Application code generated. Copy it and send it to the administrator.'
        ));
        lastApply = { text: text, data: v.data };
        renderApply();
        OWL.ui.toast(t('申请标识符已生成', 'Application code generated'));
      });
    }).catch(function (e) {
      busy = false;
      setApplyNotice('error', (e && e.message) ? e.message : String(e));
      renderApply();
    });
  }

  /** 把申请结果画出来（此时表单已由 renderApply 重建，需要回填用户输入） */
  function paintApplyResult() {
    if (!lastApply) { return; }

    var nameEl = document.getElementById('applyName');
    var roleEl = document.getElementById('applyRole');
    if (nameEl && lastApply.data) { nameEl.value = lastApply.data.nameEn; }
    if (roleEl && lastApply.data) { roleEl.value = lastApply.data.role; }

    var host = document.getElementById('applyResult');
    if (!host) { return; }
    host.innerHTML = applyResultMarkup(lastApply.text, lastApply.data);

    var cardHost = document.getElementById('applyCard');
    if (cardHost && window.OWLIDCARD) {
      try {
        OWLIDCARD.previewInto(cardHost, {
          identifier: lastApply.text,
          data: lastApply.data,
          kind: 'request',
          width: 340,
          scale: 2
        });
      } catch (e) {
        if (window.console && console.warn) { console.warn('[owl] 申请信息图生成失败：', e); }
      }
    }
    bindApply();
  }

  function doApplyCopy() {
    if (!lastApply) { return; }
    var text = lastApply.text;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        OWL.ui.toast(t('已复制申请标识符', 'Application code copied'));
      }).catch(function () { fallbackApplyCopy(); });
    } else {
      fallbackApplyCopy();
    }
  }

  function fallbackApplyCopy() {
    var ta = document.getElementById('applyTextOut');
    if (!ta) { return; }
    ta.removeAttribute('readonly');
    ta.select();
    try {
      document.execCommand('copy');
      OWL.ui.toast(t('已复制申请标识符', 'Application code copied'));
    } catch (e) {
      OWL.ui.toast(t('复制失败，请手动选择文本', 'Copy failed — please select manually'));
    }
    ta.setAttribute('readonly', 'readonly');
  }

  function doApplyDownload() {
    if (!lastApply || !window.OWLIDCARD) { return; }
    var ok = OWLIDCARD.download({
      identifier: lastApply.text,
      data: lastApply.data,
      kind: 'request',
      width: 420,
      scale: 3          /* 导出用更高倍率，转发或打印都清晰 */
    }, OWLIDCARD.defaultName({ data: lastApply.data, kind: 'request' }));
    OWL.ui.toast(ok
      ? t('信息图已保存', 'Info card saved')
      : t('保存失败', 'Save failed'));
  }

  /* ---------------------------------------------------------------- 启动 */

  function boot() {
    currentUser = loadLocalUser();
    if (!currentUser && OWL.auth && OWL.auth.user && OWL.auth.user()) {
      var u = OWL.auth.user();
      currentUser = {
        nameEn: u.nickname || u.giteeLogin || u.name || 'Member',
        role: u.role === 'admin' ? 'admin' : 'member',
        isAdmin: u.role === 'admin',
        joinedAt: OWL.fmtDate(u.createdAt) || '',
        checksum: ''
      };
    }

    window.addEventListener('owl:lang-changed', function () {
      render();
      renderApply();
    });

    render();
    renderApply();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window, document);
