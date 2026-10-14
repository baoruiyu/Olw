/* ==========================================================================
   猫头鹰教 The Owl Cult — assets/owl-id.js
   个人唯一身份标识符（Owl ID）：两类标识符的构造、解析与校验

   ┌──────────────────────────────────────────────────────────────────────┐
   │ 本站共有「两类」标识符，前缀不同，用途严格区分，不可混用：            │
   │                                                                      │
   │  ① 登录标识符（OWL1）—— 会员登录用，由管理员在后台签发。             │
   │     OWL1|<英文名>|<角色>|<加入日期>|<校验码>                          │
   │     例：OWL1|Your Name|member|2026-01-01|0000000000000000                   │
   │                                                                      │
   │  ② 申请标识符（OWLR）—— 访客在注册界面填资料后本地生成，              │
   │     不能用于登录，只发给管理员作为「入会申请」。                      │
   │     OWLR|<英文名>|<期望身份>|<申请日期>|<校验码>                      │
   │     例：OWLR|Your Name|member|2026-01-01|0000000000000000            │
   └──────────────────────────────────────────────────────────────────────┘

   对外暴露 window.OWLID：
     OWLID.build({ nameEn, isAdmin, joinedAt })   → 构造「登录」标识符（管理员用）
     OWLID.buildRequest({ nameEn, isAdmin })      → 构造「申请」标识符（访客用）
     OWLID.verify(text)                           → 校验任意一类标识符
     OWLID.verifyLogin(text)                      → 只接受 OWL1（登录页使用）
     OWLID.parseRequest(text)                     → 只接受 OWLR（管理后台使用）
     OWLID.kindOf(text)                           → 'login' | 'request' | null
     OWLID.payloadOf(fields)                      → 待签名的规范化字符串
     OWLID.checksum(payload)                      → Promise<16 位十六进制校验码>
     OWLID.groupChecksum(sum)                     → 校验码四位分组显示

   字段说明：
     · 英文名   nameEn    英文字母、数字、空格与 . ' - _
     · 角色     role      admin（管理员）或 member（会员）
     · 日期     joinedAt  YYYY-MM-DD（申请标识符中为申请日期）
     · 校验码   checksum  HMAC-SHA-256 截断为 16 位十六进制（大写）

   校验码采用 HMAC-SHA-256：
     · 浏览器原生 Web Crypto（crypto.subtle）可用时优先使用
     · 在非安全上下文（http:// 或 file:// 某些浏览器）下 crypto.subtle 不可用，
       自动退回到本文件内置的纯 JS SHA-256 / HMAC 实现，保证功能始终可用

   说明：本文件为纯前端实现，密钥内置。按需求「不考虑安全性问题」，
         它用于防止手抄/转录出错，不作为防伪造的凭据。
   ========================================================================== */

(function (window) {
  'use strict';

  /* ======================================================================
     一、常量
     ====================================================================== */

  var PREFIX = 'OWL1';          /* 登录标识符前缀 */
  var PREFIX_REQ = 'OWLR';      /* 申请标识符前缀（不可用于登录） */
  var SECRET = 'owl-cult-identity-v1';      /* 内置密钥（演示用） */
  var SECRET_REQ = 'owl-cult-request-v1';   /* 申请标识符使用独立密钥 */
  var CHECKSUM_LEN = 16;                    /* 校验码十六进制位数 */

  /* 英文字段允许的字符：字母、数字、空格、连字符、撇号、点、下划线 */
  var NAME_RE = /^[A-Za-z0-9 .'_-]{1,64}$/;
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function err(code, zh, en) {
    return { code: code, message: zh, messageEn: en || zh };
  }

  /* ======================================================================
     二、纯 JS SHA-256 与 HMAC（Web Crypto 不可用时的回退实现）
     ====================================================================== */

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

  /** 把字符串按 UTF-8 转成字节数组 */
  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) {
        out.push(c);
      } else if (c < 0x800) {
        out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
      } else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
        var c2 = str.charCodeAt(i + 1);
        var cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
        i++;
        out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F),
                 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
      } else {
        out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      }
    }
    return out;
  }

  /** 纯 JS SHA-256，输入/输出均为字节数组 */
  function sha256Bytes(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
             0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

    var msg = bytes.slice();
    var bitLen = bytes.length * 8;
    msg.push(0x80);
    while (msg.length % 64 !== 56) { msg.push(0); }
    /* 64 位长度（高 32 位 + 低 32 位，大端） */
    var hi = Math.floor(bitLen / 0x100000000);
    msg.push((hi >>> 24) & 0xFF, (hi >>> 16) & 0xFF, (hi >>> 8) & 0xFF, hi & 0xFF);
    msg.push((bitLen >>> 24) & 0xFF, (bitLen >>> 16) & 0xFF, (bitLen >>> 8) & 0xFF, bitLen & 0xFF);

    var w = new Array(64);
    for (var off = 0; off < msg.length; off += 64) {
      var i;
      for (i = 0; i < 16; i++) {
        w[i] = ((msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16)
              | (msg[off + i * 4 + 2] << 8) | (msg[off + i * 4 + 3])) >>> 0;
      }
      for (i = 16; i < 64; i++) {
        var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }

      var a = H[0], b = H[1], c = H[2], d = H[3];
      var e = H[4], f = H[5], g = H[6], h = H[7];

      for (i = 0; i < 64; i++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ ((~e) & g);
        var t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }

      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }

    var out = [];
    for (var j = 0; j < 8; j++) {
      out.push((H[j] >>> 24) & 0xFF, (H[j] >>> 16) & 0xFF, (H[j] >>> 8) & 0xFF, H[j] & 0xFF);
    }
    return out;
  }

  /** 纯 JS HMAC-SHA-256 */
  function hmacSha256Bytes(keyBytes, msgBytes) {
    var blockSize = 64;
    var key = keyBytes.slice();
    if (key.length > blockSize) { key = sha256Bytes(key); }
    while (key.length < blockSize) { key.push(0); }

    var oKey = [], iKey = [];
    for (var i = 0; i < blockSize; i++) {
      oKey.push(key[i] ^ 0x5C);
      iKey.push(key[i] ^ 0x36);
    }
    var inner = sha256Bytes(iKey.concat(msgBytes));
    return sha256Bytes(oKey.concat(inner));
  }

  function bytesToHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
      s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    }
    return s;
  }

  /* ======================================================================
     三、HMAC-SHA-256（优先 Web Crypto，失败回退纯 JS）
     ====================================================================== */

  var subtle = (window.crypto && window.crypto.subtle) ? window.crypto.subtle : null;

  /** 统一的 HMAC-SHA-256，返回十六进制小写字符串 */
  function hmacHex(message, secret) {
    var keyBytes = utf8Bytes(secret || SECRET);

    if (subtle && subtle.importKey) {
      return subtle.importKey('raw', new Uint8Array(keyBytes),
          { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
        .then(function (key) {
          return subtle.sign('HMAC', key, new Uint8Array(utf8Bytes(message)));
        })
        .then(function (sig) {
          return bytesToHex(new Uint8Array(sig));
        })
        .catch(function () {
          /* 出错就用纯 JS 兜底，保证功能可用 */
          return bytesToHex(hmacSha256Bytes(keyBytes, utf8Bytes(message)));
        });
    }

    /* 非安全上下文：直接使用内置实现 */
    return Promise.resolve(bytesToHex(hmacSha256Bytes(keyBytes, utf8Bytes(message))));
  }

  /* ======================================================================
     四、字段规范化与校验码
     ====================================================================== */

  /** 角色：'admin' | 'member' */
  function normRole(isAdmin) {
    return isAdmin ? 'admin' : 'member';
  }

  /** 把各种日期写法统一成 YYYY-MM-DD */
  function normDate(v) {
    if (v === undefined || v === null || v === '') { return ''; }
    if (typeof v === 'number') {
      if (v > 0 && v < 1e11) { v = v * 1000; }
      var d = new Date(v);
      if (isNaN(d.getTime())) { return ''; }
      return d.getFullYear() + '-'
        + ('0' + (d.getMonth() + 1)).slice(-2) + '-'
        + ('0' + d.getDate()).slice(-2);
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) {
      return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    }
    var p = Date.parse(s);
    if (!isNaN(p)) {
      var dd = new Date(p);
      return dd.getFullYear() + '-'
        + ('0' + (dd.getMonth() + 1)).slice(-2) + '-'
        + ('0' + dd.getDate()).slice(-2);
    }
    return s;
  }

  /**
   * 生成待签名的规范化字符串。
   * 字段之间用 '|' 连接，顺序固定，避免歧义。
   * prefix 决定这是登录标识符（OWL1）还是申请标识符（OWLR）。
   */
  function payloadOf(fields, prefix) {
    var name = String(fields.nameEn || '').trim().replace(/\s+/g, ' ');
    var role = fields.role || normRole(fields.isAdmin);
    var joined = normDate(fields.joinedAt);
    return [prefix || PREFIX, name, role, joined].join('|');
  }

  /**
   * 计算校验码（16 位十六进制大写）。
   * 两类标识符使用各自独立的密钥，因此申请标识符的校验码
   * 不可能与登录标识符互相冒充。
   */
  function checksum(payload) {
    var isReq = String(payload || '').indexOf(PREFIX_REQ + '|') === 0;
    return hmacHex(payload, isReq ? SECRET_REQ : SECRET).then(function (hex) {
      return hex.slice(0, CHECKSUM_LEN).toUpperCase();
    });
  }

  /** 由字段构造完整标识符 */
  function encodeFields(fields) {
    var name = String(fields.nameEn || '').trim().replace(/\s+/g, ' ');
    if (!NAME_RE.test(name)) {
      return Promise.reject(err('BAD_REQUEST',
        '英文名只能包含英文字母、数字、空格和 . \' - _ 且不超过 64 个字符',
        'The English name may only contain letters, digits, spaces and . \' - _ (max 64 chars)'));
    }
    var joined = normDate(fields.joinedAt);
    if (!DATE_RE.test(joined)) {
      return Promise.reject(err('BAD_REQUEST',
        '加入时间需要是 YYYY-MM-DD 格式',
        'The join date must be in YYYY-MM-DD format'));
    }

    var clean = { nameEn: name, role: normRole(fields.isAdmin), joinedAt: joined };
    var payload = payloadOf(clean);
    return checksum(payload).then(function (sum) {
      return payload + '|' + sum;
    });
  }

  /** build 的别名，语义更直白 */
  function build(fields) { return encodeFields(fields); }

  /**
   * 构造「申请标识符」（OWLR）—— 访客在注册界面使用。
   * 申请标识符不能用于登录，只能发给管理员作为入会申请。
   * 日期固定取「当天」，无需访客填写。
   */
  function buildRequest(fields) {
    var name = String(fields.nameEn || '').trim().replace(/\s+/g, ' ');
    if (!NAME_RE.test(name)) {
      return Promise.reject(err('BAD_REQUEST',
        '英文名只能包含英文字母、数字、空格和 . \' - _ 且不超过 64 个字符',
        'The English name may only contain letters, digits, spaces and . \' - _ (max 64 chars)'));
    }
    var applied = fields.appliedAt ? normDate(fields.appliedAt) : todayStr();
    if (!DATE_RE.test(applied)) {
      return Promise.reject(err('BAD_REQUEST',
        '申请日期需要是 YYYY-MM-DD 格式',
        'The application date must be in YYYY-MM-DD format'));
    }
    var clean = { nameEn: name, role: normRole(fields.isAdmin), joinedAt: applied };
    var payload = payloadOf(clean, PREFIX_REQ);
    return checksum(payload).then(function (sum) {
      return payload + '|' + sum;
    });
  }

  /** 今天（本地时区）的 YYYY-MM-DD */
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ======================================================================
     五、解析与校验
     ====================================================================== */

  /**
   * 解析标识符文本（通用）。
   * 容错处理：去掉首尾空白、把中文全角竖线「｜」当作分隔符、
   * 校验码大小写不敏感，方便用户手抄或从别处粘贴。
   */
  function splitText(text) {
    var s = String(text == null ? '' : text).trim();
    s = s.replace(/｜/g, '|');                 /* 全角竖线 */
    s = s.replace(/[\r\n\t]+/g, '');           /* 换行与制表符 */
    s = s.replace(/\s*\|\s*/g, '|');           /* 分隔符两侧空白 */
    return s.split('|');
  }

  /** 判断标识符属于哪一类：'login'（OWL1）| 'request'（OWLR）| null */
  function kindOf(text) {
    var parts = splitText(text);
    if (!parts.length) { return null; }
    var head = String(parts[0] || '').toUpperCase();
    if (head === PREFIX) { return 'login'; }
    if (head === PREFIX_REQ) { return 'request'; }
    return null;
  }

  /**
   * 解析任意一类标识符。expect 可限定只接受 'login' 或 'request'。
   * 返回 {ok:true, data} 或 {code, message, messageEn}。
   */
  function parseSync(text, expect) {
    var parts = splitText(text);

    if (parts.length !== 5) {
      return err('BAD_REQUEST',
        '标识符应为 5 段（前缀|英文名|身份|日期|校验码），当前为 ' + parts.length + ' 段',
        'The identifier must have 5 parts (prefix|name|role|date|checksum); got ' + parts.length);
    }

    var head = String(parts[0] || '').toUpperCase();
    var kind = (head === PREFIX) ? 'login' : ((head === PREFIX_REQ) ? 'request' : null);

    if (!kind) {
      return err('BAD_REQUEST',
        '标识符前缀不是 ' + PREFIX + ' 或 ' + PREFIX_REQ + '，当前为「' + head + '」',
        'The identifier prefix is neither ' + PREFIX + ' nor ' + PREFIX_REQ + ', got "' + head + '"');
    }

    /* 调用方限定了类型时，给出明确的类型错误，便于页面提示 */
    if (expect && kind !== expect) {
      if (expect === 'login' && kind === 'request') {
        return err('WRONG_KIND',
          '这是「入会申请标识符」（' + PREFIX_REQ + '），不能用于登录。请把它发给管理员完成入会。',
          'This is an application code (' + PREFIX_REQ + ') and cannot be used to sign in. Send it to the administrator to join.');
      }
      if (expect === 'request' && kind === 'login') {
        return err('WRONG_KIND',
          '这是「登录标识符」（' + PREFIX + '），不是入会申请。',
          'This is a sign-in code (' + PREFIX + '), not an application code.');
      }
      return err('WRONG_KIND', '标识符类型不符。', 'Unexpected identifier type.');
    }

    var name = parts[1].trim();
    var role = parts[2].trim().toLowerCase();
    var date = parts[3].trim();
    var sum = parts[4].trim().toUpperCase();

    if (!NAME_RE.test(name)) {
      return err('BAD_REQUEST', '英文名不合法：' + name, 'Invalid English name: ' + name);
    }
    if (role !== 'admin' && role !== 'member') {
      return err('BAD_REQUEST',
        '身份只能是 admin 或 member，当前为「' + role + '」',
        'The role must be admin or member, got "' + role + '"');
    }
    if (!DATE_RE.test(date)) {
      return err('BAD_REQUEST', '日期格式不正确：' + date, 'Invalid date: ' + date);
    }
    if (!/^[0-9A-F]{16}$/.test(sum)) {
      return err('BAD_REQUEST',
        '校验码应为 16 位十六进制字符，当前为「' + sum + '」',
        'The checksum must be 16 hex characters, got "' + sum + '"');
    }

    return {
      ok: true,
      data: {
        kind: kind,
        prefix: head,
        nameEn: name,
        role: role,
        isAdmin: role === 'admin',
        joinedAt: date,
        appliedAt: (kind === 'request') ? date : '',
        checksum: sum,
        payload: [head, name, role, date].join('|')
      }
    };
  }

  /**
   * 解析 + 校验校验码。
   * expect 可限定只接受 'login' 或 'request'。
   * 返回 Promise<{ok:true, data} | {ok:false, code, message, messageEn}>。
   */
  function verify(text, expect) {
    var parsed = parseSync(text, expect);
    if (parsed.code) {
      return Promise.resolve({
        ok: false, code: parsed.code,
        message: parsed.message, messageEn: parsed.messageEn
      });
    }
    var d = parsed.data;
    return checksum(d.payload).then(function (expectSum) {
      if (expectSum !== d.checksum) {
        return {
          ok: false,
          code: 'BAD_CHECKSUM',
          message: '校验码不匹配（期望 ' + expectSum + '，实际 ' + d.checksum + '），标识符可能被改动或抄错',
          messageEn: 'Checksum mismatch (expected ' + expectSum + ', got ' + d.checksum + ')',
          data: d,
          expected: expectSum
        };
      }
      return { ok: true, data: d };
    });
  }

  /** 只接受登录标识符（登录页使用） */
  function verifyLogin(text) { return verify(text, 'login'); }

  /** 只接受申请标识符（管理后台使用） */
  function verifyRequest(text) { return verify(text, 'request'); }

  /** 只解析不校验 */
  function parse(text) {
    var parsed = parseSync(text);
    if (parsed.code) {
      return Promise.resolve({
        ok: false, code: parsed.code,
        message: parsed.message, messageEn: parsed.messageEn
      });
    }
    return Promise.resolve({ ok: true, data: parsed.data });
  }

  /* ======================================================================
     六、展示辅助
     ====================================================================== */

  /** 校验码分组显示：A3F9C2E1B7D4 → A3F9-C2E1-B7D4 */
  function groupChecksum(sum) {
    var s = String(sum || '');
    return s.replace(/(.{4})(?=.)/g, '$1-');
  }

  /** 角色文案 */
  function roleLabel(role, lang) {
    var isEn = lang === 'en';
    if (role === 'admin') { return isEn ? 'Administrator' : '管理员'; }
    return isEn ? 'Member' : '会员';
  }

  /* ======================================================================
     七、对外暴露
     ====================================================================== */

  window.OWLID = {
    PREFIX: PREFIX,
    PREFIX_REQ: PREFIX_REQ,
    CHECKSUM_LEN: CHECKSUM_LEN,
    /* 登录标识符（OWL1）—— 管理员签发 */
    build: build,
    encodeFields: encodeFields,
    /* 申请标识符（OWLR）—— 访客注册时本地生成 */
    buildRequest: buildRequest,
    /* 通用解析与校验 */
    parse: parse,
    verify: verify,
    verifyLogin: verifyLogin,
    verifyRequest: verifyRequest,
    kindOf: kindOf,
    parseSync: parseSync,
    payloadOf: payloadOf,
    checksum: checksum,
    normDate: normDate,
    todayStr: todayStr,
    groupChecksum: groupChecksum,
    roleLabel: roleLabel,
    _internal: {
      sha256Bytes: sha256Bytes,
      hmacSha256Bytes: hmacSha256Bytes,
      hmacHex: hmacHex,
      utf8Bytes: utf8Bytes,
      bytesToHex: bytesToHex
    }
  };

})(window);
