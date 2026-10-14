/* ==========================================================================
   猫头鹰教 The Owl Cult — assets/page-admin.js
   管理后台：成员 / 商品 / 公告 / 预约记录 四块管理

   安全说明：本页的「隐藏」只是体验优化，真正的权限校验在云函数里做
   （每个 admin.* 接口都会用 sessionToken 反查成员表并校验 role === 'admin'）。
   ========================================================================== */

(function (window, document) {
  'use strict';

  var OWL = window.OWL;
  if (!OWL) { return; }

  var t = OWL.t;
  var esc = OWL.esc;

  var activeTab = 'members';
  var loaded = { members: false, products: false, announcements: false, reservations: false };
  var data = { members: [], products: [], announcements: [], reservations: [] };
  var editing = { product: null, announcement: null };

  /* ---------------------------------------------------------------- 工具 */

  function pickZhEn(zh, en) { return OWL.lang() === 'en' ? (en || zh || '') : (zh || en || ''); }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return (root || document).querySelectorAll(sel); }

  function adminCall(action, payload) {
    payload = payload || {};
    payload.sessionToken = OWL.session.token();
    return OWL.call(action, payload);
  }

  function fail(e) { OWL.ui.toast(OWL.errText(e)); }

  function gate(html) {
    var g = $('#adminGate'), a = $('#adminApp');
    if (g) { g.innerHTML = html; g.hidden = false; }
    if (a) { a.hidden = true; }
  }

  function showApp() {
    var g = $('#adminGate'), a = $('#adminApp');
    if (g) { g.hidden = true; }
    if (a) { a.hidden = false; }
  }

  function armed(btn, run) {
    if (btn.getAttribute('data-armed') !== '1') {
      btn.setAttribute('data-armed', '1');
      btn.setAttribute('data-orig', btn.textContent);
      btn.textContent = t('确认删除？', 'Confirm delete?');
      window.setTimeout(function () {
        if (btn.getAttribute('data-armed') === '1') {
          btn.removeAttribute('data-armed');
          btn.textContent = btn.getAttribute('data-orig') || t('删除', 'Delete');
        }
      }, 5000);
      return;
    }
    btn.removeAttribute('data-armed');
    btn.disabled = true;
    run();
  }

  function loadingRow(cols) {
    return '<tr><td colspan="' + cols + '" class="cell-soft">' + t('读取中…', 'Loading…') + '</td></tr>';
  }

  /* ---------------------------------------------------------------- 标签页 */

  function switchTab(name) {
    activeTab = name;
    var tabs = $$('.admin-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('is-active', tabs[i].getAttribute('data-tab') === name);
    }
    var panels = $$('.admin-panel');
    for (var j = 0; j < panels.length; j++) {
      var on = panels[j].getAttribute('data-panel') === name;
      panels[j].hidden = !on;
    }
    if (!loaded[name]) { loadPanel(name); }
  }

  function loadPanel(name) {
    if (name === 'members') { return loadMembers(); }
    if (name === 'products') { return loadProducts(); }
    if (name === 'announcements') { return loadAnnouncements(); }
    if (name === 'reservations') { return loadReservations(); }
  }

  function reloadPanel() { loaded[activeTab] = false; loadPanel(activeTab); }

  /* ---------------------------------------------------------------- 成员 */

  function renderMembers() {
    var host = $('#memberList');
    if (!host) { return; }
    if (!data.members.length) {
      host.innerHTML = '<p class="state-note">' + t('还没有成员。', 'No members yet.') + '</p>';
      return;
    }
    var me = OWL.auth.user() || {};
    var html = '<div class="table-wrap"><table class="data-table"><thead><tr>'
      + '<th>' + t('成员', 'Member') + '</th>'
      + '<th>Gitee</th>'
      + '<th>' + t('角色', 'Role') + '</th>'
      + '<th>' + t('状态', 'Status') + '</th>'
      + '<th>' + t('最近登录', 'Last sign-in') + '</th>'
      + '</tr></thead><tbody>';

    for (var i = 0; i < data.members.length; i++) {
      var m = data.members[i];
      var isSelf = String(m._id) === String(me.id || me._id || '');
      html += '<tr>'
        + '<td><div class="cell-user"><img class="cell-avatar" src="' + esc(m.avatar || 'images/owl1.jpg') + '" alt="" loading="lazy">'
        + '<span>' + esc(m.nickname || m.giteeLogin || '—') + (isSelf ? ' <span class="chip chip-gold">' + t('我', 'me') + '</span>' : '') + '</span></div></td>'
        + '<td class="cell-soft">' + esc(m.giteeLogin ? '@' + m.giteeLogin : '—') + '</td>'
        + '<td><select class="mini-select" data-role="' + esc(m._id) + '"' + (isSelf ? ' disabled' : '') + '>'
        + '<option value="member"' + (m.role === 'member' ? ' selected' : '') + '>' + t('会员', 'Member') + '</option>'
        + '<option value="admin"' + (m.role === 'admin' ? ' selected' : '') + '>' + t('管理员', 'Admin') + '</option>'
        + '</select></td>'
        + '<td><button class="btn btn-mini" type="button" data-status="' + esc(m._id) + '" data-next="'
        + (m.status === 'banned' ? 'active' : 'banned') + '"' + (isSelf ? ' disabled' : '') + '>'
        + (m.status === 'banned' ? t('已禁用 · 点击启用', 'Disabled · enable') : t('正常 · 点击禁用', 'Active · disable'))
        + '</button></td>'
        + '<td class="cell-soft">' + esc(OWL.fmtDate(m.lastLoginAt) || '—') + '</td>'
        + '</tr>';
    }
    html += '</tbody></table></div>';
    host.innerHTML = html;

    var sels = $$('#memberList select[data-role]');
    for (var a = 0; a < sels.length; a++) {
      sels[a].addEventListener('change', function () {
        var id = this.getAttribute('data-role');
        var self = this;
        self.disabled = true;
        adminCall('admin.members.update', { userId: id, role: self.value }).then(function () {
          OWL.ui.toast(t('角色已更新', 'Role updated'));
          self.disabled = false;
        }).catch(function (e) { fail(e); self.disabled = false; reloadPanel(); });
      });
    }
    var btns = $$('#memberList button[data-status]');
    for (var b = 0; b < btns.length; b++) {
      btns[b].addEventListener('click', function () {
        var id = this.getAttribute('data-status');
        var next = this.getAttribute('data-next');
        var self = this;
        self.disabled = true;
        adminCall('admin.members.update', { userId: id, status: next }).then(function () {
          OWL.ui.toast(t('状态已更新', 'Status updated'));
          reloadPanel();
        }).catch(function (e) { fail(e); self.disabled = false; });
      });
    }
  }

  function loadMembers() {
    loaded.members = true;
    var host = $('#memberList');
    if (host) { host.innerHTML = loadingRow(5); }
    return adminCall('admin.members.list', { limit: 200 }).then(function (d) {
      data.members = (d && d.items) ? d.items : [];
      renderMembers();
    }).catch(function (e) { fail(e); if (host) { host.innerHTML = '<p class="state-note is-danger">' + esc(OWL.errText(e)) + '</p>'; } });
  }

  /* ---------------------------------------------------------------- 商品 */

  function renderProducts() {
    var host = $('#productList');
    if (!host) { return; }
    if (!data.products.length) {
      host.innerHTML = '<p class="state-note">' + t('还没有商品，点击「新增商品」上架第一件。', 'No products yet — click “New product” to add one.') + '</p>';
      return;
    }
    var html = '<div class="table-wrap"><table class="data-table"><thead><tr>'
      + '<th>' + t('商品', 'Product') + '</th>'
      + '<th>' + t('价格', 'Price') + '</th>'
      + '<th>' + t('库存', 'Stock') + '</th>'
      + '<th>' + t('排序', 'Sort') + '</th>'
      + '<th>' + t('状态', 'Status') + '</th>'
      + '<th>' + t('操作', 'Actions') + '</th>'
      + '</tr></thead><tbody>';

    for (var i = 0; i < data.products.length; i++) {
      var p = data.products[i];
      var on = p.status === 'on';
      html += '<tr>'
        + '<td><div class="cell-user"><img class="cell-avatar is-cover" src="' + esc(p.image || 'images/owl' + ((i % 9) + 1) + '.jpg') + '" alt="" loading="lazy">'
        + '<span>' + esc(pickZhEn(p.name, p.nameEn) || '—') + '</span></div></td>'
        + '<td>' + esc(OWL.fmtPrice(p.price)) + '</td>'
        + '<td>' + esc(p.stock === undefined || p.stock === null ? '—' : String(p.stock)) + '</td>'
        + '<td class="cell-soft">' + esc(p.sort === undefined || p.sort === null ? '0' : String(p.sort)) + '</td>'
        + '<td><span class="chip' + (on ? ' chip-gold' : '') + '">' + (on ? t('上架中', 'Live') : t('已下架', 'Off')) + '</span></td>'
        + '<td class="cell-actions">'
        + '<button class="btn btn-mini" type="button" data-edit="' + esc(p._id) + '">' + t('编辑', 'Edit') + '</button>'
        + '<button class="btn btn-mini" type="button" data-toggle="' + esc(p._id) + '" data-next="' + (on ? 'off' : 'on') + '">'
        + (on ? t('下架', 'Unlist') : t('上架', 'Publish')) + '</button>'
        + '<button class="btn btn-mini btn-danger" type="button" data-del="' + esc(p._id) + '">' + t('删除', 'Delete') + '</button>'
        + '</td></tr>';
    }
    html += '</tbody></table></div>';
    host.innerHTML = html;

    var edits = $$('#productList button[data-edit]');
    for (var a = 0; a < edits.length; a++) {
      edits[a].addEventListener('click', function () { openProductForm(this.getAttribute('data-edit')); });
    }
    var toggles = $$('#productList button[data-toggle]');
    for (var b = 0; b < toggles.length; b++) {
      toggles[b].addEventListener('click', function () {
        var id = this.getAttribute('data-toggle'), next = this.getAttribute('data-next'), self = this;
        self.disabled = true;
        var row = findProduct(id);
        adminCall('admin.products.save', { product: merge(row, { _id: id, status: next }) }).then(function () {
          OWL.ui.toast(t('已更新', 'Updated'));
          reloadPanel();
        }).catch(function (e) { fail(e); self.disabled = false; });
      });
    }
    var dels = $$('#productList button[data-del]');
    for (var c = 0; c < dels.length; c++) {
      dels[c].addEventListener('click', function () {
        var id = this.getAttribute('data-del'), self = this;
        armed(self, function () {
          adminCall('admin.products.remove', { productId: id }).then(function () {
            OWL.ui.toast(t('已删除', 'Deleted'));
            if (editing.product && String(editing.product._id) === String(id)) { closeProductForm(); }
            reloadPanel();
          }).catch(function (e) { fail(e); self.disabled = false; });
        });
      });
    }
  }

  function findProduct(id) {
    for (var i = 0; i < data.products.length; i++) {
      if (String(data.products[i]._id) === String(id)) { return data.products[i]; }
    }
    return {};
  }

  function merge(base, extra) {
    var out = {}, k;
    for (k in base) { if (Object.prototype.hasOwnProperty.call(base, k)) { out[k] = base[k]; } }
    for (k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; } }
    return out;
  }

  function productField(name) { return $('#productForm [data-field="' + name + '"]'); }

  function openProductForm(id) {
    var form = $('#productForm');
    if (!form) { return; }
    var p = id ? findProduct(id) : { status: 'on', sort: 0 };
    editing.product = p && p._id ? p : null;
    productField('_id').value = p._id || '';
    productField('name').value = p.name || '';
    productField('nameEn').value = p.nameEn || '';
    productField('tag').value = p.tag || '';
    productField('tagEn').value = p.tagEn || '';
    productField('desc').value = p.desc || '';
    productField('descEn').value = p.descEn || '';
    productField('price').value = (p.price === undefined || p.price === null) ? '' : p.price;
    productField('stock').value = (p.stock === undefined || p.stock === null) ? 0 : p.stock;
    productField('image').value = p.image || '';
    productField('sort').value = (p.sort === undefined || p.sort === null) ? 0 : p.sort;
    productField('status').value = p.status || 'on';
    $('#productFormTitle').textContent = p._id ? t('编辑商品', 'Edit product') : t('新增商品', 'New product');
    form.hidden = false;
    productField('name').focus();
  }

  function closeProductForm() {
    var form = $('#productForm');
    if (form) { form.hidden = true; }
    editing.product = null;
  }

  function saveProduct() {
    var name = (productField('name').value || '').trim();
    var price = (productField('price').value || '').trim();
    var stock = (productField('stock').value || '').trim();
    var errEl = $('#productFormError');
    if (!name) { errEl.textContent = t('商品名称不能为空。', 'Product name is required.'); return; }
    if (price && isNaN(Number(price))) { errEl.textContent = t('价格必须是数字（元），留空表示面议。', 'Price must be a number (CNY) or empty.'); return; }
    if (stock && isNaN(Number(stock))) { errEl.textContent = t('库存必须是数字。', 'Stock must be a number.'); return; }
    errEl.textContent = '';

    var payload = {
      _id: productField('_id').value || undefined,
      name: name,
      nameEn: (productField('nameEn').value || '').trim(),
      tag: (productField('tag').value || '').trim(),
      tagEn: (productField('tagEn').value || '').trim(),
      desc: (productField('desc').value || '').trim(),
      descEn: (productField('descEn').value || '').trim(),
      price: price === '' ? '' : Number(price),
      stock: stock === '' ? 0 : Number(stock),
      image: (productField('image').value || '').trim(),
      sort: Number((productField('sort').value || '0').trim() || 0),
      status: productField('status').value
    };

    var btn = $('#productSave');
    btn.disabled = true;
    adminCall('admin.products.save', { product: payload }).then(function () {
      btn.disabled = false;
      OWL.ui.toast(t('已保存', 'Saved'));
      closeProductForm();
      reloadPanel();
    }).catch(function (e) {
      btn.disabled = false;
      errEl.textContent = OWL.errText(e);
    });
  }

  function loadProducts() {
    loaded.products = true;
    var host = $('#productList');
    if (host) { host.innerHTML = loadingRow(6); }
    return adminCall('admin.products.list', { limit: 200 }).then(function (d) {
      data.products = (d && d.items) ? d.items : [];
      renderProducts();
    }).catch(function (e) { fail(e); if (host) { host.innerHTML = '<p class="state-note is-danger">' + esc(OWL.errText(e)) + '</p>'; } });
  }

  /* ---------------------------------------------------------------- 公告 */

  function renderAnnouncements() {
    var host = $('#announceList');
    if (!host) { return; }
    if (!data.announcements.length) {
      host.innerHTML = '<p class="state-note">' + t('还没有公告，点击「新增公告」发布第一条。', 'No announcements yet — click “New announcement”.') + '</p>';
      return;
    }
    var html = '<div class="table-wrap"><table class="data-table"><thead><tr>'
      + '<th>' + t('标题', 'Title') + '</th>'
      + '<th>' + t('类型', 'Type') + '</th>'
      + '<th>' + t('置顶', 'Pinned') + '</th>'
      + '<th>' + t('状态', 'Status') + '</th>'
      + '<th>' + t('发布时间', 'Published') + '</th>'
      + '<th>' + t('操作', 'Actions') + '</th>'
      + '</tr></thead><tbody>';

    for (var i = 0; i < data.announcements.length; i++) {
      var r = data.announcements[i];
      var pub = r.status !== 'draft';
      html += '<tr>'
        + '<td>' + esc(pickZhEn(r.title, r.titleEn) || '—') + '</td>'
        + '<td><span class="chip' + (r.level === 'notice' ? ' chip-gold' : '') + '">'
        + (r.level === 'notice' ? t('通知', 'Notice') : t('公告', 'Info')) + '</span></td>'
        + '<td class="cell-soft">' + (r.pinned ? t('是', 'Yes') : '—') + '</td>'
        + '<td>' + (pub ? t('已发布', 'Published') : t('草稿', 'Draft')) + '</td>'
        + '<td class="cell-soft">' + esc(OWL.fmtDate(r.publishedAt || r.updatedAt) || '—') + '</td>'
        + '<td class="cell-actions">'
        + '<button class="btn btn-mini" type="button" data-edit="' + esc(r._id) + '">' + t('编辑', 'Edit') + '</button>'
        + '<button class="btn btn-mini" type="button" data-toggle="' + esc(r._id) + '" data-next="' + (pub ? 'draft' : 'published') + '">'
        + (pub ? t('转草稿', 'To draft') : t('发布', 'Publish')) + '</button>'
        + '<button class="btn btn-mini btn-danger" type="button" data-del="' + esc(r._id) + '">' + t('删除', 'Delete') + '</button>'
        + '</td></tr>';
    }
    html += '</tbody></table></div>';
    host.innerHTML = html;

    var edits = $$('#announceList button[data-edit]');
    for (var a = 0; a < edits.length; a++) {
      edits[a].addEventListener('click', function () { openAnnounceForm(this.getAttribute('data-edit')); });
    }
    var toggles = $$('#announceList button[data-toggle]');
    for (var b = 0; b < toggles.length; b++) {
      toggles[b].addEventListener('click', function () {
        var id = this.getAttribute('data-toggle'), next = this.getAttribute('data-next'), self = this;
        self.disabled = true;
        adminCall('admin.announcements.save', { announcement: merge(findAnnouncement(id), { _id: id, status: next }) }).then(function () {
          OWL.ui.toast(t('已更新', 'Updated'));
          reloadPanel();
        }).catch(function (e) { fail(e); self.disabled = false; });
      });
    }
    var dels = $$('#announceList button[data-del]');
    for (var c = 0; c < dels.length; c++) {
      dels[c].addEventListener('click', function () {
        var id = this.getAttribute('data-del'), self = this;
        armed(self, function () {
          adminCall('admin.announcements.remove', { announcementId: id }).then(function () {
            OWL.ui.toast(t('已删除', 'Deleted'));
            if (editing.announcement && String(editing.announcement._id) === String(id)) { closeAnnounceForm(); }
            reloadPanel();
            if (OWL.site && OWL.site.announcements) { OWL.site.announcements.load(); }
          }).catch(function (e) { fail(e); self.disabled = false; });
        });
      });
    }
  }

  function findAnnouncement(id) {
    for (var i = 0; i < data.announcements.length; i++) {
      if (String(data.announcements[i]._id) === String(id)) { return data.announcements[i]; }
    }
    return {};
  }

  function announceField(name) { return $('#announceForm [data-field="' + name + '"]'); }

  function openAnnounceForm(id) {
    var form = $('#announceForm');
    if (!form) { return; }
    var r = id ? findAnnouncement(id) : { level: 'info', status: 'published', pinned: false };
    editing.announcement = r && r._id ? r : null;
    announceField('_id').value = r._id || '';
    announceField('title').value = r.title || '';
    announceField('titleEn').value = r.titleEn || '';
    announceField('body').value = r.body || '';
    announceField('bodyEn').value = r.bodyEn || '';
    announceField('link').value = r.link || '';
    announceField('linkText').value = r.linkText || '';
    announceField('linkTextEn').value = r.linkTextEn || '';
    announceField('level').value = r.level || 'info';
    announceField('status').value = r.status || 'published';
    announceField('pinned').checked = !!r.pinned;
    $('#announceFormTitle').textContent = r._id ? t('编辑公告', 'Edit announcement') : t('新增公告', 'New announcement');
    form.hidden = false;
    announceField('title').focus();
  }

  function closeAnnounceForm() {
    var form = $('#announceForm');
    if (form) { form.hidden = true; }
    editing.announcement = null;
  }

  function saveAnnouncement() {
    var title = (announceField('title').value || '').trim();
    var body = (announceField('body').value || '').trim();
    var errEl = $('#announceFormError');
    if (!title) { errEl.textContent = t('标题不能为空。', 'Title is required.'); return; }
    if (title.length > 120) { errEl.textContent = t('标题请控制在 120 字以内。', 'Title must be under 120 characters.'); return; }
    if (body.length > 2000) { errEl.textContent = t('正文请控制在 2000 字以内。', 'Body must be under 2000 characters.'); return; }
    errEl.textContent = '';

    var payload = {
      _id: announceField('_id').value || undefined,
      title: title,
      titleEn: (announceField('titleEn').value || '').trim(),
      body: body,
      bodyEn: (announceField('bodyEn').value || '').trim(),
      link: (announceField('link').value || '').trim(),
      linkText: (announceField('linkText').value || '').trim(),
      linkTextEn: (announceField('linkTextEn').value || '').trim(),
      level: announceField('level').value,
      status: announceField('status').value,
      pinned: !!announceField('pinned').checked
    };

    var btn = $('#announceSave');
    btn.disabled = true;
    adminCall('admin.announcements.save', { announcement: payload }).then(function () {
      btn.disabled = false;
      OWL.ui.toast(t('已保存', 'Saved'));
      closeAnnounceForm();
      reloadPanel();
      if (OWL.site && OWL.site.announcements) { OWL.site.announcements.load(); }
    }).catch(function (e) {
      btn.disabled = false;
      errEl.textContent = OWL.errText(e);
    });
  }

  function loadAnnouncements() {
    loaded.announcements = true;
    var host = $('#announceList');
    if (host) { host.innerHTML = loadingRow(6); }
    return adminCall('admin.announcements.list', { limit: 200 }).then(function (d) {
      data.announcements = (d && d.items) ? d.items : [];
      renderAnnouncements();
    }).catch(function (e) { fail(e); if (host) { host.innerHTML = '<p class="state-note is-danger">' + esc(OWL.errText(e)) + '</p>'; } });
  }

  /* ---------------------------------------------------------------- 预约 */

  function resStatusOptions(cur) {
    var opts = [['pending', t('待处理', 'Pending')], ['confirmed', t('已确认', 'Confirmed')], ['done', t('已完成', 'Completed')], ['cancelled', t('已取消', 'Cancelled')]];
    var html = '';
    for (var i = 0; i < opts.length; i++) {
      html += '<option value="' + opts[i][0] + '"' + (cur === opts[i][0] ? ' selected' : '') + '>' + opts[i][1] + '</option>';
    }
    return html;
  }

  function renderReservations() {
    var host = $('#reservationList');
    if (!host) { return; }
    if (!data.reservations.length) {
      host.innerHTML = '<p class="state-note">' + t('还没有「我想要」记录。', 'No requests yet.') + '</p>';
      return;
    }
    var html = '<div class="table-wrap"><table class="data-table"><thead><tr>'
      + '<th>' + t('商品', 'Product') + '</th>'
      + '<th>' + t('联系人', 'Contact') + '</th>'
      + '<th>' + t('留言', 'Message') + '</th>'
      + '<th>' + t('时间', 'Time') + '</th>'
      + '<th>' + t('状态', 'Status') + '</th>'
      + '<th>' + t('操作', 'Actions') + '</th>'
      + '</tr></thead><tbody>';

    for (var i = 0; i < data.reservations.length; i++) {
      var r = data.reservations[i];
      html += '<tr>'
        + '<td>' + esc(r.productName || '—') + '</td>'
        + '<td>' + esc((r.name ? r.name + ' / ' : '') + (r.contact || '—')) + '</td>'
        + '<td class="cell-soft">' + esc(r.message || '—') + '</td>'
        + '<td class="cell-soft">' + esc(OWL.fmtDate(r.createdAt) || '—') + '</td>'
        + '<td><select class="mini-select" data-status="' + esc(r._id) + '">' + resStatusOptions(r.status || 'pending') + '</select></td>'
        + '<td class="cell-actions"><button class="btn btn-mini btn-danger" type="button" data-del="' + esc(r._id) + '">' + t('删除', 'Delete') + '</button></td>'
        + '</tr>';
    }
    html += '</tbody></table></div>';
    host.innerHTML = html;

    var sels = $$('#reservationList select[data-status]');
    for (var a = 0; a < sels.length; a++) {
      sels[a].addEventListener('change', function () {
        var id = this.getAttribute('data-status'), self = this;
        self.disabled = true;
        adminCall('admin.reservations.update', { reservationId: id, status: self.value }).then(function () {
          OWL.ui.toast(t('状态已更新', 'Status updated'));
          self.disabled = false;
        }).catch(function (e) { fail(e); self.disabled = false; reloadPanel(); });
      });
    }
    var dels = $$('#reservationList button[data-del]');
    for (var b = 0; b < dels.length; b++) {
      dels[b].addEventListener('click', function () {
        var id = this.getAttribute('data-del'), self = this;
        armed(self, function () {
          adminCall('admin.reservations.remove', { reservationId: id }).then(function () {
            OWL.ui.toast(t('已删除', 'Deleted'));
            reloadPanel();
          }).catch(function (e) { fail(e); self.disabled = false; });
        });
      });
    }
  }

  function loadReservations() {
    loaded.reservations = true;
    var host = $('#reservationList');
    if (host) { host.innerHTML = loadingRow(6); }
    return adminCall('admin.reservations.list', { limit: 200 }).then(function (d) {
      data.reservations = (d && d.items) ? d.items : [];
      renderReservations();
    }).catch(function (e) { fail(e); if (host) { host.innerHTML = '<p class="state-note is-danger">' + esc(OWL.errText(e)) + '</p>'; } });
  }

  /* ---------------------------------------------------------------- 渲染总入口 */

  function render() {
    if (!OWL.isConfigured()) {
      gate('<div class="card state-card"><h3>' + t('还没有配置云开发环境', 'CloudBase environment not configured yet') + '</h3>'
        + '<p>' + t('请按 docs/部署手册.md 完成部署，并把环境 ID 填入 assets/config.js。', 'Follow docs/部署手册.md to deploy, then fill the env ID into assets/config.js.') + '</p></div>');
      return;
    }
    if (OWL.auth.state.loading) {
      gate('<div class="card state-card"><div class="auth-spinner" aria-hidden="true"></div>'
        + '<p>' + t('正在确认登录状态…', 'Checking your sign-in status…') + '</p></div>');
      return;
    }
    var user = OWL.auth.user();
    if (!user) {
      gate('<div class="card state-card"><h3>' + t('请先登录', 'Please sign in first') + '</h3>'
        + '<p>' + t('管理后台仅对登录用户开放，且需要管理员身份。', 'The admin console requires an administrator account.') + '</p>'
        + '<div class="auth-actions"><button class="btn btn-primary" type="button" id="adminLogin">'
        + t('使用 Gitee 登录', 'Sign in with Gitee') + '</button></div></div>');
      var btn = $('#adminLogin');
      if (btn) {
        btn.addEventListener('click', function () {
          OWL.auth.login('admin.html').catch(function (e) { fail(e); });
        });
      }
      return;
    }
    if (!OWL.auth.isAdmin()) {
      gate('<div class="card state-card"><h3>' + t('没有管理员权限', 'Administrator access required') + '</h3>'
        + '<p>' + t('当前账号是普通会员。若你是首位登录者却看到本提示，请检查云函数环境变量 FIRST_USER_AS_ADMIN 与成员表中的 role 字段。',
          'Your account is a regular member. If you are the first signed-in user, check FIRST_USER_AS_ADMIN and the role field in the members collection.') + '</p>'
        + '<div class="auth-actions"><a class="btn" href="member.html">' + t('前往会员中心', 'Member center') + '</a>'
        + '<a class="btn btn-ghost" href="index.html">' + t('返回首页', 'Back home') + '</a></div></div>');
      return;
    }

    showApp();
    var who = $('#adminWho');
    if (who) {
      who.textContent = t('当前登录：', 'Signed in as ') + (user.nickname || user.giteeLogin || '') + '（' + (user.giteeLogin ? '@' + user.giteeLogin : '') + '）';
    }
    switchTab(activeTab);
  }

  function bindStatic() {
    var tabs = $$('.admin-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () { switchTab(this.getAttribute('data-tab')); });
    }
    var reload = $('#adminReload');
    if (reload) { reload.addEventListener('click', reloadPanel); }

    var newP = $('#productNew');
    if (newP) { newP.addEventListener('click', function () { openProductForm(null); }); }
    var saveP = $('#productSave');
    if (saveP) { saveP.addEventListener('click', saveProduct); }
    var cancelP = $('#productCancel');
    if (cancelP) { cancelP.addEventListener('click', closeProductForm); }

    var newA = $('#announceNew');
    if (newA) { newA.addEventListener('click', function () { openAnnounceForm(null); }); }
    var saveA = $('#announceSave');
    if (saveA) { saveA.addEventListener('click', saveAnnouncement); }
    var cancelA = $('#announceCancel');
    if (cancelA) { cancelA.addEventListener('click', closeAnnounceForm); }

    window.addEventListener('owl:lang-changed', function () {
      if (!OWL.auth.isAdmin()) { render(); return; }
      for (var k in loaded) {
        if (loaded[k]) { loadPanel(k); }
      }
    });
  }

  function saveAnnouncements_safe() { saveAnnouncement(); }

  function boot() {
    bindStatic();
    OWL.auth.ready.then(render);
    OWL.auth.onChange(function () { render(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
