/* ==========================================================================
   猫头鹰教 The Owl Cult — owl-idcard.js
   把「标识符 + 二维码」渲染成一张完整的信息图（可下载为 PNG）

   对外暴露 window.OWLIDCARD：
     OWLIDCARD.render(ctx, opts)   → 直接在给定 2D 上下文上绘制
     OWLIDCARD.toCanvas(opts)      → 返回绘制好的 <canvas>
     OWLIDCARD.download(opts, name)→ 触发下载 PNG
     OWLIDCARD.previewInto(el, opts) → 把信息图放进页面里的容器（替代裸二维码）

   opts：
     identifier  {string}  完整标识符文本（必需）
     data        {object}  解析后的字段 { nameEn, role, joinedAt, checksum, kind }
     kind        {string}  'login' | 'request'（决定标题与配色）
     scale       {number}  像素倍率，默认 2（高分屏清晰）
     width       {number}  卡片宽度（CSS 像素），默认 420

   说明：绘制全部用 Canvas 2D 完成，不依赖任何外部库，也不需要联网。
   ========================================================================== */

(function (window) {
  'use strict';

  var ID = window.OWLID;
  var QR = window.OWLQR;
  if (!ID || !QR) { return; }

  /* ---------------------------------------------------------------- 配色 */

  var THEME = {
    login: {
      accent: '#d9b45b',
      accentSoft: 'rgba(217,180,91,.14)',
      tagBg: 'rgba(217,180,91,.18)',
      tagBorder: 'rgba(217,180,91,.55)',
      tagText: '#f6dfa4',
      titleZh: '登录标识符',
      titleEn: 'SIGN-IN IDENTIFIER',
      footZh: '用「扫码登录」或「手动输入」使用',
      footEn: 'Use with “Scan to sign in” or “Enter code”'
    },
    request: {
      accent: '#7ea6ff',
      accentSoft: 'rgba(126,166,255,.14)',
      tagBg: 'rgba(126,166,255,.16)',
      tagBorder: 'rgba(126,166,255,.5)',
      tagText: '#a8c0ff',
      titleZh: '申请标识符',
      titleEn: 'APPLICATION CODE',
      footZh: '此码不能登录，请发给管理员申请入会',
      footEn: 'Not for sign-in — send it to the administrator to join'
    }
  };

  var BG = '#0b0f1c';
  var PANEL = 'rgba(255,255,255,.045)';
  var TEXT = '#e9edf7';
  var TEXT_SOFT = '#a9b2c9';
  var BORDER = 'rgba(255,255,255,.12)';

  function lang() { return (window.OWL && window.OWL.lang) ? window.OWL.lang() : 'zh'; }
  function isEn() { return lang() === 'en'; }
  function pick(zh, en) { return isEn() ? en : zh; }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* 中英文字体栈（与站点一致，保证中文不出现方框） */
  function font(size, weight) {
    return (weight ? weight + ' ' : '') + size + 'px '
      + '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", '
      + '"Microsoft YaHei", "Segoe UI", sans-serif';
  }
  function fontMono(size, weight) {
    return (weight ? weight + ' ' : '') + size + 'px '
      + 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  }

  /** 把长文本按宽度折行 */
  function wrapText(ctx, text, maxWidth) {
    var out = [];
    var chars = String(text == null ? '' : text).split('');
    var line = '';
    for (var i = 0; i < chars.length; i++) {
      var test = line + chars[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = chars[i];
      } else {
        line = test;
      }
    }
    if (line) { out.push(line); }
    return out;
  }

  /* ---------------------------------------------------------------- 绘制 */

  /**
   * 把信息图绘制到 ctx。
   * 返回 { width, height }（CSS 像素）。
   */
  function render(ctx, opts) {
    opts = opts || {};
    var data = opts.data || {};
    var kind = (opts.kind === 'request' || data.kind === 'request') ? 'request' : 'login';
    var th = THEME[kind];

    var W = opts.width || 420;
    var pad = 26;
    var scale = opts.scale || 2;

    var name = data.nameEn || '';
    var roleText = ID.roleLabel(data.role || (data.isAdmin ? 'admin' : 'member'), lang());
    var dateLabel = kind === 'request' ? pick('申请日期', 'Applied on') : pick('加入时间', 'Joined');
    var dateText = (kind === 'request' ? (data.appliedAt || data.joinedAt) : data.joinedAt) || '';
    var sumText = ID.groupChecksum(data.checksum || '');

    /* ---- 先量算高度，避免画到一半发现装不下 ---- */
    var qrSize = Math.round(W - pad * 2);          /* 二维码铺满内容宽度 */
    var headH = 96;                                 /* 标题区 */
    var qrBlockH = qrSize + 44;                     /* 二维码 + 白边 */
    var metaH = 3 * 30 + 12;                        /* 三行字段 */
    var idH = 62;                                   /* 标识符文本区 */
    var footH = 52;

    var H = headH + qrBlockH + metaH + idH + footH + pad;

    ctx.save();
    ctx.scale(scale, scale);

    /* 背景 */
    ctx.fillStyle = BG;
    roundRect(ctx, 0, 0, W, H, 18);
    ctx.fill();

    /* 顶部金色描边 */
    var grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, th.accent);
    grad.addColorStop(0.5, kind === 'login' ? '#f6dfa4' : '#a8c0ff');
    grad.addColorStop(1, 'rgba(217,180,91,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 3);

    /* 外框 */
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 18);
    ctx.stroke();

    var y = pad + 8;

    /* ---------- 标题区 ---------- */
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    /* 品牌行 */
    ctx.fillStyle = TEXT_SOFT;
    ctx.font = font(11);
    ctx.fillText('猫头鹰教 · THE OWL CULT', pad, y + 10);

    /* 主标题（中英各一行） */
    y += 34;
    ctx.fillStyle = th.accent;
    ctx.font = font(21, '600');
    ctx.fillText(isEn() ? th.titleEn : th.titleZh, pad, y);

    /* 类型标签（右上角） */
    var tag = kind === 'login' ? 'OWL1' : 'OWLR';
    ctx.font = fontMono(12, '600');
    var tagW = ctx.measureText(tag).width + 18;
    var tagH = 22;
    var tagX = W - pad - tagW;
    var tagY = y - 16;
    ctx.fillStyle = th.tagBg;
    roundRect(ctx, tagX, tagY, tagW, tagH, 6);
    ctx.fill();
    ctx.strokeStyle = th.tagBorder;
    ctx.lineWidth = 1;
    roundRect(ctx, tagX + 0.5, tagY + 0.5, tagW - 1, tagH - 1, 6);
    ctx.stroke();
    ctx.fillStyle = th.tagText;
    ctx.textAlign = 'center';
    ctx.fillText(tag, tagX + tagW / 2, tagY + 15);
    ctx.textAlign = 'left';

    /* 英文副标题 */
    y += 18;
    ctx.fillStyle = TEXT_SOFT;
    ctx.font = font(11);
    ctx.fillText(kind === 'login'
      ? pick('由管理员签发', 'Issued by the administrator')
      : pick('用于申请入会，不可登录', 'For joining only — cannot sign in'), pad, y);

    /* ---------- 二维码 ---------- */
    var qrY = y + 20;
    var qx = pad;
    /* 白色底衬 */
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, qx, qrY, qrSize, qrSize, 12);
    ctx.fill();

    var qr = QR.encode(opts.identifier || '', { level: 'M' });
    var quiet = 2;
    var totalModules = qr.size + quiet * 2;
    var cell = Math.floor((qrSize - 20) / totalModules);
    if (cell < 1) { cell = 1; }
    var drawn = cell * totalModules;
    var offX = qx + (qrSize - drawn) / 2;
    var offY = qrY + (qrSize - drawn) / 2;

    ctx.fillStyle = '#000000';
    for (var r = 0; r < qr.size; r++) {
      for (var c = 0; c < qr.size; c++) {
        if (qr.modules[r][c]) {
          ctx.fillRect(
            Math.round(offX + (c + quiet) * cell),
            Math.round(offY + (r + quiet) * cell),
            cell, cell
          );
        }
      }
    }

    /* ---------- 字段 ---------- */
    var fy = qrY + qrSize + 26;
    var rows = [
      [pick('英文名', 'English name'), name],
      [pick('身份', 'Role'), roleText],
      [dateLabel, dateText]
    ];
    ctx.font = font(12);
    for (var i = 0; i < rows.length; i++) {
      var ry = fy + i * 30;
      ctx.fillStyle = TEXT_SOFT;
      ctx.font = font(11.5);
      ctx.textAlign = 'left';
      ctx.fillText(rows[i][0], pad, ry);
      /* 值右对齐 */
      ctx.fillStyle = TEXT;
      ctx.font = font(13, '600');
      ctx.textAlign = 'right';
      ctx.fillText(String(rows[i][1] || '—'), W - pad, ry);
      ctx.textAlign = 'left';
      /* 分隔线 */
      ctx.strokeStyle = 'rgba(255,255,255,.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, ry + 10.5);
      ctx.lineTo(W - pad, ry + 10.5);
      ctx.stroke();
    }

    /* ---------- 校验码 ---------- */
    var cy = fy + rows.length * 30 + 4;
    ctx.fillStyle = TEXT_SOFT;
    ctx.font = font(11.5);
    ctx.fillText(pick('校验码 HMAC-SHA-256', 'Checksum · HMAC-SHA-256'), pad, cy);

    ctx.fillStyle = th.accentSoft;
    roundRect(ctx, pad, cy + 8, W - pad * 2, 30, 8);
    ctx.fill();
    ctx.strokeStyle = th.tagBorder;
    ctx.lineWidth = 1;
    roundRect(ctx, pad + 0.5, cy + 8.5, W - pad * 2 - 1, 29, 8);
    ctx.stroke();

    ctx.fillStyle = th.tagText;
    ctx.font = fontMono(14, '600');
    ctx.textAlign = 'center';
    ctx.fillText(sumText, W / 2, cy + 28);
    ctx.textAlign = 'left';

    /* ---------- 底部说明 ---------- */
    var by = H - pad + 2;
    ctx.strokeStyle = BORDER;
    ctx.beginPath();
    ctx.moveTo(pad, by - 26);
    ctx.lineTo(W - pad, by - 26);
    ctx.stroke();

    ctx.fillStyle = TEXT_SOFT;
    ctx.font = font(10.5);
    var footLine = isEn() ? th.footEn : th.footZh;
    ctx.fillText(footLine, pad, by - 8);

    ctx.restore();
    return { width: W, height: H };
  }

  /** 生成一个绘制好的 canvas */
  function toCanvas(opts) {
    opts = opts || {};
    opts.scale = opts.scale || 2;
    var W = opts.width || 420;

    /* 先按预估高度建画布；render() 返回真实高度，若对不上就重画一次，
       保证导出的 PNG 不会被裁切，也不会留下大片空白。 */
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    var est = estimateHeight(W, opts);
    canvas.width = Math.round(W * opts.scale);
    canvas.height = Math.round(est * opts.scale);
    var size = render(ctx, opts);

    if (Math.abs(size.height - est) > 0.5) {
      canvas.width = Math.round(size.width * opts.scale);
      canvas.height = Math.round(size.height * opts.scale);
      ctx = canvas.getContext('2d');
      render(ctx, opts);
    }
    return canvas;
  }

  /** 与 render() 中的高度公式保持一致 */
  function estimateHeight(W, opts) {
    var pad = 26;
    var qrSize = Math.round(W - pad * 2);
    var headH = 96;
    var qrBlockH = qrSize + 44;
    var metaH = 3 * 30 + 12;
    var idH = 62;
    var footH = 52;
    return headH + qrBlockH + metaH + idH + footH + pad;
  }

  /** 触发下载 PNG */
  function download(opts, filename) {
    try {
      var canvas = toCanvas(opts);
      var url = canvas.toDataURL('image/png');
      var a = document.createElement('a');
      a.href = url;
      a.download = filename || defaultName(opts);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    } catch (e) {
      if (window.console && console.warn) { console.warn('[owl-idcard] 生成信息图失败：', e); }
      return false;
    }
  }

  function defaultName(opts) {
    var d = (opts && opts.data) || {};
    var safe = String(d.nameEn || 'owl').replace(/[^A-Za-z0-9_-]+/g, '_');
    var kind = (opts && opts.kind === 'request') ? 'apply' : 'id';
    return 'owl-' + kind + '-' + safe + '.png';
  }

  /**
   * 把信息图渲染进页面容器（替代只显示一个裸二维码）。
   * 容器会被清空并放入一个自适应宽度的 canvas。
   */
  function previewInto(el, opts) {
    if (!el) { return null; }
    opts = opts || {};
    var hostW = el.clientWidth || 0;
    /* 以容器宽度为准，窄屏自动收窄 */
    var width = opts.width || (hostW > 60 ? Math.min(420, hostW) : 420);
    var canvas = toCanvas({
      identifier: opts.identifier,
      data: opts.data,
      kind: opts.kind,
      width: width,
      scale: opts.scale || 2
    });
    canvas.className = 'owl-idcard-canvas';
    canvas.style.width = '100%';
    canvas.style.maxWidth = width + 'px';
    canvas.style.height = 'auto';
    el.innerHTML = '';
    el.appendChild(canvas);
    return canvas;
  }

  window.OWLIDCARD = {
    render: render,
    toCanvas: toCanvas,
    download: download,
    previewInto: previewInto,
    defaultName: defaultName
  };

})(window);
