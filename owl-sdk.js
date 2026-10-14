/* ==========================================================================
   猫头鹰教 The Owl Cult — assets/owl-sdk.js
   CloudBase 前端封装（无需打包，浏览器直接引用）

   对外暴露 window.OWL：
     OWL.cfg                 只读配置
     OWL.lang() / OWL.t()    中英双语取值（与站点现有语言状态共用 key）
     OWL.esc() / OWL.fmt.*   转义、日期与价格格式化
     OWL.ui.toast()          轻提示（复用站点 .toast 样式）
     OWL.call(action, data)  调用云函数 owl-api，返回 Promise，失败抛 OwlError
     OWL.session.*           本地会话令牌（localStorage）
     OWL.auth.*              登录态：ready / state / loginUrl / login / exchange / me / logout / onChange
     OWL.errText(err)        把错误转成当前语言的可读文案

   说明：本文件只含「前端可公开」的信息（环境 ID、函数名），
         Gitee Client Secret、CloudBase 自定义登录私钥等敏感信息一律只存在于云函数。
   ========================================================================== */

(function (window, document) {
  'use strict';

  var cfg = window.OWL_CONFIG || {};
  var LANG_KEY = 'owl-cult-lang';
  var SESSION_KEY = 'owl-cult-session';
  var REDIRECT_KEY = 'owl-cult-redirect';

  /* ======================================================================
     一、基础工具
     ====================================================================== */

  function isConfigured() {
    if (typeof cfg.isReady === 'function') { return cfg.isReady(); }
    var id = cfg.envId || '';
    return !!id && id.indexOf('REPLACE') !== 0 && id !== 'your-env-id';
  }

  function lang() {
    var v = null;
    try { v = window.localStorage.getItem(LANG_KEY); } catch (e) { v = null; }
    if (v === 'zh' || v === 'en') { return v; }
    var a = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    return a.indexOf('en') === 0 ? 'en' : 'zh';
  }

  function t(zh, en) { return lang() === 'en' ? en : zh; }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) {} }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** 把 时间戳 / 日期串 / Date 统一格式化成 YYYY-MM-DD */
  function fmtDate(v) {
    if (v === undefined || v === null || v === '') { return ''; }
    if (typeof v === 'string') {
      var m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) { return m[1] + '-' + m[2] + '-' + m[3]; }
      var p = Date.parse(v);
      if (isNaN(p)) { return v; }
      v = p;
    }
    if (typeof v === 'number') {
      if (v > 0 && v < 1e11) { v = v * 1000; }  /* 秒级时间戳兼容 */
      var d = new Date(v);
      if (isNaN(d.getTime())) { return ''; }
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    return '';
  }

  /** 价格：数字（元）→ ¥58 / ¥58.50；空值 → 面议 */
  function fmtPrice(v) {
    if (v === undefined || v === null || v === '' || isNaN(Number(v)) || Number(v) <= 0) {
      return t('面议', 'Contact us');
    }
    var n = Number(v);
    var s = (Math.round(n * 100) / 100).toString();
    return '¥' + s;
  }

  /* ======================================================================
     二、错误对象
     ====================================================================== */

  function OwlError(code, message, messageEn) {
    this.name = 'OwlError';
    this.code = code || 'UNKNOWN';
    this.message = message || '';
    this.messageEn = messageEn || message || '';
  }
  OwlError.prototype = Object.create(Error.prototype);
  OwlError.prototype.constructor = OwlError;

  var CODE_TEXT = {
    NOT_CONFIGURED: ['云开发环境尚未配置（请填写 assets/config.js 的 envId）', 'CloudBase environment is not configured yet'],
    SDK_LOAD_FAILED: ['CloudBase SDK 加载失败，请检查网络后重试', 'Failed to load the CloudBase SDK, please check your network'],
    NETWORK: ['网络异常或云函数未部署，请稍后重试', 'Network error or the cloud function is not deployed yet'],
    UNAUTHORIZED: ['请先登录', 'Please sign in first'],
    AUTH_REQUIRED: ['请先登录', 'Please sign in first'],
    FORBIDDEN: ['没有权限（需要管理员身份）', 'Permission denied (admin only)'],
    BANNED: ['账号已被禁用，请联系管理员', 'This account has been disabled'],
    BAD_REQUEST: ['请求参数不合法', 'Invalid request parameters'],
    NOT_FOUND: ['数据不存在', 'Not found'],
    CONFLICT: ['数据冲突，请刷新后重试', 'Data conflict, please refresh and retry'],
    SERVER_ERROR: ['服务器开小差了，请稍后重试', 'Server error, please try again later']
  };

  function errText(err) {
    if (!err) { return t('未知错误', 'Unknown error'); }
    var pair = CODE_TEXT[err.code];
    if (pair) { return t(pair[0], pair[1]); }
    var zh = err.message || '', en = err.messageEn || err.message || '';
    return t(zh || '操作失败', en || 'Operation failed');
  }

  function toOwlError(e) {
    if (e && e.name === 'OwlError') { return e; }
    var msg = (e && (e.message || e.msg)) ? String(e.message || e.msg) : '';
    /* SDK 抛出的错误里若带函数不存在 / 环境不存在等关键字，给出更具体的提示 */
    if (/function.*not.*(found|exist)/i.test(msg) || /env.*not.*exist/i.test(msg)) {
      return new OwlError('NETWORK', '云函数尚未部署或环境 ID 不正确：' + msg, 'Cloud function not deployed or wrong env ID: ' + msg);
    }
    return new OwlError('NETWORK', msg || '网络异常', msg || 'Network error');
  }

  /* ======================================================================
     三、SDK 加载与云函数调用
     ====================================================================== */

  var sdkPromise = null;
  var appInstance = null;
  var authInstance = null;

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.async = false;
      s.onload = function () { resolve(url); };
      s.onerror = function () { reject(new Error('script load failed: ' + url)); };
      document.head.appendChild(s);
    });
  }

  function ensureSdk() {
    if (sdkPromise) { return sdkPromise; }
    if (window.cloudbase && window.cloudbase.init) {
      sdkPromise = Promise.resolve(window.cloudbase);
      return sdkPromise;
    }
    var urls = (cfg.sdkUrls && cfg.sdkUrls.length)
      ? cfg.sdkUrls.slice()
      : ['https://static.cloudbase.net/cloudbase-js-sdk/2.28.6/cloudbase.full.js'];

    sdkPromise = (function next(i) {
      if (i >= urls.length) {
        return Promise.reject(new OwlError('SDK_LOAD_FAILED'));
      }
      return loadScript(urls[i]).then(function () {
        if (window.cloudbase && window.cloudbase.init) { return window.cloudbase; }
        return next(i + 1);
      }, function () {
        return next(i + 1);
      });
    })(0);

    return sdkPromise;
  }

  function getApp() {
    if (appInstance) { return Promise.resolve(appInstance); }
    if (!isConfigured()) { return Promise.reject(new OwlError('NOT_CONFIGURED')); }
    return ensureSdk().then(function () {
      appInstance = window.cloudbase.init({
        env: cfg.envId,
        region: cfg.region || 'ap-shanghai'
      });
      return appInstance;
    });
  }

  function getAuth() {
    if (authInstance) { return Promise.resolve(authInstance); }
    return getApp().then(function (app) {
      authInstance = app.auth();
      return authInstance;
    });
  }

  /**
   * 调用云函数。action 为动作名，payload 为参数对象。
   * 成功时 resolve 业务数据（后端信封 {ok:true,data:...} 里的 data），失败时 reject OwlError。
   */
  function call(action, payload) {
    if (!isConfigured()) { return Promise.reject(new OwlError('NOT_CONFIGURED')); }
    return getApp().then(function (app) {
      return app.callFunction({
        name: cfg.apiFunction || 'owl-api',
        data: { action: action, payload: payload || {} }
      });
    }).then(function (res) {
      var r = (res && res.result !== undefined) ? res.result : res;
      if (r === null || r === undefined) { throw new OwlError('SERVER_ERROR'); }
      if (typeof r === 'string') {
        try { r = JSON.parse(r); } catch (e) { throw new OwlError('SERVER_ERROR', r, r); }
      }
      if (r.ok === false) {
        throw new OwlError(r.code || 'SERVER_ERROR', r.message, r.messageEn);
      }
      return (r.data === undefined ? r : r.data);
    }).catch(function (e) {
      throw toOwlError(e);
    });
  }

  /* ======================================================================
     四、本地会话令牌
     ====================================================================== */

  var session = {
    token: function () { return lsGet(SESSION_KEY) || ''; },
    set: function (token) { if (token) { lsSet(SESSION_KEY, token); } },
    clear: function () { lsDel(SESSION_KEY); }
  };

  function redirectTarget() { return lsGet(REDIRECT_KEY) || ''; }
  function rememberRedirect(href) {
    if (!href) { return; }
    if (/^(https?:)?\/\//i.test(href)) { return; }   /* 只记站内相对地址，防开放重定向 */
    lsSet(REDIRECT_KEY, href);
  }

  /* ======================================================================
     五、登录态
     ====================================================================== */

  var state = { user: null, loading: true, configured: isConfigured() };
  var listeners = [];
  var restorePromise = null;

  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](state); } catch (e) { /* 单个监听器出错不影响其它 */ }
    }
  }

  function setUser(u) {
    state.user = u || null;
    emit();
  }

  function isAdmin() {
    return !!(state.user && state.user.role === 'admin' && state.user.status !== 'banned');
  }

  /** 用自定义登录凭证换取 CloudBase 登录态（失败也不影响本站自有会话） */
  function signInWithTicket(token) {
    return getAuth().then(function (auth) {
      if (auth.hasLoginState && auth.hasLoginState()) { return null; }
      return auth.setCustomSignFunc(function () {
        return call('auth.ticket', { sessionToken: token }).then(function (d) {
          return d && d.ticket;
        });
      }).then(function () {
        return auth.signInWithCustomTicket();
      });
    }).catch(function () { return null; });   /* 静默降级：本站接口仅依赖 sessionToken */
  }

  function restore() {
    if (restorePromise) { return restorePromise; }

    restorePromise = (function () {
      if (!isConfigured()) {
        state.loading = false;
        state.configured = false;
        emit();
        return Promise.resolve(state);
      }
      var token = session.token();
      if (!token) {
        state.loading = false;
        emit();
        return Promise.resolve(state);
      }
      return call('auth.me', { sessionToken: token }).then(function (d) {
        if (!d || !d.user) { throw new OwlError('UNAUTHORIZED'); }
        setUser(d.user);
        state.loading = false;
        emit();
        return signInWithTicket(token).then(function () { return state; });
      }).catch(function (e) {
        var code = e && e.code;
        /* 只有身份类错误才清理令牌；网络类错误保留令牌，等下次再试 */
        if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN' || code === 'NOT_FOUND') {
          session.clear();
        }
        state.loading = false;
        setUser(null);
        return state;
      });
    })();

    return restorePromise;
  }

  var auth = {
    /** 返回 Promise，resolve 时登录态已就绪（供各页面使用） */
    get ready() { return restore(); },
    state: state,
    isConfigured: isConfigured,
    isAdmin: isAdmin,
    user: function () { return state.user; },
    token: session.token,

    onChange: function (fn) {
      if (typeof fn !== 'function') { return; }
      listeners.push(fn);
      if (!state.loading) { try { fn(state); } catch (e) {} }
    },

    /** 取 Gitee 授权跳转地址（state 由云函数签名，前端不接触密钥） */
    loginUrl: function (redirect) {
      return call('auth.loginUrl', { redirect: redirect || '' });
    },

    /** 直接跳转到 Gitee 授权页 */
    login: function (redirect) {
      rememberRedirect(redirect);
      return auth.loginUrl(redirect).then(function (d) {
        if (!d || !d.url) { throw new OwlError('SERVER_ERROR'); }
        window.location.href = d.url;
        return d.url;
      });
    },

    /** Gitee 回调：用 code 换回本站会话（login.html 使用） */
    exchange: function (code, st) {
      return call('auth.callback', { code: code, state: st }).then(function (d) {
        if (!d || !d.sessionToken) { throw new OwlError('SERVER_ERROR'); }
        session.set(d.sessionToken);
        state.loading = false;
        setUser(d.user || null);
        return signInWithTicket(d.sessionToken).then(function () { return d; });
      });
    },

    me: function () {
      var token = session.token();
      if (!token) { return Promise.resolve(null); }
      return call('auth.me', { sessionToken: token }).then(function (d) {
        setUser(d && d.user ? d.user : null);
        return state.user;
      });
    },

    logout: function () {
      var token = session.token();
      var p = token ? call('auth.logout', { sessionToken: token }) : Promise.resolve(null);
      return p.catch(function () { return null; }).then(function () {
        session.clear();
        setUser(null);
        return getAuth().then(function (a) {
          return (a && a.signOut) ? a.signOut().catch(function () {}) : null;
        }).catch(function () { return null; });
      });
    },

    redirectTarget: redirectTarget,
    clearRedirect: function () { lsDel(REDIRECT_KEY); }
  };

  /* ======================================================================
     六、轻提示 / 小工具
     ====================================================================== */

  var toastEl = null, toastTimer = null;
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
    toastTimer = window.setTimeout(function () { toastEl.classList.remove('show'); }, 3000);
  }

  /** 极简元素创建：el('div', 'class', html) */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (html !== undefined) { n.innerHTML = html; }
    return n;
  }

  /* ======================================================================
     七、对外暴露
     ====================================================================== */

  window.OWL = {
    cfg: cfg,
    isConfigured: isConfigured,
    lang: lang,
    t: t,
    esc: esc,
    fmtDate: fmtDate,
    fmtPrice: fmtPrice,
    call: call,
    session: session,
    auth: auth,
    errText: errText,
    error: function (code, zh, en) { return new OwlError(code, zh, en); },
    ui: { toast: toast, el: el },
    util: { pad2: pad2, lsGet: lsGet, lsSet: lsSet, lsDel: lsDel }
  };
})(window, document);
