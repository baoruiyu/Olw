/* ==========================================================================
   猫头鹰教 The Owl Cult — assets/page-member-identity.js
   member.html 附加逻辑：展示当前用户的身份标识符与二维码

   仅当用户是通过「身份标识符 / 二维码」登录时才有内容可显示；
   通过 Gitee 登录的用户没有本地标识符，此时整块区域隐藏。
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

  var QR_USER_KEY = 'owl-cult-qr-user';

  function host() { return document.getElementById('memberIdentity'); }

  function localUser() {
    var raw = null;
    try { raw = window.localStorage.getItem(QR_USER_KEY); } catch (e) { raw = null; }
    if (!raw) { return null; }
    try {
      var u = JSON.parse(raw);
      return (u && u.nameEn) ? u : null;
    } catch (e) {
      return null;
    }
  }

  function render() {
    var box = host();
    if (!box) { return; }

    var user = localUser();
    if (!user || !user.identifier) {
      box.innerHTML = '';
      box.hidden = true;
      return;
    }
    box.hidden = false;

    var rows = [
      [t('英文名', 'English name'), user.nameEn],
      [t('身份', 'Role'), ID.roleLabel(user.role, OWL.lang())],
      [t('加入时间', 'Joined'), user.joinedAt],
      [t('校验码', 'Checksum'), ID.groupChecksum(user.checksum)]
    ];

    var html = '<h2 class="member-block-title">' + t('我的身份标识符', 'My identity marker') + '</h2>'
      + '<div class="qr-result-inner">'
      /* 完整信息图：二维码 + 英文名 + 身份 + 加入时间 + 校验码 */
      + '<div class="owl-idcard-wrap" id="memberCard"></div>'
      + '<div class="qr-result-side">'
      + '<dl class="qr-meta">';
    for (var i = 0; i < rows.length; i++) {
      html += '<div><dt>' + esc(rows[i][0]) + '</dt><dd>'
        + (i === 3 ? '<span class="qr-mono">' + esc(rows[i][1]) + '</span>' : esc(rows[i][1]))
        + '</dd></div>';
    }
    html += '</dl>'
      + '<p class="qr-note">' + t(
        '让其他设备扫描这个二维码，或用「手动输入」粘贴下面的标识符，即可登录。',
        'Scan this code from another device, or paste the identifier below via “Enter code”.'
      ) + '</p>'
      + '<label class="qr-label" for="memberIdText">' + t('标识符文本', 'Identifier text') + '</label>'
      + '<textarea id="memberIdText" class="qr-input qr-textarea qr-mono" rows="2" readonly>'
      + esc(user.identifier) + '</textarea>'
      + '<div class="qr-actions">'
      + '<button class="btn" type="button" id="memberIdCopy">' + t('复制标识符', 'Copy identifier') + '</button>'
      + '<button class="btn" type="button" id="memberIdDownload">' + t('保存信息图', 'Save info card') + '</button>'
      + '<a class="btn btn-ghost" href="login.html">' + t('返回登录页', 'Back to sign-in') + '</a>'
      + '</div></div></div>';

    box.innerHTML = html;

    /* 画完整信息图 */
    var cardHost = document.getElementById('memberCard');
    if (cardHost && window.OWLIDCARD) {
      try {
        OWLIDCARD.previewInto(cardHost, {
          identifier: user.identifier,
          data: {
            nameEn: user.nameEn,
            role: user.role,
            joinedAt: user.joinedAt,
            checksum: user.checksum,
            kind: 'login'
          },
          kind: 'login',
          width: 340,
          scale: 2
        });
      } catch (e) {
        if (window.console && console.warn) { console.warn('[owl] 信息图生成失败：', e); }
      }
    }

    /* 复制 */
    var copy = document.getElementById('memberIdCopy');
    if (copy) {
      copy.addEventListener('click', function () {
        var text = user.identifier;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            OWL.ui.toast(t('已复制标识符', 'Identifier copied'));
          }).catch(function () { fallbackCopy(); });
        } else {
          fallbackCopy();
        }
        function fallbackCopy() {
          var ta = document.getElementById('memberIdText');
          if (!ta) { return; }
          ta.removeAttribute('readonly');
          ta.select();
          try { document.execCommand('copy'); OWL.ui.toast(t('已复制标识符', 'Identifier copied')); }
          catch (err) { OWL.ui.toast(t('复制失败，请手动选择', 'Copy failed — select manually')); }
          ta.setAttribute('readonly', 'readonly');
        }
      });
    }

    /* 下载 */
    var dl = document.getElementById('memberIdDownload');
    if (dl) {
      dl.addEventListener('click', function () {
        if (!window.OWLIDCARD) { return; }
        var payload = {
          nameEn: user.nameEn, role: user.role,
          joinedAt: user.joinedAt, checksum: user.checksum, kind: 'login'
        };
        var ok = OWLIDCARD.download({
          identifier: user.identifier,
          data: payload,
          kind: 'login',
          width: 420,
          scale: 3
        }, OWLIDCARD.defaultName({ data: payload, kind: 'login' }));
        OWL.ui.toast(ok
          ? t('信息图已保存', 'Info card saved')
          : t('保存失败', 'Save failed'));
      });
    }
  }

  /* 登录态变化 / 语言切换后重绘 */
  function boot() {
    render();
    window.addEventListener('owl:lang-changed', function () { render(); });
    window.addEventListener('owl:identity-changed', function () { render(); });
    if (OWL.auth && OWL.auth.onChange) {
      OWL.auth.onChange(function () { render(); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window, document);
