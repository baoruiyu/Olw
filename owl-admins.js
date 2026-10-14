/* ==========================================================================
   猫头鹰教 The Owl Cult — owl-admins.js
   管理员账号（本地账号体系）

   对外暴露 window.OWLADMIN：
     OWLADMIN.init()                      → Promise，确保内置管理员已写入
     OWLADMIN.list()                      → 全部管理员账号（不含密码散列）
     OWLADMIN.register({ nameEn, password })
                                          → Promise<{ok, user} | {ok:false, code, message}>
     OWLADMIN.login({ nameEn, password }) → Promise<{ok, user} | {ok:false, ...}>
     OWLADMIN.current()                   → 当前登录的管理员（会话内）
     OWLADMIN.logout()
     OWLADMIN.changePassword({ nameEn, oldPassword, newPassword })

   ┌──────────────────────────────────────────────────────────────────────┐
   │ 内置管理员（首次运行时自动写入，无需注册）                            │
   │   英文名  ：Harmony                                                  │
   │   身份    ：admin                                                    │
   │   加入时间：2026-06-01                                                │
   │   初始密码：见下方 BUILTIN.password（不在页面上公示）                 │
   └──────────────────────────────────────────────────────────────────────┘
   登录后请立刻到「账号 → 修改我的密码」改掉初始密码。

   ⚠ 重要：账号仅保存在「本机浏览器」里
     · 管理员账号与密码都存在 localStorage，只对当前这台设备 + 当前浏览器有效。
     · 换浏览器、换设备、或清除浏览器数据后，改过的密码与新增的账号都会消失，
       内置管理员会回到初始密码。
     · 密码不会同步到任何服务器，本站也不联网。
     · 如需跨设备共用账号，必须接入服务端账号体系。

   密码以 SHA-256 加盐散列保存，不存明文。
   说明：按需求「不考虑安全性问题」，这是前端演示用的账号体系，
        真正的权限校验应当在服务端完成。
   ========================================================================== */

(function (window) {
  'use strict';

  var ID = window.OWLID;
  if (!ID) { return; }

  var STORE_KEY = 'owl-cult-admins';
  var SESSION_KEY = 'owl-cult-admin-session';

  /* 内置管理员：加入日期为 2026 年 6 月 1 日 */
  var BUILTIN = {
    nameEn: 'Harmony',
    role: 'admin',
    joinedAt: '2026-06-01',
    password: '1234',   /* 初始密码：仅存于此文件，页面上不公示 */
    builtin: true
  };

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }

  function err(code, zh, en) {
    return { ok: false, code: code, message: zh, messageEn: en || zh };
  }

  /* ---------------------------------------------------------------- 散列 */

  /** 密码散列：SHA-256(salt + ':' + password)，十六进制 */
  function hashPassword(password, salt) {
    var bytes = ID._internal.utf8Bytes(salt + ':' + password);
    return Promise.resolve(ID._internal.bytesToHex(ID._internal.sha256Bytes(bytes)));
  }

  function newSalt() {
    var a = new Uint8Array(8);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(a);
    } else {
      for (var i = 0; i < a.length; i++) { a[i] = Math.floor(Math.random() * 256); }
    }
    return ID._internal.bytesToHex(a);
  }

  /* ---------------------------------------------------------------- 存储 */

  function readAll() {
    var raw = lsGet(STORE_KEY);
    if (!raw) { return []; }
    try {
      var list = JSON.parse(raw);
      return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
    } catch (e) {
      return [];
    }
  }

  function writeAll(list) {
    lsSet(STORE_KEY, JSON.stringify(list));
  }

  /** 对外展示时去掉密码散列与盐 */
  function publicView(rec) {
    if (!rec) { return null; }
    return {
      nameEn: rec.nameEn,
      role: rec.role || 'admin',
      isAdmin: true,
      joinedAt: rec.joinedAt,
      builtin: !!rec.builtin,
      createdAt: rec.createdAt || ''
    };
  }

  /**
   * 确保内置管理员存在。
   * 只在「同名账号还不存在」时写入，不会覆盖已修改的密码。
   */
  function init() {
    var list = readAll();
    var has = false;
    for (var i = 0; i < list.length; i++) {
      if (normName(list[i].nameEn) === normName(BUILTIN.nameEn)) { has = true; break; }
    }
    if (has) { return Promise.resolve(list); }

    var salt = newSalt();
    return hashPassword(BUILTIN.password, salt).then(function (h) {
      list.push({
        nameEn: BUILTIN.nameEn,
        role: BUILTIN.role,
        joinedAt: BUILTIN.joinedAt,
        salt: salt,
        hash: h,
        builtin: true,
        createdAt: BUILTIN.joinedAt
      });
      writeAll(list);
      return list;
    });
  }

  function list() {
    var out = [];
    var all = readAll();
    for (var i = 0; i < all.length; i++) { out.push(publicView(all[i])); }
    return out;
  }

  function normName(v) {
    return String(v == null ? '' : v).trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function find(nameEn) {
    var target = normName(nameEn);
    var all = readAll();
    for (var i = 0; i < all.length; i++) {
      if (normName(all[i].nameEn) === target) { return all[i]; }
    }
    return null;
  }

  /* 账号名校验：与标识符的英文名规则保持一致（允许空格，例如 Lin Yue） */
  var NAME_RE = /^[A-Za-z0-9 .'_-]{2,64}$/;

  function validateName(nameEn) {
    var n = String(nameEn || '').trim();
    if (!n) {
      return err('BAD_REQUEST', '请填写管理员英文名。', 'Please enter an administrator name.');
    }
    /* 连续空格归一化，避免 "Lin  Yue" 与 "Lin Yue" 被当成两个账号 */
    n = n.replace(/\s+/g, ' ');
    if (!NAME_RE.test(n)) {
      return err('BAD_REQUEST',
        '英文名只能包含英文字母、数字、空格与 . \' - _ ，长度 2–64 位。',
        'The name may only contain letters, digits, spaces and . \' - _ (2–64 chars).');
    }
    return null;
  }

  function validatePassword(pw) {
    if (!pw || String(pw).length < 6) {
      return err('BAD_REQUEST', '密码至少 6 位。', 'The password must be at least 6 characters.');
    }
    return null;
  }

  /** 注册新的管理员账号 */
  function register(fields) {
    var nameErr = validateName(fields && fields.nameEn);
    if (nameErr) { return Promise.resolve(nameErr); }
    var pwErr = validatePassword(fields && fields.password);
    if (pwErr) { return Promise.resolve(pwErr); }

    var name = String(fields.nameEn).trim().replace(/\s+/g, ' ');

    return init().then(function () {
      if (find(name)) {
        return err('CONFLICT', '该管理员账号已存在：' + name, 'That administrator already exists: ' + name);
      }
      var salt = newSalt();
      var password = String(fields.password);
      return hashPassword(password, salt).then(function (h) {
        var list = readAll();
        var now = ID.todayStr();
        var rec = {
          nameEn: name,
          role: 'admin',
          joinedAt: fields.joinedAt ? ID.normDate(fields.joinedAt) : now,
          salt: salt,
          hash: h,
          builtin: false,
          createdAt: now
        };
        list.push(rec);
        writeAll(list);
        return { ok: true, user: publicView(rec) };
      });
    });
  }

  /** 管理员登录 */
  function login(fields) {
    var nameErr = validateName(fields && fields.nameEn);
    if (nameErr) { return Promise.resolve(nameErr); }
    if (!fields || !fields.password) {
      return Promise.resolve(err('BAD_REQUEST', '请输入密码。', 'Please enter the password.'));
    }

    return init().then(function () {
      var rec = find(fields.nameEn);
      if (!rec) {
        return err('NOT_FOUND', '没有找到这个管理员账号。', 'No such administrator account.');
      }
      return hashPassword(String(fields.password), rec.salt).then(function (h) {
        if (h !== rec.hash) {
          return err('UNAUTHORIZED', '密码不正确。', 'Incorrect password.');
        }
        var user = publicView(rec);
        user.loginAt = Date.now();
        lsSet(SESSION_KEY, JSON.stringify(user));
        return { ok: true, user: user };
      });
    });
  }

  function current() {
    var raw = lsGet(SESSION_KEY);
    if (!raw) { return null; }
    try {
      var u = JSON.parse(raw);
      return (u && u.nameEn) ? u : null;
    } catch (e) {
      return null;
    }
  }

  function logout() {
    try { window.localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  /** 修改密码 */
  function changePassword(fields) {
    var rec = find(fields && fields.nameEn);
    if (!rec) {
      return Promise.resolve(err('NOT_FOUND', '没有找到这个管理员账号。', 'No such administrator account.'));
    }
    var pwErr = validatePassword(fields && fields.newPassword);
    if (pwErr) { return Promise.resolve(pwErr); }

    return hashPassword(String(fields.oldPassword || ''), rec.salt).then(function (h) {
      if (h !== rec.hash) {
        return err('UNAUTHORIZED', '原密码不正确。', 'The current password is incorrect.');
      }
      var salt = newSalt();
      return hashPassword(String(fields.newPassword), salt).then(function (nh) {
        var all = readAll();
        for (var i = 0; i < all.length; i++) {
          if (normName(all[i].nameEn) === normName(rec.nameEn)) {
            all[i].salt = salt;
            all[i].hash = nh;
            break;
          }
        }
        writeAll(all);
        return { ok: true };
      });
    });
  }

  window.OWLADMIN = {
    BUILTIN_NAME: BUILTIN.nameEn,
    BUILTIN_JOINED: BUILTIN.joinedAt,
    init: init,
    list: list,
    find: find,
    register: register,
    login: login,
    current: current,
    logout: logout,
    changePassword: changePassword,
    _internal: { hashPassword: hashPassword, newSalt: newSalt, readAll: readAll, normName: normName }
  };

})(window);
