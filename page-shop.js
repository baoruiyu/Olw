/* ==========================================================================
   猫头鹰教 The Owl Cult — assets/page-shop.js
   shop.html 专用逻辑：从云数据库读取商品列表并渲染，「我想要 / 预约」写入云端记录

   说明：本站商城不做在线支付，仅做展示与意向登记。
   ========================================================================== */

(function (window, document) {
  'use strict';

  var OWL = window.OWL;
  if (!OWL) { return; }

  var t = OWL.t;
  var esc = OWL.esc;

  var products = [];
  var loading = true;
  var failed = false;
  var currentProduct = null;

  var CONTACT_KEY = 'owl-cult-contact';

  /* ---------------------------------------------------------------- 模板 */

  function pickZhEn(zh, en) { return OWL.lang() === 'en' ? (en || zh || '') : (zh || en || ''); }

  function thumbFor(p, i) {
    if (p.image) { return p.image; }
    return 'images/owl' + ((i % 9) + 1) + '.jpg';
  }

  function cardMarkup(p, i) {
    var soldOut = Number(p.stock) === 0;
    var name = pickZhEn(p.name, p.nameEn) || t('未命名商品', 'Untitled');
    var desc = pickZhEn(p.desc, p.descEn);
    var tag = pickZhEn(p.tag, p.tagEn);

    var html = '<article class="shop-card' + (soldOut ? ' is-soldout' : '') + '">';
    html += '<div class="shop-thumb"><img src="' + esc(thumbFor(p, i)) + '" alt="' + esc(name) + '" loading="lazy">';
    if (tag) { html += '<span class="shop-tag">' + esc(tag) + '</span>'; }
    if (soldOut) { html += '<span class="shop-tag is-soldout">' + t('已售罄', 'Sold out') + '</span>'; }
    html += '</div>';
    html += '<div class="shop-body">';
    html += '<h3 class="shop-name">' + esc(name) + '</h3>';
    if (desc) { html += '<p class="shop-desc">' + esc(desc) + '</p>'; }
    html += '<div class="shop-foot">';
    html += '<span class="shop-price">' + esc(OWL.fmtPrice(p.price)) + '</span>';
    if (p.stock !== undefined && p.stock !== null && p.stock !== '') {
      html += '<span class="shop-stock">' + t('库存 ', 'Stock ') + esc(String(p.stock)) + '</span>';
    }
    html += '</div>';
    html += '<button class="btn btn-primary shop-btn" type="button" data-reserve="' + esc(p._id || p.id || '') + '"'
      + (soldOut ? ' disabled' : '') + '>' + t('我想要', 'I want it') + '</button>';
    html += '</div></article>';
    return html;
  }

  function emptyMarkup() {
    return '<div class="shop-empty card">'
      + '<div class="shop-empty-owl" aria-hidden="true">&#9789;</div>'
      + '<h3>' + t('商城正在筹备中', 'The shop is being prepared') + '</h3>'
      + '<p>' + t(
        '目前还没有上架的商品。等管理员在后台添加后，这里会自动出现。',
        'No products have been listed yet. They will appear here automatically once the administrator adds them.'
      ) + '</p>'
      + '<p class="shop-empty-tip">' + t(
        '管理员可登录后进入「管理后台 → 商品管理」上架第一件商品。',
        'Administrators can sign in and go to Admin console → Products to list the first product.'
      ) + '</p>'
      + '</div>';
  }

  function loadingMarkup() {
    return '<div class="shop-loading"><div class="auth-spinner" aria-hidden="true"></div>'
      + '<p>' + t('正在读取商品…', 'Loading products…') + '</p></div>';
  }

  function errorMarkup() {
    return '<div class="shop-empty card">'
      + '<h3>' + t('暂时无法读取商品', 'Products are unavailable right now') + '</h3>'
      + '<p>' + t('请稍后重试；若一直失败，请确认云函数已部署、assets/config.js 中的环境 ID 正确。',
        'Please retry later. If it keeps failing, check that the cloud function is deployed and the env ID in assets/config.js is correct.') + '</p>'
      + '<button class="btn" type="button" id="shopRetry">' + t('重新加载', 'Reload') + '</button>'
      + '</div>';
  }

  function unconfiguredMarkup() {
    return '<div class="shop-empty card">'
      + '<h3>' + t('还没有配置云开发环境', 'CloudBase environment not configured yet') + '</h3>'
      + '<p>' + t('请按 docs/部署手册.md 完成部署，并把环境 ID 填入 assets/config.js。',
        'Follow docs/部署手册.md to deploy, then fill the env ID into assets/config.js.') + '</p>'
      + '</div>';
  }

  /* ---------------------------------------------------------------- 渲染 */

  function render() {
    var host = document.getElementById('shopGrid');
    var status = document.getElementById('shopStatus');
    if (!host) { return; }

    if (!OWL.isConfigured()) {
      host.innerHTML = unconfiguredMarkup();
      if (status) { status.textContent = ''; }
      return;
    }
    if (loading) {
      host.innerHTML = loadingMarkup();
      if (status) { status.textContent = ''; }
      return;
    }
    if (failed) {
      host.innerHTML = errorMarkup();
      var retry = document.getElementById('shopRetry');
      if (retry) { retry.addEventListener('click', function () { load(); }); }
      if (status) { status.textContent = ''; }
      return;
    }
    if (!products.length) {
      host.innerHTML = emptyMarkup();
      if (status) { status.textContent = t('共 0 件商品', '0 products'); }
      return;
    }

    var html = '';
    for (var i = 0; i < products.length; i++) {
      html += cardMarkup(products[i], i);
    }
    host.innerHTML = '<div class="shop-grid">' + html + '</div>';
    if (status) { status.textContent = t('共 ' + products.length + ' 件商品', products.length + ' products'); }

    var btns = host.querySelectorAll('[data-reserve]');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', function () { openReserve(this.getAttribute('data-reserve')); });
    }
  }

  /* ---------------------------------------------------------------- 数据 */

  function load() {
    loading = true;
    failed = false;
    render();
    return OWL.call('products.list', { scope: 'site', limit: 100 }).then(function (d) {
      var items = (d && d.items) ? d.items : (d && d.products) ? d.products : (d || []);
      products = (Object.prototype.toString.call(items) === '[object Array]') ? items : [];
      loading = false;
      render();
      return products;
    }).catch(function (e) {
      loading = false;
      failed = true;
      render();
      if (window.console && console.warn) { console.warn('[owl] 商品读取失败：', OWL.errText(e)); }
      return [];
    });
  }

  /* ---------------------------------------------------------------- 预约表单 */

  function modal() { return document.getElementById('reserveModal'); }

  function openReserve(productId) {
    var list = products;
    currentProduct = null;
    for (var i = 0; i < list.length; i++) {
      if (String(list[i]._id || list[i].id) === String(productId)) { currentProduct = list[i]; break; }
    }
    if (!currentProduct) { return; }

    var box = modal();
    if (!box) { return; }

    var contact = '';
    try { contact = window.localStorage.getItem(CONTACT_KEY) || ''; } catch (e) {}

    box.querySelector('[data-reserve-product]').textContent =
      pickZhEn(currentProduct.name, currentProduct.nameEn) || t('商品', 'Product');
    box.querySelector('[data-field="contact"]').value = contact;
    box.querySelector('[data-field="name"]').value = '';
    box.querySelector('[data-field="message"]').value = '';
    box.querySelector('[data-reserve-error]').textContent = '';
    box.classList.add('show');
    box.setAttribute('aria-hidden', 'false');
    var first = box.querySelector('[data-field="contact"]');
    if (first) { first.focus(); }
  }

  function closeReserve() {
    var box = modal();
    if (!box) { return; }
    box.classList.remove('show');
    box.setAttribute('aria-hidden', 'true');
    currentProduct = null;
  }

  function submitReserve(e) {
    if (e && e.preventDefault) { e.preventDefault(); }
    var box = modal();
    if (!box || !currentProduct) { return; }

    var contact = (box.querySelector('[data-field="contact"]').value || '').trim();
    var name = (box.querySelector('[data-field="name"]').value || '').trim();
    var message = (box.querySelector('[data-field="message"]').value || '').trim();
    var errEl = box.querySelector('[data-reserve-error]');
    var submitBtn = box.querySelector('[data-reserve-submit]');

    if (!contact) {
      errEl.textContent = t('请填写联系方式，便于我们与你联系。', 'Please leave a way for us to contact you.');
      return;
    }
    if (contact.length > 120 || message.length > 500) {
      errEl.textContent = t('内容过长，请精简后重试。', 'Too long, please shorten it.');
      return;
    }
    errEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');

    var payload = {
      productId: String(currentProduct._id || currentProduct.id || ''),
      productName: pickZhEn(currentProduct.name, currentProduct.nameEn) || '',
      contact: contact,
      name: name,
      message: message
    };
    var token = OWL.session.token();
    if (token) { payload.sessionToken = token; }

    OWL.call('reservations.create', payload).then(function () {
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-loading');
      try { window.localStorage.setItem(CONTACT_KEY, contact); } catch (er) {}
      closeReserve();
      OWL.ui.toast(t('已收到你的意向，我们会尽快联系你。咕咪！', 'Request received. We will contact you soon. Gu Mi!'));
    }).catch(function (err) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-loading');
      errEl.textContent = OWL.errText(err);
    });
  }

  /* ---------------------------------------------------------------- 启动 */

  function bindStatic() {
    var box = modal();
    if (box) {
      var closes = box.querySelectorAll('[data-modal-close]');
      for (var i = 0; i < closes.length; i++) {
        closes[i].addEventListener('click', closeReserve);
      }
      box.addEventListener('click', function (e) { if (e.target === box) { closeReserve(); } });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' || e.keyCode === 27) { closeReserve(); }
      });
      var form = box.querySelector('[data-reserve-form]');
      if (form) { form.addEventListener('submit', submitReserve); }
    }
    window.addEventListener('owl:lang-changed', function () { render(); });
  }

  function boot() {
    bindStatic();
    if (!OWL.isConfigured()) { render(); return; }
    load();
  }

  window.OWL.shop = { reload: load, products: function () { return products; } };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
