/* ==========================================================================
   猫头鹰教 The Owl Cult — script.js
   中英双语 · 滚动显现 · 灯箱 · Canvas 粒子 · 进度条 · 回到顶部 · 汉堡菜单
   纯前端，无任何外部依赖
   ========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'owl-cult-lang';
  var DEFAULT_LANG = 'zh';

  /* ---------- 夜之箴言数据（中英双语） ---------- */
  var PROVERBS = [
    { zh: '黑夜不是遮蔽，而是让我们看见更多的幕布。', en: 'The night is not a veil, but a curtain that reveals more.' },
    { zh: '清醒的人，都是夜里睁着眼睛的猫头鹰。', en: 'The lucid are owls that keep their eyes open in the dark.' },
    { zh: '视而不见者众，见而不语者贵。', en: 'Many look and do not see; few see and stay silent.' },
    { zh: '咕咪，是夜里最轻也最亮的一声。', en: 'Gu Mi — the softest, brightest sound in the night.' },
    { zh: '沉默是我们的语言，凝视是我们的誓词。', en: 'Silence is our tongue, and gazing is our oath.' },
    { zh: '真正的夜行者，从不惧怕自己的影子。', en: 'A true night walker never fears his own shadow.' },
    { zh: '我们不做灯，我们只做眼睛。', en: 'We are not the lamp; we are the eye.' },
    { zh: '记住月亮的缺口，也记住翅膀的方向。', en: 'Remember the moon\u2019s crescent, and remember the direction of your wings.' }
  ];

  /* ---------- 画廊数据（owl2 ~ owl9 + 本月猫头鹰 owl1） ---------- */
  var GALLERY = [
    { file: 'owl2.jpg', zh: '静夜之眼', en: 'Eye of the Still Night' },
    { file: 'owl3.jpg', zh: '振翅掠过松林', en: 'Wings Over the Pines' },
    { file: 'owl4.jpg', zh: '古藏书房的守护者', en: 'Guardian of the Old Library' },
    { file: 'owl5.jpg', zh: '雾中轮廓', en: 'Silhouette in the Mist' },
    { file: 'owl6.jpg', zh: '月下独栖', en: 'Perched Beneath the Moon' },
    { file: 'owl7.jpg', zh: '晨昏之间的守望', en: 'Watch Between Dusk and Dawn' },
    { file: 'owl8.jpg', zh: '羽间微光', en: 'Faint Light Along the Feathers' },
    { file: 'owl9.jpg', zh: '归巢', en: 'Return to the Nest' }
  ];
  var FEATURED = { file: 'owl1.jpg', zh: '本月猫头鹰', en: 'Owl of the Month' };

  var currentLang = DEFAULT_LANG;
  var proverbIndex = 0;

  /* ==================== 一、双语渲染 ==================== */
  function readLang() {
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'zh' || saved === 'en') { return saved; }
    } catch (e) { /* 隐私模式等场景降级 */ }
    return DEFAULT_LANG;
  }

  function writeLang(lang) {
    try { window.localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* ignore */ }
  }

  function applyLanguage(lang) {
    currentLang = (lang === 'en') ? 'en' : 'zh';
    var isZh = currentLang === 'zh';

    document.documentElement.setAttribute('lang', isZh ? 'zh-CN' : 'en');

    // 正文文本
    var nodes = document.querySelectorAll('[data-zh]');
    for (var i = 0; i < nodes.length; i++) {
      var val = isZh ? nodes[i].getAttribute('data-zh') : nodes[i].getAttribute('data-en');
      if (val !== null) { nodes[i].textContent = val; }
    }

    // 属性类文本（aria-label / title / alt 等）
    applyAttr('data-aria-zh', 'data-aria-en', 'aria-label', isZh);
    applyAttr('data-title-zh', 'data-title-en', 'title', isZh);
    applyAttr('data-alt-zh', 'data-alt-en', 'alt', isZh);

    // 文档标题
    var body = document.body;
    if (body) {
      var t = body.getAttribute(isZh ? 'data-title-zh' : 'data-title-en');
      if (t) { document.title = t; }
    }

    // 语言按钮标签：显示可切换到的语言
    var btns = document.querySelectorAll('[data-lang-label]');
    for (var b = 0; b < btns.length; b++) {
      btns[b].textContent = isZh ? '\u4e2d / EN' : 'EN / \u4e2d';
    }

    // 页脚箴言与语言联动
    renderProverb();

    // 画廊图注（表格类元素）
    renderCaptions();
  }

  function applyAttr(srcZh, srcEn, target, isZh) {
    var nodes = document.querySelectorAll('[' + srcZh + ']');
    for (var i = 0; i < nodes.length; i++) {
      var v = isZh ? nodes[i].getAttribute(srcZh) : nodes[i].getAttribute(srcEn);
      if (v !== null && nodes[i].tagName !== 'BODY') { nodes[i].setAttribute(target, v); }
    }
  }

  function renderCaptions() {
    var caps = document.querySelectorAll('.caption[data-zh]');
    for (var i = 0; i < caps.length; i++) {
      var v = currentLang === 'zh' ? caps[i].getAttribute('data-zh') : caps[i].getAttribute('data-en');
      if (v !== null) { caps[i].textContent = v; }
    }
  }

  function toggleLanguage() {
    var next = currentLang === 'zh' ? 'en' : 'zh';
    writeLang(next);
    applyLanguage(next);
  }
  window.toggleLanguage = toggleLanguage;

  /* ==================== 二、夜之箴言 ==================== */
  function renderProverb() {
    var el = document.getElementById('proverbText');
    if (!el) { return; }
    var item = PROVERBS[proverbIndex % PROVERBS.length];
    el.textContent = currentLang === 'zh' ? item.zh : item.en;
  }

  function nextProverb() {
    if (PROVERBS.length === 0) { return; }
    var next = proverbIndex;
    if (PROVERBS.length > 1) {
      var guard = 0;
      while (next === proverbIndex && guard < 12) {
        next = Math.floor(Math.random() * PROVERBS.length);
        guard++;
      }
    }
    proverbIndex = next;
    var el = document.getElementById('proverbText');
    renderProverb();
    if (el) {
      el.classList.remove('swap');
      void el.offsetWidth;
      el.classList.add('swap');
    }
  }
  window.nextProverb = nextProverb;

  /* ==================== 三、画廊渲染与图注 ==================== */
  function escapeHtml(str) {
    return String(str).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function renderGalleryGrid() {
    var grid = document.getElementById('galleryGrid');
    if (!grid) { return; }

    var html = '';
    for (var i = 0; i < GALLERY.length; i++) {
      var it = GALLERY[i];
      var no = String(i + 2);
      if (no.length < 2) { no = '0' + no; }
      html += '<figure class="gallery-item reveal" data-lightbox'
        + ' data-caption-zh="' + escapeHtml(it.zh) + '" data-caption-en="' + escapeHtml(it.en) + '"'
        + ' data-index="' + i + '">'
        + '<img src="images/' + it.file + '" alt="' + escapeHtml(it.zh) + '"'
        + ' data-alt-zh="' + escapeHtml(it.zh) + '" data-alt-en="' + escapeHtml(it.en) + '"'
        + ' loading="lazy" decoding="async" width="800" height="600">'
        + '<figcaption>'
        + '<span class="cap-title caption" data-zh="' + escapeHtml(it.zh) + '" data-en="' + escapeHtml(it.en) + '">' + escapeHtml(it.zh) + '</span>'
        + '<span class="cap-no caption" data-zh="OWL &middot; ' + no + '" data-en="OWL &middot; ' + no + '">OWL &middot; ' + no + '</span>'
        + '</figcaption>'
        + '</figure>';
    }
    grid.innerHTML = html;
  }

  /* ==================== 四、灯箱 ==================== */
  var lbState = { items: [], index: 0, box: null, img: null, cap: null, count: null, lastFocus: null };

  function buildLightbox() {
    var box = document.createElement('div');
    box.className = 'lightbox';
    box.id = 'lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML =
      '<button class="lb-btn lb-close" type="button" data-lb="close" aria-label="\u5173\u95ed">\u2715</button>' +
      '<button class="lb-btn lb-prev" type="button" data-lb="prev" aria-label="\u4e0a\u4e00\u5f20">\u2039</button>' +
      '<button class="lb-btn lb-next" type="button" data-lb="next" aria-label="\u4e0b\u4e00\u5f20">\u203a</button>' +
      '<figure class="lightbox-figure">' +
      '<img alt="">' +
      '<figcaption><span class="lb-cap"></span><span class="lightbox-count"></span></figcaption>' +
      '</figure>';
    document.body.appendChild(box);

    lbState.box = box;
    lbState.img = box.querySelector('img');
    lbState.cap = box.querySelector('.lb-cap');
    lbState.count = box.querySelector('.lightbox-count');

    box.addEventListener('click', function (ev) {
      var action = ev.target.getAttribute && ev.target.getAttribute('data-lb');
      if (action === 'close') { closeLightbox(); return; }
      if (action === 'prev') { stepLightbox(-1); return; }
      if (action === 'next') { stepLightbox(1); return; }
      if (ev.target === box) { closeLightbox(); }
    });
  }

  function collectItems() {
    var list = [];
    var nodes = document.querySelectorAll('[data-lightbox]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var img = node.querySelector('img');
      if (!img) { continue; }
      list.push({
        node: node,
        src: img.getAttribute('data-full') || img.getAttribute('src'),
        zh: node.getAttribute('data-caption-zh') || img.getAttribute('data-alt-zh') || '',
        en: node.getAttribute('data-caption-en') || img.getAttribute('data-alt-en') || ''
      });
    }
    return list;
  }

  function updateLightbox() {
    var item = lbState.items[lbState.index];
    if (!item) { return; }
    lbState.img.setAttribute('src', item.src);
    var cap = currentLang === 'zh' ? item.zh : item.en;
    lbState.img.setAttribute('alt', cap || '');
    lbState.cap.textContent = cap || '';
    lbState.count.textContent = (lbState.index + 1) + ' / ' + lbState.items.length;
  }

  function openLightbox(index) {
    if (!lbState.box) { return; }
    lbState.items = collectItems();
    if (lbState.items.length === 0) { return; }
    lbState.index = (index >= 0 && index < lbState.items.length) ? index : 0;
    updateLightbox();
    lbState.lastFocus = document.activeElement;
    lbState.box.classList.add('open');
    lbState.box.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lb-open');
    var closeBtn = lbState.box.querySelector('.lb-close');
    if (closeBtn) { closeBtn.focus(); }
  }

  function closeLightbox() {
    if (!lbState.box) { return; }
    lbState.box.classList.remove('open');
    lbState.box.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lb-open');
    if (lbState.lastFocus && lbState.lastFocus.focus) {
      try { lbState.lastFocus.focus(); } catch (e) { /* ignore */ }
    }
  }

  function stepLightbox(delta) {
    if (lbState.items.length === 0) { return; }
    lbState.index = (lbState.index + delta + lbState.items.length) % lbState.items.length;
    updateLightbox();
  }

  function bindLightboxTriggers() {
    document.addEventListener('click', function (ev) {
      var target = ev.target;
      var trigger = null;
      while (target && target !== document.body) {
        if (target.getAttribute && target.getAttribute('data-lightbox') !== null) {
          trigger = target;
          break;
        }
        target = target.parentNode;
      }
      if (!trigger) { return; }

      var items = collectItems();
      var idx = 0;
      for (var i = 0; i < items.length; i++) {
        if (items[i].node === trigger) { idx = i; break; }
      }
      if (ev.preventDefault) { ev.preventDefault(); }
      openLightbox(idx);
    });

    document.addEventListener('keydown', function (ev) {
      var key = ev.key || ev.keyCode;
      var isOpen = lbState.box && lbState.box.classList.contains('open');

      if (key === 'Escape' || key === 27) {
        if (isOpen) { closeLightbox(); }
        return;
      }
      if (!isOpen) { return; }
      if (key === 'ArrowLeft' || key === 37) { stepLightbox(-1); }
      if (key === 'ArrowRight' || key === 39) { stepLightbox(1); }
    });
  }

  /* ==================== 五、滚动显现 ==================== */
  function initReveal() {
    var items = document.querySelectorAll('.reveal');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce || !('IntersectionObserver' in window)) {
      for (var i = 0; i < items.length; i++) { items[i].classList.add('in'); }
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (entry.isIntersecting) {
          var el = entry.target;
          var delay = parseInt(el.getAttribute('data-delay') || '0', 10) || 0;
          setTimeout((function (node) {
            return function () { node.classList.add('in'); };
          })(el), delay);
          io.unobserve(el);
        }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    for (var j = 0; j < items.length; j++) { io.observe(items[j]); }
  }

  /* ==================== 六、滚动进度条 / 回到顶部 / 导航态 ==================== */
  function initScrollUI() {
    var bar = document.querySelector('.scroll-progress');
    var toTop = document.querySelector('.to-top');
    var nav = document.querySelector('.nav');
    var ticking = false;

    function update() {
      var doc = document.documentElement;
      var scrollTop = window.pageYOffset || doc.scrollTop || 0;
      var max = (doc.scrollHeight - window.innerHeight);

      if (bar) {
        var ratio = max > 0 ? Math.min(scrollTop / max, 1) : 0;
        bar.style.transform = 'scaleX(' + ratio + ')';
      }
      if (toTop) {
        if (scrollTop > 400) { toTop.classList.add('show'); }
        else { toTop.classList.remove('show'); }
      }
      if (nav) {
        if (scrollTop > 20) { nav.classList.add('nav-scrolled'); }
        else { nav.classList.remove('nav-scrolled'); }
      }
      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();

    if (toTop) {
      toTop.addEventListener('click', function () {
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        try {
          window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
        } catch (e) {
          window.scrollTo(0, 0);
        }
      });
    }
  }

  /* ==================== 七、汉堡菜单 ==================== */
  function initNav() {
    var toggle = document.querySelector('.nav-toggle');
    var menu = document.querySelector('.nav-menu');
    if (!toggle || !menu) { return; }

    toggle.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    var links = menu.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', function () {
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    }

    document.addEventListener('click', function (ev) {
      if (!menu.classList.contains('open')) { return; }
      if (menu.contains(ev.target) || toggle.contains(ev.target)) { return; }
      menu.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  }

  /* ==================== 八、Hero Canvas 星空 / 萤火粒子 ==================== */
  function initHeroCanvas() {
    var canvas = document.getElementById('starCanvas');
    if (!canvas || !canvas.getContext) { return; }

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var ctx = canvas.getContext('2d');
    var dpr = 1;
    var width = 0;
    var height = 0;
    var particles = [];
    var rafId = null;
    var running = false;

    function build() {
      var rect = canvas.getBoundingClientRect();
      width = Math.max(rect.width, 1);
      height = Math.max(rect.height, 1);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 数量克制：按视口面积估算，最多 80 个
      var count = Math.round(Math.min(80, Math.max(28, (width * height) / 16000)));
      particles = [];
      for (var i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: Math.random() * 1.5 + 0.5,
          vx: (Math.random() - 0.5) * 0.18,
          vy: (Math.random() - 0.5) * 0.18,
          a: Math.random() * 0.55 + 0.25,
          ph: Math.random() * Math.PI * 2,
          sp: Math.random() * 0.014 + 0.005
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.ph += p.sp;
        var alpha = p.a * (0.55 + 0.45 * Math.sin(p.ph));

        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -8) { p.x = width + 8; }
        if (p.x > width + 8) { p.x = -8; }
        if (p.y < -8) { p.y = height + 8; }
        if (p.y > height + 8) { p.y = -8; }

        var glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 7);
        glow.addColorStop(0, 'rgba(246,223,164,' + alpha + ')');
        glow.addColorStop(0.35, 'rgba(217,180,91,' + (alpha * 0.45) + ')');
        glow.addColorStop(1, 'rgba(217,180,91,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, alpha + 0.2) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      rafId = window.requestAnimationFrame(draw);
    }

    function start() {
      if (running || reduce) { return; }
      running = true;
      rafId = window.requestAnimationFrame(draw);
    }

    function stop() {
      running = false;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    build();

    if (reduce) {
      drawOnce();
      return;
    }

    start();

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { stop(); }
      else { start(); }
    });

    window.addEventListener('resize', function () {
      stop();
      build();
      start();
    }, { passive: true });

    function drawOnce() {
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        ctx.fillStyle = 'rgba(246,223,164,' + p.a + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* ==================== 九、导航当前页高亮 + 图片兜底 ==================== */
  function markActiveNav() {
    var page = document.body.getAttribute('data-page');
    if (!page) { return; }
    var links = document.querySelectorAll('.nav-menu a[data-nav]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('data-nav') === page) {
        links[i].classList.add('active');
        links[i].setAttribute('aria-current', 'page');
      } else {
        links[i].classList.remove('active');
        links[i].removeAttribute('aria-current');
      }
    }
  }

  function initImageFallback() {
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].addEventListener('error', function () {
        this.style.opacity = '0.35';
        if (this.parentNode) { this.parentNode.classList.add('img-missing'); }
      });
    }
  }

  /* ==================== 十、启动 ==================== */
  function init() {
    renderGalleryGrid();
    renderCaptions();
    buildLightbox();
    bindLightboxTriggers();
    markActiveNav();
    applyLanguage(readLang());   // 读取跨页保存的语言状态
    initHeroCanvas();
    initReveal();
    initScrollUI();
    initNav();
    initImageFallback();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* ==========================================================================
   扩展模块：公告栏 / 版本更新提示 / 更新记录面板 / 复制按钮 / 页脚版本号
   数据来源：data.js 暴露的 window.OWL_SITE（纯前端，file:// 下不使用 fetch）
   ========================================================================== */
(function () {
  'use strict';

  var LANG_KEY = 'owl-cult-lang';
  var SEEN_KEY = 'owl-cult-seen-version';
  var CLOSED_KEY = 'owl-cult-closed-announcements';
  var AUTO_MS = 7000;

  var SITE = (window.OWL_SITE && typeof window.OWL_SITE === 'object') ? window.OWL_SITE : null;

  var announceIndex = 0;
  var announceVisible = [];
  var announceTimer = null;
  var toastEl = null;
  var toastTimer = null;

  /* ---------- 基础工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function readLang() {
    var v = null;
    try { v = window.localStorage.getItem(LANG_KEY); } catch (e) { v = null; }
    if (v === 'zh' || v === 'en') { return v; }
    var attr = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    return attr.indexOf('en') === 0 ? 'en' : 'zh';
  }

  function isEn() { return readLang() === 'en'; }
  function t(zh, en) { return isEn() ? en : zh; }
  function pick(obj) { return obj ? (isEn() ? (obj.en || obj.zh || '') : (obj.zh || obj.en || '')) : ''; }
  function lsGet(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }
  function lsSet(key, val) { try { window.localStorage.setItem(key, val); } catch (e) {} }

  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

  function versionDesc(list) {
    var arr = isArray(list) ? list.slice() : [];
    arr.sort(function (a, b) {
      var av = String((a && a.version) || '').split('.');
      var bv = String((b && b.version) || '').split('.');
      var len = Math.max(av.length, bv.length);
      for (var i = 0; i < len; i++) {
        var x = parseInt(av[i], 10) || 0;
        var y = parseInt(bv[i], 10) || 0;
        if (x !== y) { return y - x; }
      }
      return 0;
    });
    return arr;
  }

  function changelogSorted() { return versionDesc(SITE ? SITE.changelog : []); }

  function versionListMarkup(list) {
    var html = '';
    var arr = list || [];
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i] || {};
      var items = isArray(v.items) ? v.items : [];
      html += '<div class="cl-version">';
      html += '<div class="cl-head"><span class="cl-ver">v' + esc(v.version || '') + '</span>'
        + '<span class="cl-date">' + esc(v.date || '') + '</span></div>';
      html += '<ul class="cl-items">';
      for (var j = 0; j < items.length; j++) {
        html += '<li>' + esc(pick(items[j])) + '</li>';
      }
      html += '</ul></div>';
    }
    return html;
  }

  /* ---------- 轻提示 ---------- */
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toastEl.classList.remove('show'); }, 2800);
  }

  /* ---------- 公告栏 ---------- */
  function findHeaderBlock() {
    var nav = document.querySelector('.nav') || document.querySelector('.site-nav')
      || document.querySelector('nav') || document.querySelector('header');
    if (!nav) { return null; }
    if (nav.closest) {
      var header = nav.closest('header');
      if (header) { return header; }
    }
    return nav;
  }

  function closedIds() {
    var raw = lsGet(CLOSED_KEY);
    if (!raw) { return []; }
    var arr = null;
    try { arr = JSON.parse(raw); } catch (e) { arr = null; }
    return isArray(arr) ? arr : [];
  }

  function visibleAnnouncements() {
    var list = (SITE && isArray(SITE.announcements)) ? SITE.announcements : [];
    var closed = closedIds();
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (!a || !a.id) { continue; }
      if (closed.indexOf(a.id) !== -1) { continue; }
      out.push(a);
    }
    return out;
  }

  function ensureAnnounceBar() {
    var bar = document.getElementById('announceBar');
    if (bar) { return bar; }
    var host = findHeaderBlock();
    if (!host || !host.parentNode) { return null; }
    bar = document.createElement('div');
    bar.className = 'announce';
    bar.id = 'announceBar';
    bar.hidden = true;
    host.parentNode.insertBefore(bar, host.nextSibling);
    bindAnnounceEvents(bar);
    return bar;
  }

  function stopAuto() {
    if (announceTimer) {
      window.clearInterval(announceTimer);
      announceTimer = null;
    }
  }

  function startAuto() {
    stopAuto();
    if (announceVisible.length < 2) { return; }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }
    announceTimer = window.setInterval(function () { stepAnnounce(1); }, AUTO_MS);
  }

  function stepAnnounce(delta) {
    if (announceVisible.length < 2) { return; }
    announceIndex = (announceIndex + delta + announceVisible.length) % announceVisible.length;
    renderAnnounce();
  }

  function closeCurrentAnnouncement() {
    var cur = announceVisible[announceIndex];
    if (cur && cur.id) {
      var closed = closedIds();
      if (closed.indexOf(cur.id) === -1) { closed.push(cur.id); }
      lsSet(CLOSED_KEY, JSON.stringify(closed));
    }
    announceIndex = 0;
    renderAnnounce();
  }

  function renderAnnounce() {
    var bar = ensureAnnounceBar();
    if (!bar) { return; }
    announceVisible = visibleAnnouncements();
    if (!announceVisible.length) {
      bar.hidden = true;
      bar.innerHTML = '';
      stopAuto();
      return;
    }
    bar.hidden = false;
    if (announceIndex < 0 || announceIndex >= announceVisible.length) { announceIndex = 0; }

    var cur = announceVisible[announceIndex];
    var multi = announceVisible.length > 1;
    var isNotice = cur.level === 'notice';

    var html = '<div class="announce-inner ' + (isNotice ? 'is-notice' : 'is-info') + '">';
    html += '<span class="announce-badge">' + esc(isNotice ? t('通知', 'Notice') : t('公告', 'Info')) + '</span>';
    html += '<div class="announce-body">';
    html += '<p class="announce-text">' + esc(pick(cur)) + '</p>';
    html += '<span class="announce-meta">' + esc(cur.date || '');
    if (multi) { html += ' · ' + (announceIndex + 1) + '/' + announceVisible.length; }
    html += '</span>';
    if (cur.link && cur.link.href) {
      html += '<a class="announce-link" href="' + esc(cur.link.href) + '">' + esc(pick(cur.link)) + '</a>';
    }
    html += '</div>';
    if (multi) {
      html += '<div class="announce-ctrl">'
        + '<button class="announce-nav" type="button" data-act="prev" aria-label="' + esc(t('上一条', 'Previous')) + '">&#8249;</button>'
        + '<button class="announce-nav" type="button" data-act="next" aria-label="' + esc(t('下一条', 'Next')) + '">&#8250;</button>'
        + '</div>';
    }
    html += '<button class="announce-close" type="button" data-act="close" aria-label="'
      + esc(t('关闭公告', 'Dismiss announcement')) + '">&#10005;</button>';
    html += '</div>';

    bar.innerHTML = html;
    startAuto();
  }

  function bindAnnounceEvents(bar) {
    bar.addEventListener('click', function (ev) {
      var el = ev.target;
      while (el && el !== bar && !(el.getAttribute && el.getAttribute('data-act'))) {
        el = el.parentNode;
      }
      if (!el || el === bar) { return; }
      var act = el.getAttribute('data-act');
      if (act === 'prev') { stepAnnounce(-1); }
      else if (act === 'next') { stepAnnounce(1); }
      else if (act === 'close') { closeCurrentAnnouncement(); }
    });
    bar.addEventListener('mouseenter', stopAuto);
    bar.addEventListener('mouseleave', startAuto);
  }

  /* ---------- 版本更新提示 ---------- */
  function updateCardMarkup() {
    var latest = versionListMarkup(changelogSorted().slice(0, 1));
    var html = '';
    html += '<div class="update-head">';
    html += '<span class="update-tag">What&#39;s New</span>';
    html += '<button class="update-close" type="button" data-act="ok" aria-label="'
      + esc(t('关闭', 'Close')) + '">&#10005;</button>';
    html += '</div>';
    html += '<h3 class="update-title">' + esc(t('站点已更新', 'The site has been updated')) + '</h3>';
    html += '<p class="update-sub">' + esc('v' + (SITE.version || '') + t(' · 更新于 ', ' · updated ') + (SITE.updatedAt || '')) + '</p>';
    html += latest || '<p class="cl-empty">' + esc(t('暂无更新记录。', 'No changelog entries.')) + '</p>';
    html += '<div class="update-actions">';
    html += '<button class="btn update-ok" type="button" data-act="ok">' + esc(t('知道了', 'Got it')) + '</button>';
    html += '<a class="update-all" href="about.html#changelog">' + esc(t('查看全部更新', 'View full changelog')) + '</a>';
    html += '</div>';
    return html;
  }

  function hideUpdateCard() {
    var card = document.getElementById('updateCard');
    if (card) { card.classList.remove('show'); }
  }

  function showUpdateCard() {
    if (!SITE || !SITE.version) { return; }
    if (lsGet(SEEN_KEY) === SITE.version) { return; }
    var card = document.getElementById('updateCard');
    if (!card) {
      card = document.createElement('aside');
      card.className = 'update-card';
      card.id = 'updateCard';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-label', t('更新日志', "What's New"));
      document.body.appendChild(card);
      card.addEventListener('click', function (ev) {
        var el = ev.target;
        while (el && el !== card && !(el.getAttribute && el.getAttribute('data-act'))) {
          el = el.parentNode;
        }
        if (!el || el === card) { return; }
        if (el.getAttribute('data-act') === 'ok') {
          lsSet(SEEN_KEY, SITE.version);
          hideUpdateCard();
        }
      });
    }
    card.innerHTML = updateCardMarkup();
    card.classList.add('show');
  }

  /* ---------- 更新记录面板 ---------- */
  function renderChangelog() {
    var box = document.getElementById('changelogList');
    if (!box) { return; }
    var list = changelogSorted();
    box.innerHTML = list.length
      ? versionListMarkup(list)
      : '<p class="cl-empty">' + esc(t('暂无更新记录。', 'No changelog entries.')) + '</p>';
  }

  function openHashChangelog() {
    if (window.location.hash !== '#changelog') { return; }
    var panel = document.getElementById('changelog');
    if (panel) { panel.open = true; }
  }

  /* ---------- 页脚版本号 ---------- */
  function renderFooterVersion() {
    var host = document.querySelector('.footer-bottom');
    if (!host || !SITE) { return; }
    var el = document.getElementById('siteVersion');
    if (!el) {
      el = document.createElement('span');
      el.className = 'site-version';
      el.id = 'siteVersion';
      var author = host.querySelector('.author');
      if (author) { host.insertBefore(el, author); } else { host.appendChild(el); }
    }
    el.textContent = 'v' + (SITE.version || '') + ' · ' + t('更新于 ', 'updated ') + (SITE.updatedAt || '');
  }

  /* ---------- 一键复制 ---------- */
  function selectNodeContents(el) {
    if (!el) { return; }
    var range = document.createRange();
    range.selectNodeContents(el);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function legacyCopy(text) {
    var done = false;
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      done = !!(document.execCommand && document.execCommand('copy'));
      document.body.removeChild(ta);
    } catch (e) { done = false; }
    return done;
  }

  function flashCopyBtn(btn) {
    if (!btn) { return; }
    if (!btn.getAttribute('data-label')) {
      btn.setAttribute('data-label', btn.textContent);
    }
    btn.classList.add('copied');
    btn.textContent = t('已复制', 'Copied');
    window.setTimeout(function () {
      btn.classList.remove('copied');
      btn.textContent = btn.getAttribute('data-label') || btn.textContent;
    }, 1700);
  }

  function handleCopy(btn) {
    var sel = btn.getAttribute('data-copy');
    var target = sel ? document.querySelector(sel) : null;
    var text = target
      ? (target.getAttribute('data-raw') || target.textContent.replace(/\s+/g, ' ').trim())
      : '';
    if (!text) { return; }

    function onOk() { flashCopyBtn(btn); toast(t('已复制：', 'Copied: ') + text); }
    function onFail() {
      if (legacyCopy(text)) { onOk(); return; }
      try { selectNodeContents(target); } catch (e) {}
      toast(t('复制失败，已为你选中文本，请按 ⌘C 复制', 'Copy failed — text selected, press ⌘C to copy'));
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        navigator.clipboard.writeText(text).then(onOk, onFail);
        return;
      } catch (e) { /* 落到兜底 */ }
    }
    onFail();
  }

  function initCopyButtons() {
    var btns = document.querySelectorAll('[data-copy]');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () { handleCopy(btn); });
      })(btns[i]);
    }
  }

  /* ---------- 语言切换同步 ---------- */
  function refreshAll() {
    renderAnnounce();
    renderChangelog();
    renderFooterVersion();
    var card = document.getElementById('updateCard');
    if (card && card.classList.contains('show')) {
      card.innerHTML = updateCardMarkup();
    }
  }

  function watchLanguage() {
    if (!window.MutationObserver) { return; }
    var last = document.documentElement.getAttribute('lang');
    var obs = new MutationObserver(function () {
      var now = document.documentElement.getAttribute('lang');
      if (now === last) { return; }
      last = now;
      refreshAll();
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }

  /* ---------- 启动 ---------- */
  function initExtras() {
    renderAnnounce();
    renderChangelog();
    renderFooterVersion();
    initCopyButtons();
    if (SITE && SITE.announcements === undefined) {
      /* 无 announcements 字段时公告栏自动不显示 */
    }
    window.setTimeout(showUpdateCard, 700);
    openHashChangelog();
    window.addEventListener('hashchange', openHashChangelog);
    watchLanguage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExtras);
  } else {
    initExtras();
  }
})();

/* ==========================================================================
   22. 更新卡紧凑态 / 让位，以及内容显现兜底（独立模块，不改动以上逻辑）
   ========================================================================== */
(function () {
  'use strict';

  var COMPACT = 'compact';

  function cardEl() { return document.getElementById('updateCard'); }
  function isShown(c) { return !!(c && c.classList.contains('show')); }

  /* 浮层出现后默认进入紧凑态（只留标签行与标题），不遮挡正文与「复制」按钮 */
  var tries = 0;
  var timer = window.setInterval(function () {
    var c = cardEl();
    if (c) {
      window.clearInterval(timer);
      c.classList.add(COMPACT);
    } else if (++tries > 60) {
      window.clearInterval(timer);
    }
  }, 80);

  /* 点击标题行：展开 / 收起（点关闭按钮等 data-act 元素不触发） */
  document.addEventListener('click', function (ev) {
    var c = cardEl();
    var t = ev.target;
    if (!isShown(c) || !t || !t.closest) { return; }
    if (t.closest('[data-act]')) { return; }
    var head = t.closest('.update-head');
    if (head && c.contains(head)) { c.classList.toggle(COMPACT); }
  }, true);

  /* 点击卡片外区域：自动收起为紧凑态，随时释放被覆盖的页面元素 */
  document.addEventListener('click', function (ev) {
    var c = cardEl();
    if (isShown(c) && !c.contains(ev.target)) { c.classList.add(COMPACT); }
  }, true);

  /* Esc：收起为紧凑态 */
  document.addEventListener('keydown', function (ev) {
    var c = cardEl();
    if ((ev.key === 'Escape' || ev.keyCode === 27) && isShown(c)) { c.classList.add(COMPACT); }
  });

  /* 兜底：视口内的 .reveal 元素 1.8s 后仍未显现则强制显现，避免出现空白断裂 */
  window.setTimeout(function () {
    var els = document.querySelectorAll('.reveal:not(.in)');
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) { els[i].classList.add('in'); }
    }
  }, 1800);
})();
