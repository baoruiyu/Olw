/* ==========================================================================
   猫头鹰教 The Owl Cult — assets/qr.js
   纯本地二维码引擎（零依赖、零联网）：编码器 + 解码器

   对外暴露 window.OWLQR：
     OWLQR.encode(text, opts)       → { size, modules, text }  modules 为二维布尔数组
     OWLQR.toCanvas(text, canvas)   → 把二维码画到 <canvas>
     OWLQR.toSvg(text)              → 返回 SVG 字符串
     OWLQR.decodeImageData(imgData) → 从 ImageData 识别文本，失败返回 null
     OWLQR.decodeCanvas(canvas)     → 从 <canvas> 识别文本
     OWLQR.decodeFile(file)         → 从上传的图片文件识别（返回 Promise）

   实现说明：
     · 编码支持字节模式（UTF-8）+ 纠错等级 L/M/Q/H，自动选版本（1–40）
     · 解码为「定位图案 → 透视校正 → 采样 → 去掩码 → 纠错 → 取数据」的完整流程
     · 纠错采用 GF(256) 上的 Reed–Solomon，编码用生成多项式除法，
       解码用 Berlekamp–Massey + Chien 搜索 + Forney 算法
   ========================================================================== */

(function (window) {
  'use strict';

  /* ======================================================================
     一、GF(256) 伽罗华域运算（Reed–Solomon 的基础）
     本原多项式 0x11D，生成元 α = 2
     ====================================================================== */

  var EXP = new Uint8Array(512);
  var LOG = new Uint8Array(256);

  (function initGF() {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) { x ^= 0x11D; }
    }
    for (var j = 255; j < 512; j++) { EXP[j] = EXP[j - 255]; }
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) { return 0; }
    return EXP[LOG[a] + LOG[b]];
  }

  /* ======================================================================
     二、Reed–Solomon 纠错
     ====================================================================== */

  /** 生成多项式 g(x) = ∏(x - α^i)，i = 0..degree-1 */
  function rsGenPoly(degree) {
    var poly = [1];
    for (var i = 0; i < degree; i++) {
      var next = new Array(poly.length + 1);
      for (var k = 0; k < next.length; k++) { next[k] = 0; }
      for (var j = 0; j < poly.length; j++) {
        next[j] ^= gfMul(poly[j], 1);          /* 乘 x */
        next[j + 1] ^= gfMul(poly[j], EXP[i]); /* 乘 α^i */
      }
      poly = next;
    }
    return poly;
  }

  var genPolyCache = {};
  function getGenPoly(degree) {
    if (!genPolyCache[degree]) { genPolyCache[degree] = rsGenPoly(degree); }
    return genPolyCache[degree];
  }

  /** 计算 data 的 RS 纠错码字 */
  function rsEncode(data, ecLen) {
    var gen = getGenPoly(ecLen);
    var res = new Uint8Array(data.length + ecLen);
    res.set(data, 0);
    for (var i = 0; i < data.length; i++) {
      var coef = res[i];
      if (coef === 0) { continue; }
      for (var j = 0; j < gen.length; j++) {
        res[i + j] ^= gfMul(gen[j], coef);
      }
    }
    return res.subarray(data.length);
  }

  /* ---------------- 解码用的多项式工具（系数按「低次在前」存放） ---------------- */

  function polyEval(poly, x) {
    /* 霍纳法则；poly[0] 为常数项 */
    var y = poly[poly.length - 1];
    for (var i = poly.length - 2; i >= 0; i--) {
      y = gfMul(y, x) ^ poly[i];
    }
    return y;
  }

  function polyMul(a, b) {
    var out = new Uint8Array(a.length + b.length - 1);
    for (var i = 0; i < a.length; i++) {
      if (a[i] === 0) { continue; }
      for (var j = 0; j < b.length; j++) {
        out[i + j] ^= gfMul(a[i], b[j]);
      }
    }
    return out;
  }

  /** 计算伴随式。全 0 表示无错误。 */
  function syndromes(msg, ecLen) {
    var s = new Uint8Array(ecLen);
    var hasErr = false;
    for (var i = 0; i < ecLen; i++) {
      /* 约定：先发高位码字，故用 α^i 求值 */
      var v = 0;
      for (var j = 0; j < msg.length; j++) {
        v = gfMul(v, EXP[i]) ^ msg[j];
      }
      s[i] = v;
      if (v !== 0) { hasErr = true; }
    }
    return hasErr ? s : null;
  }

  /** Berlekamp–Massey：求错误位置多项式 Λ(x) */
  function berlekampMassey(syn) {
    var n = syn.length;
    var lambda = new Uint8Array(n + 1);
    var b = new Uint8Array(n + 1);
    lambda[0] = 1;
    b[0] = 1;
    var L = 0, m = 1, bb = 1;

    for (var r = 0; r < n; r++) {
      /* 计算偏差 Δ */
      var delta = syn[r];
      for (var i = 1; i <= L; i++) {
        delta ^= gfMul(lambda[i], syn[r - i]);
      }

      if (delta === 0) {
        m++;
      } else if (2 * L <= r) {
        var t = lambda.slice();
        var scale = gfMul(delta, EXP[255 - LOG[bb]]);  /* delta / bb */
        for (var k = 0; k + m < b.length; k++) {
          if (b[k] === 0) { continue; }
          t[k + m] ^= gfMul(scale, b[k]);
        }
        L = r + 1 - L;
        b = lambda;
        bb = delta;
        lambda = t;
        m = 1;
      } else {
        var scale2 = gfMul(delta, EXP[255 - LOG[bb]]);
        for (var k2 = 0; k2 + m < b.length; k2++) {
          if (b[k2] === 0) { continue; }
          lambda[k2 + m] ^= gfMul(scale2, b[k2]);
        }
        m++;
      }
    }

    var deg = L;
    while (deg > 0 && lambda[deg] === 0) { deg--; }
    return lambda.slice(0, deg + 1);
  }

  /** Chien 搜索：找出错误位置 */
  function findErrorLocations(lambda, msgLen) {
    var deg = lambda.length - 1;
    if (deg === 0) { return []; }
    var positions = [];
    for (var i = 0; i < msgLen; i++) {
      /* 位置对应 α^(-i)：把 α^i 代入 Λ 求根 */
      var xInv = EXP[(255 - (i % 255)) % 255];
      if (polyEval(lambda, xInv) === 0) {
        positions.push(msgLen - 1 - i);
      }
    }
    return positions;
  }

  /** Forney 算法：计算错误值 */
  function findErrorMagnitudes(lambda, syn, positions, msgLen) {
    var deg = lambda.length - 1;
    /* Ω(x) = S(x)·Λ(x) mod x^deg */
    var omega = new Uint8Array(deg);
    for (var i = 0; i < deg; i++) {
      var acc = 0;
      for (var j = 0; j <= i && j < lambda.length; j++) {
        if (i - j < syn.length) { acc ^= gfMul(lambda[j], syn[i - j]); }
      }
      omega[i] = acc;
    }
    /* Λ'(x)：奇数项系数 */
    var lambdaDeriv = new Uint8Array(deg);
    for (var k = 1; k < lambda.length; k += 2) { lambdaDeriv[k - 1] = lambda[k]; }

    var mags = [];
    for (var p = 0; p < positions.length; p++) {
      var pos = positions[p];
      var xi = EXP[(msgLen - 1 - pos) % 255];      /* 错误位置对应的 α^幂 */
      var xiInv = EXP[(255 - LOG[xi]) % 255];

      var num = polyEval(omega, xiInv);
      var den = polyEval(lambdaDeriv, xiInv);
      if (den === 0) { return null; }
      mags.push(gfMul(xi, gfMul(num, EXP[255 - LOG[den]])));
    }
    return mags;
  }

  /** 对单个 RS 块纠错，成功返回 true */
  function rsCorrect(block, ecLen) {
    var syn = syndromes(block, ecLen);
    if (!syn) { return true; }                     /* 无错误 */

    var lambda = berlekampMassey(syn);
    var deg = lambda.length - 1;
    if (deg === 0 || deg * 2 > ecLen) { return false; }

    var positions = findErrorLocations(lambda, block.length);
    if (positions.length !== deg) { return false; }

    var mags = findErrorMagnitudes(lambda, syn, positions, block.length);
    if (!mags) { return false; }

    for (var i = 0; i < positions.length; i++) {
      block[positions[i]] ^= mags[i];
    }
    /* 复核 */
    return !syndromes(block, ecLen);
  }

  /* ======================================================================
     三、QR 规格表
     ====================================================================== */

  /* 每个版本：各纠错等级对应的 [每块纠错码字数, 块数] 分组（group1, group2） */
  var EC_LEVELS = { L: 0, M: 1, Q: 2, H: 3 };
  var EC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  /* 版本 1–40 的纠错块结构
     格式：[ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] × 4 等级（L,M,Q,H） */
  var RS_TABLE = [
    /* v1 */[[7,1,19,0,0],[10,1,16,0,0],[13,1,13,0,0],[17,1,9,0,0]],
    /* v2 */[[10,1,34,0,0],[16,1,28,0,0],[22,1,22,0,0],[28,1,16,0,0]],
    /* v3 */[[15,1,55,0,0],[26,1,44,0,0],[18,2,17,0,0],[22,2,13,0,0]],
    /* v4 */[[20,1,80,0,0],[18,2,32,0,0],[26,2,24,0,0],[16,4,9,0,0]],
    /* v5 */[[26,1,108,0,0],[24,2,43,0,0],[18,2,15,2,16],[22,2,11,2,12]],
    /* v6 */[[18,2,68,0,0],[16,4,27,0,0],[24,4,19,0,0],[28,4,15,0,0]],
    /* v7 */[[20,2,78,0,0],[18,4,31,0,0],[18,2,14,4,15],[26,4,13,1,14]],
    /* v8 */[[24,2,97,0,0],[22,2,38,2,39],[22,4,18,2,19],[26,4,14,2,15]],
    /* v9 */[[30,2,116,0,0],[22,3,36,2,37],[20,4,16,4,17],[24,4,12,4,13]],
    /* v10 */[[18,2,68,2,69],[26,4,43,1,44],[24,6,19,2,20],[28,6,15,2,16]],
    /* v11 */[[20,4,81,0,0],[30,1,50,4,51],[28,4,22,4,23],[24,3,12,8,13]],
    /* v12 */[[24,2,92,2,93],[22,6,36,2,37],[26,4,20,6,21],[28,7,14,4,15]],
    /* v13 */[[26,4,107,0,0],[22,8,37,1,38],[24,8,20,4,21],[22,12,11,4,12]],
    /* v14 */[[30,3,115,1,116],[24,4,40,5,41],[20,11,16,5,17],[24,11,12,5,13]],
    /* v15 */[[22,5,87,1,88],[24,5,41,5,42],[30,5,24,7,25],[24,11,12,7,13]],
    /* v16 */[[24,5,98,1,99],[28,7,45,3,46],[24,15,19,2,20],[30,3,15,13,16]],
    /* v17 */[[28,1,107,5,108],[28,10,46,1,47],[28,1,22,15,23],[28,2,14,17,15]],
    /* v18 */[[30,5,120,1,121],[26,9,43,4,44],[28,17,22,1,23],[28,2,14,19,15]],
    /* v19 */[[28,3,113,4,114],[26,3,44,11,45],[26,17,21,4,22],[26,9,13,16,14]],
    /* v20 */[[28,3,107,5,108],[26,3,41,13,42],[30,15,24,5,25],[28,15,15,10,16]],
    /* v21 */[[28,4,116,4,117],[26,17,42,0,0],[28,17,22,6,23],[30,19,16,6,17]],
    /* v22 */[[28,2,111,7,112],[28,17,46,0,0],[30,7,24,16,25],[24,34,13,0,0]],
    /* v23 */[[30,4,121,5,122],[28,4,47,14,48],[30,11,24,14,25],[30,16,15,14,16]],
    /* v24 */[[30,6,117,4,118],[28,6,45,14,46],[30,11,24,16,25],[30,30,16,2,17]],
    /* v25 */[[26,8,106,4,107],[28,8,47,13,48],[30,7,24,22,25],[30,22,15,13,16]],
    /* v26 */[[28,10,114,2,115],[28,19,46,4,47],[28,28,22,6,23],[30,33,16,4,17]],
    /* v27 */[[30,8,122,4,123],[28,22,45,3,46],[30,8,23,26,24],[30,12,15,28,16]],
    /* v28 */[[30,3,117,10,118],[28,3,45,23,46],[30,4,24,31,25],[30,11,15,31,16]],
    /* v29 */[[30,7,116,7,117],[28,21,45,7,46],[30,1,23,37,24],[30,19,15,26,16]],
    /* v30 */[[30,5,115,10,116],[28,19,47,10,48],[30,15,24,25,25],[30,23,15,25,16]],
    /* v31 */[[30,13,115,3,116],[28,2,46,29,47],[30,42,24,1,25],[30,23,15,28,16]],
    /* v32 */[[30,17,115,0,0],[28,10,46,23,47],[30,10,24,35,25],[30,19,15,35,16]],
    /* v33 */[[30,17,115,1,116],[28,14,46,21,47],[30,29,24,19,25],[30,11,15,46,16]],
    /* v34 */[[30,13,115,6,116],[28,14,46,23,47],[30,44,24,7,25],[30,59,16,1,17]],
    /* v35 */[[30,12,121,7,122],[28,12,47,26,48],[30,39,24,14,25],[30,22,15,41,16]],
    /* v36 */[[30,6,121,14,122],[28,6,47,34,48],[30,46,24,10,25],[30,2,15,64,16]],
    /* v37 */[[30,17,122,4,123],[28,29,46,14,47],[30,49,24,10,25],[30,24,15,46,16]],
    /* v38 */[[30,4,122,18,123],[28,13,46,32,47],[30,48,24,14,25],[30,42,15,32,16]],
    /* v39 */[[30,20,117,4,118],[28,40,47,7,48],[30,43,24,22,25],[30,10,15,67,16]],
    /* v40 */[[30,19,118,6,119],[28,18,47,31,48],[30,34,24,34,25],[30,20,15,61,16]]
  ];

  /* 每个版本的对齐图案中心坐标 */
  var ALIGN_POS = [
    [], [6,18], [6,22], [6,26], [6,30], [6,34],
    [6,22,38], [6,24,42], [6,26,46], [6,28,50], [6,30,54],
    [6,32,58], [6,34,62], [6,26,46,66], [6,26,48,70], [6,26,50,74],
    [6,30,54,78], [6,30,56,82], [6,30,58,86], [6,34,62,90], [6,28,50,72,94],
    [6,26,50,74,98], [6,30,54,78,102], [6,30,56,82,108], [6,30,58,86,112],
    [6,34,62,90,114], [6,28,50,72,94,118], [6,26,50,74,98,122], [6,30,54,78,102,126],
    [6,26,52,78,104,130], [6,30,56,82,108,134], [6,30,58,86,114,138],
    [6,34,62,90,118,142], [6,28,54,80,106,132,158], [6,26,54,82,110,138,162],
    [6,30,58,86,114,142,166], [6,34,62,90,118,146,170], [6,30,58,86,114,142,170],
    [6,34,62,90,118,146,174], [6,26,54,82,110,138,166,194], [6,30,58,86,114,142,170,198]
  ];

  function versionSize(v) { return v * 4 + 17; }

  /** 该版本该等级的数据码字总数 */
  function dataCodewords(v, level) {
    var spec = RS_TABLE[v - 1][EC_LEVELS[level]];
    return spec[1] * spec[2] + spec[3] * spec[4];
  }

  /** 该版本该等级的纠错块分组 */
  function ecBlocks(v, level) {
    var spec = RS_TABLE[v - 1][EC_LEVELS[level]];
    var out = [];
    var i;
    for (i = 0; i < spec[1]; i++) { out.push({ total: spec[2] + spec[0], data: spec[2] }); }
    for (i = 0; i < spec[3]; i++) { out.push({ total: spec[4] + spec[0], data: spec[4] }); }
    return out;
  }

  /** 总码字数（数据 + 纠错），用于容量校验 */
  function totalCodewords(v, level) {
    var blocks = ecBlocks(v, level);
    var n = 0;
    for (var i = 0; i < blocks.length; i++) { n += blocks[i].total; }
    return n;
  }

  /* ======================================================================
     四、编码器
     ====================================================================== */

  /** UTF-8 编码为字节数组 */
  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      /* 处理代理对 */
      if (code >= 0xD800 && code <= 0xDBFF && i + 1 < str.length) {
        var next = str.charCodeAt(i + 1);
        if (next >= 0xDC00 && next <= 0xDFFF) {
          code = 0x10000 + ((code - 0xD800) << 10) + (next - 0xDC00);
          i++;
        }
      }
      if (code < 0x80) {
        out.push(code);
      } else if (code < 0x800) {
        out.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
      } else if (code < 0x10000) {
        out.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
      } else {
        out.push(0xF0 | (code >> 18), 0x80 | ((code >> 12) & 0x3F),
                 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
      }
    }
    return out;
  }

  /** 字节数组解码为 UTF-8 字符串 */
  function utf8Decode(bytes) {
    var out = '';
    var i = 0;
    while (i < bytes.length) {
      var b = bytes[i++];
      var cp;
      if (b < 0x80) {
        cp = b;
      } else if (b >= 0xC0 && b < 0xE0) {
        cp = ((b & 0x1F) << 6) | (bytes[i++] & 0x3F);
      } else if (b >= 0xE0 && b < 0xF0) {
        cp = ((b & 0x0F) << 12) | ((bytes[i++] & 0x3F) << 6) | (bytes[i++] & 0x3F);
      } else {
        cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3F) << 12)
           | ((bytes[i++] & 0x3F) << 6) | (bytes[i++] & 0x3F);
      }
      if (cp > 0xFFFF) {
        cp -= 0x10000;
        out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
      } else {
        out += String.fromCharCode(cp);
      }
    }
    return out;
  }

  /** 写出数据位流（字节模式） */
  function BitBuffer() { this.bits = []; }
  BitBuffer.prototype.put = function (value, length) {
    for (var i = length - 1; i >= 0; i--) {
      this.bits.push((value >>> i) & 1);
    }
  };

  /** 选最小的可用版本 */
  function pickVersion(byteLen, level) {
    for (var v = 1; v <= 40; v++) {
      var cap = dataCodewords(v, level) * 8;
      /* 4 位模式指示 + 字符计数指示 */
      var ccBits = v < 10 ? 8 : 16;
      var need = 4 + ccBits + byteLen * 8;
      if (need <= cap) { return v; }
    }
    throw new Error('QR: 内容过长，无法编码（' + byteLen + ' 字节）');
  }

  /** 生成数据码字（含模式指示、计数、填充） */
  function buildDataCodewords(bytes, version, level) {
    var buf = new BitBuffer();
    buf.put(4, 4);                                        /* 字节模式 */
    var ccBits = version < 10 ? 8 : 16;
    buf.put(bytes.length, ccBits);
    for (var i = 0; i < bytes.length; i++) { buf.put(bytes[i], 8); }

    var total = dataCodewords(version, level) * 8;
    /* 终止符 */
    var term = Math.min(4, total - buf.bits.length);
    buf.put(0, term);
    /* 补齐到字节 */
    while (buf.bits.length % 8 !== 0) { buf.bits.push(0); }

    /* 转成码字 */
    var codewords = [];
    for (var k = 0; k < buf.bits.length; k += 8) {
      var b = 0;
      for (var j = 0; j < 8; j++) { b = (b << 1) | buf.bits[k + j]; }
      codewords.push(b);
    }
    /* 交替填充 0xEC / 0x11 */
    var pad = [0xEC, 0x11];
    var p = 0;
    while (codewords.length < dataCodewords(version, level)) {
      codewords.push(pad[p % 2]);
      p++;
    }
    return codewords;
  }

  /** 分块 → RS 纠错 → 交织成最终码字序列 */
  function interleave(codewords, version, level) {
    var blocks = ecBlocks(version, level);
    var dataBlocks = [], ecBlocksArr = [];
    var offset = 0;

    for (var i = 0; i < blocks.length; i++) {
      var dLen = blocks[i].data;
      var d = codewords.slice(offset, offset + dLen);
      offset += dLen;
      dataBlocks.push(d);
      ecBlocksArr.push(rsEncode(new Uint8Array(d), blocks[i].total - dLen));
    }

    var result = [];
    var maxData = 0;
    for (var a = 0; a < dataBlocks.length; a++) {
      if (dataBlocks[a].length > maxData) { maxData = dataBlocks[a].length; }
    }
    /* 数据码字交织 */
    for (var c = 0; c < maxData; c++) {
      for (var b2 = 0; b2 < dataBlocks.length; b2++) {
        if (c < dataBlocks[b2].length) { result.push(dataBlocks[b2][c]); }
      }
    }
    /* 纠错码字交织 */
    var maxEc = 0;
    for (var e = 0; e < ecBlocksArr.length; e++) {
      if (ecBlocksArr[e].length > maxEc) { maxEc = ecBlocksArr[e].length; }
    }
    for (var c2 = 0; c2 < maxEc; c2++) {
      for (var b3 = 0; b3 < ecBlocksArr.length; b3++) {
        if (c2 < ecBlocksArr[b3].length) { result.push(ecBlocksArr[b3][c2]); }
      }
    }
    return result;
  }

  /** BCH 格式信息（15 位） */
  function formatInfoBits(level, mask) {
    var data = (EC_FORMAT_BITS[level] << 3) | mask;
    var d = data << 10;
    /* 生成多项式 0x537 */
    for (var i = 14; i >= 10; i--) {
      if ((d >>> i) & 1) { d ^= 0x537 << (i - 10); }
    }
    return ((data << 10) | d) ^ 0x5412;
  }

  /** BCH 版本信息（18 位，仅版本 ≥ 7） */
  function versionInfoBits(version) {
    var d = version << 12;
    for (var i = 17; i >= 12; i--) {
      if ((d >>> i) & 1) { d ^= 0x1F25 << (i - 12); }
    }
    return (version << 12) | d;
  }

  /** 创建空白矩阵，并放置功能图案 */
  function createMatrix(version) {
    var size = versionSize(version);
    var m = [];
    var reserved = [];
    for (var r = 0; r < size; r++) {
      m.push(new Uint8Array(size));
      reserved.push(new Uint8Array(size));
    }

    function setFinder(row, col) {
      for (var dr = -1; dr <= 7; dr++) {
        for (var dc = -1; dc <= 7; dc++) {
          var r2 = row + dr, c2 = col + dc;
          if (r2 < 0 || c2 < 0 || r2 >= size || c2 >= size) { continue; }
          var inRing = (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
                       (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6));
          var inCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          m[r2][c2] = (inRing || inCore) ? 1 : 0;
          reserved[r2][c2] = 1;
        }
      }
    }

    /* 三个定位图案 */
    setFinder(0, 0);
    setFinder(0, size - 7);
    setFinder(size - 7, 0);

    /* 定位图案之间分隔符外的定时图案 */
    for (var i = 8; i < size - 8; i++) {
      m[6][i] = (i % 2 === 0) ? 1 : 0;
      reserved[6][i] = 1;
      m[i][6] = (i % 2 === 0) ? 1 : 0;
      reserved[i][6] = 1;
    }

    /* 对齐图案 */
    var pos = ALIGN_POS[version - 1];
    for (var a = 0; a < pos.length; a++) {
      for (var b = 0; b < pos.length; b++) {
        var pr = pos[a], pc = pos[b];
        /* 跳过与定位图案重叠的位置 */
        if ((pr <= 8 && pc <= 8) || (pr <= 8 && pc >= size - 9) || (pr >= size - 9 && pc <= 8)) { continue; }
        for (var dr2 = -2; dr2 <= 2; dr2++) {
          for (var dc2 = -2; dc2 <= 2; dc2++) {
            var rr = pr + dr2, cc = pc + dc2;
            if (rr < 0 || cc < 0 || rr >= size || cc >= size) { continue; }
            var ring = Math.max(Math.abs(dr2), Math.abs(dc2));
            m[rr][cc] = (ring === 2 || ring === 0) ? 1 : 0;
            reserved[rr][cc] = 1;
          }
        }
      }
    }

    /* 固定的 dark module */
    m[size - 8][8] = 1;
    reserved[size - 8][8] = 1;

    /* 预留格式信息区 */
    for (var k = 0; k <= 8; k++) {
      if (k !== 6) {
        reserved[8][k] = 1;
        reserved[k][8] = 1;
      }
    }
    for (var k2 = 0; k2 < 8; k2++) {
      reserved[8][size - 1 - k2] = 1;
      reserved[size - 1 - k2][8] = 1;
    }

    /* 预留版本信息区（版本 ≥ 7） */
    if (version >= 7) {
      for (var v1 = 0; v1 < 6; v1++) {
        for (var v2 = 0; v2 < 3; v2++) {
          reserved[v1][size - 11 + v2] = 1;
          reserved[size - 11 + v2][v1] = 1;
        }
      }
    }

    return { modules: m, reserved: reserved, size: size };
  }

  /** 按之字形把码字写入矩阵 */
  function placeData(mat, codewords) {
    var m = mat.modules, reserved = mat.reserved, size = mat.size;
    var bitIndex = 0;
    var totalBits = codewords.length * 8;
    var upward = true;

    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) { col--; }                     /* 跳过定时图案列 */
      for (var i = 0; i < size; i++) {
        var row = upward ? (size - 1 - i) : i;
        for (var c = 0; c < 2; c++) {
          var cc = col - c;
          if (reserved[row][cc]) { continue; }
          var bit = 0;
          if (bitIndex < totalBits) {
            bit = (codewords[bitIndex >> 3] >>> (7 - (bitIndex & 7))) & 1;
          }
          m[row][cc] = bit;
          bitIndex++;
        }
      }
      upward = !upward;
    }
  }

  /** 8 种掩码 */
  var MASK_FN = [
    function (r, c) { return (r + c) % 2 === 0; },
    function (r, c) { return r % 2 === 0; },
    function (r, c) { return c % 3 === 0; },
    function (r, c) { return (r + c) % 3 === 0; },
    function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
    function (r, c) { return ((r * c) % 2) + ((r * c) % 3) === 0; },
    function (r, c) { return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; },
    function (r, c) { return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; }
  ];

  /** 应用掩码（只作用于数据区） */
  function applyMask(mat, maskId) {
    var m = mat.modules, reserved = mat.reserved, size = mat.size;
    var fn = MASK_FN[maskId];
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        if (reserved[r][c]) { continue; }
        if (fn(r, c)) { m[r][c] ^= 1; }
      }
    }
  }

  /** 写入格式信息 */
  function placeFormatInfo(mat, level, maskId) {
    var size = mat.size, m = mat.modules;
    var bits = formatInfoBits(level, maskId);

    /* 左上角 */
    for (var i = 0; i <= 5; i++) { m[8][i] = (bits >> i) & 1; }
    m[8][7] = (bits >> 6) & 1;
    m[8][8] = (bits >> 7) & 1;
    m[7][8] = (bits >> 8) & 1;
    for (var j = 9; j <= 14; j++) { m[14 - j][8] = (bits >> j) & 1; }

    /* 右上 / 左下 */
    for (var k = 0; k <= 7; k++) { m[size - 1 - k][8] = (bits >> k) & 1; }
    for (var n = 8; n <= 14; n++) { m[8][size - 15 + n] = (bits >> n) & 1; }
    m[size - 8][8] = 1;                              /* dark module 保持为 1 */
  }

  /** 写入版本信息（版本 ≥ 7） */
  function placeVersionInfo(mat, version) {
    if (version < 7) { return; }
    var size = mat.size, m = mat.modules;
    var bits = versionInfoBits(version);
    for (var i = 0; i < 18; i++) {
      var bit = (bits >> i) & 1;
      var r = Math.floor(i / 3);
      var c = i % 3;
      m[r][size - 11 + c] = bit;
      m[size - 11 + c][r] = bit;
    }
  }

  /** 掩码罚分（选最优掩码） */
  function maskPenalty(m, size) {
    var penalty = 0;
    var r, c, i;

    /* 规则 1：同色连续 ≥ 5 */
    for (r = 0; r < size; r++) {
      var run = 1;
      for (c = 1; c < size; c++) {
        if (m[r][c] === m[r][c - 1]) {
          run++;
        } else {
          if (run >= 5) { penalty += run - 2; }
          run = 1;
        }
      }
      if (run >= 5) { penalty += run - 2; }
    }
    for (c = 0; c < size; c++) {
      var run2 = 1;
      for (r = 1; r < size; r++) {
        if (m[r][c] === m[r - 1][c]) {
          run2++;
        } else {
          if (run2 >= 5) { penalty += run2 - 2; }
          run2 = 1;
        }
      }
      if (run2 >= 5) { penalty += run2 - 2; }
    }

    /* 规则 2：2×2 同色块 */
    for (r = 0; r < size - 1; r++) {
      for (c = 0; c < size - 1; c++) {
        var v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) {
          penalty += 3;
        }
      }
    }

    /* 规则 3：1:1:3:1:1 类似定位图案的组合 */
    var pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    var pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    function matchAt(arr, idx) {
      var ok1 = true, ok2 = true;
      for (var k = 0; k < 11; k++) {
        if (arr[idx + k] !== pat1[k]) { ok1 = false; }
        if (arr[idx + k] !== pat2[k]) { ok2 = false; }
        if (!ok1 && !ok2) { return 0; }
      }
      return (ok1 || ok2) ? 1 : 0;
    }
    for (r = 0; r < size; r++) {
      var rowArr = [];
      for (c = 0; c < size; c++) { rowArr.push(m[r][c]); }
      for (i = 0; i + 11 <= size; i++) { penalty += 40 * matchAt(rowArr, i); }
    }
    for (c = 0; c < size; c++) {
      var colArr = [];
      for (r = 0; r < size; r++) { colArr.push(m[r][c]); }
      for (i = 0; i + 11 <= size; i++) { penalty += 40 * matchAt(colArr, i); }
    }

    /* 规则 4：明暗比例偏离 50% */
    var dark = 0;
    for (r = 0; r < size; r++) {
      for (c = 0; c < size; c++) { if (m[r][c]) { dark++; } }
    }
    var ratio = (dark * 100) / (size * size);
    penalty += Math.floor(Math.abs(ratio - 50) / 5) * 10;

    return penalty;
  }

  /**
   * 主编码入口。
   * @param {string} text 要编码的文本
   * @param {object} opts { level: 'L'|'M'|'Q'|'H', version: number }
   * @returns {{size:number, modules:Uint8Array[], text:string, version:number, level:string}}
   */
  function encode(text, opts) {
    opts = opts || {};
    var level = opts.level || 'M';
    if (EC_LEVELS[level] === undefined) { level = 'M'; }

    var bytes = utf8Bytes(String(text == null ? '' : text));
    var version = opts.version || pickVersion(bytes.length, level);
    if (version < 1 || version > 40) { throw new Error('QR: 版本必须在 1–40 之间'); }
    if (dataCodewords(version, level) * 8 < 4 + (version < 10 ? 8 : 16) + bytes.length * 8) {
      throw new Error('QR: 指定版本容量不足');
    }

    var dataCw = buildDataCodewords(bytes, version, level);
    var finalCw = interleave(dataCw, version, level);

    var mat = createMatrix(version);
    placeData(mat, finalCw);
    placeFormatInfoBase(mat, level);

    /* 逐个掩码试算，取罚分最低的 */
    var best = null, bestScore = Infinity, bestMask = 0;
    for (var maskId = 0; maskId < 8; maskId++) {
      var trial = cloneMatrix(mat);
      applyMask(trial, maskId);
      placeFormatInfo(trial, level, maskId);
      var score = maskPenalty(trial.modules, trial.size);
      if (score < bestScore) {
        bestScore = score;
        best = trial;
        bestMask = maskId;
      }
    }

    placeVersionInfo(best, version);

    return {
      size: best.size,
      modules: best.modules,
      text: String(text),
      version: version,
      level: level,
      mask: bestMask
    };
  }

  /* 先把格式位占位（避免掩码时被当作数据） */
  function placeFormatInfoBase(mat, level) { placeFormatInfo(mat, level, 0); }

  function cloneMatrix(mat) {
    var modules = [], reserved = [];
    for (var i = 0; i < mat.size; i++) {
      modules.push(mat.modules[i].slice());
      reserved.push(mat.reserved[i].slice());
    }
    return { modules: modules, reserved: reserved, size: mat.size };
  }

  /* ======================================================================
     五、渲染（Canvas / SVG）
     ====================================================================== */

  function toCanvas(text, canvas, opts) {
    opts = opts || {};
    var qr = (text && text.modules) ? text : encode(text, opts);
    var quiet = (opts.quiet === undefined) ? 4 : opts.quiet;
    var scale = opts.scale || 0;
    var size = qr.size + quiet * 2;

    if (!scale) {
      var target = opts.width || 260;
      scale = Math.max(1, Math.floor(target / size));
    }
    var px = size * scale;

    canvas.width = px;
    canvas.height = px;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = opts.light || '#ffffff';
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = opts.dark || '#000000';

    for (var r = 0; r < qr.size; r++) {
      for (var c = 0; c < qr.size; c++) {
        if (qr.modules[r][c]) {
          ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
        }
      }
    }
    return qr;
  }

  function toSvg(text, opts) {
    opts = opts || {};
    var qr = (text && text.modules) ? text : encode(text, opts);
    var quiet = (opts.quiet === undefined) ? 4 : opts.quiet;
    var total = qr.size + quiet * 2;
    var dark = opts.dark || '#000000';
    var light = opts.light || '#ffffff';
    var path = '';
    for (var r = 0; r < qr.size; r++) {
      for (var c = 0; c < qr.size; c++) {
        if (qr.modules[r][c]) {
          path += 'M' + (c + quiet) + ' ' + (r + quiet) + 'h1v1h-1z';
        }
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total
      + '" shape-rendering="crispEdges">'
      + '<rect width="' + total + '" height="' + total + '" fill="' + light + '"/>'
      + '<path d="' + path + '" fill="' + dark + '"/>'
      + '</svg>';
  }

  /* ======================================================================
     六、解码器
     流程：二值化 → 找三个定位图案 → 透视变换 → 采样 → 去掩码 → 纠错 → 解析
     ====================================================================== */

  /** 灰度 + 自适应阈值二值化（返回 0/1 矩阵，1 表示深色） */
  function binarize(imgData, width, height) {
    var gray = new Uint8Array(width * height);
    var data = imgData.data || imgData;
    for (var i = 0, p = 0; i < gray.length; i++, p += 4) {
      /* 亮度加权 */
      gray[i] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
    }

    var binary = [];
    var y, x;
    for (y = 0; y < height; y++) { binary.push(new Uint8Array(width)); }

    /* 先算全局均值，作为「整张图偏亮还是偏暗」的基准 */
    var globalSum = 0;
    for (i = 0; i < gray.length; i++) { globalSum += gray[i]; }
    var globalMean = gray.length ? globalSum / gray.length : 128;

    /* 分块自适应阈值。
       每个块用「本块均值」和「全局均值」共同决定阈值：
       · 本块有明显黑白对比时，用本块均值即可贴合局部光照
       · 本块几乎纯色（对比度低）时，退回全局均值，避免把纯色区整片判成同一色 */
    var blockSize = 8;
    var subW = Math.ceil(width / blockSize);
    var subH = Math.ceil(height / blockSize);
    var thresholds = new Float32Array(subW * subH);
    var bx, by;

    for (by = 0; by < subH; by++) {
      for (bx = 0; bx < subW; bx++) {
        var sum = 0, min = 255, max = 0, count = 0;
        for (y = by * blockSize; y < Math.min((by + 1) * blockSize, height); y++) {
          for (x = bx * blockSize; x < Math.min((bx + 1) * blockSize, width); x++) {
            var v = gray[y * width + x];
            sum += v;
            if (v < min) { min = v; }
            if (v > max) { max = v; }
            count++;
          }
        }
        var avg = count ? sum / count : globalMean;
        /* 纯色块：本块均值不可靠，用全局均值兜底（不改变该区域的判定倾向） */
        if (max - min <= 24) { avg = globalMean; }
        thresholds[by * subW + bx] = avg;
      }
    }

    /* 用 3×3 邻域平滑阈值，减少块与块之间的突变 */
    for (by = 0; by < subH; by++) {
      for (bx = 0; bx < subW; bx++) {
        var left = Math.max(0, bx - 1), right = Math.min(subW - 1, bx + 1);
        var top = Math.max(0, by - 1), bottom = Math.min(subH - 1, by + 1);
        var total = 0, n = 0;
        for (var yy = top; yy <= bottom; yy++) {
          for (var xx = left; xx <= right; xx++) { total += thresholds[yy * subW + xx]; n++; }
        }
        var threshold = n ? total / n : globalMean;
        for (y = by * blockSize; y < Math.min((by + 1) * blockSize, height); y++) {
          for (x = bx * blockSize; x < Math.min((bx + 1) * blockSize, width); x++) {
            binary[y][x] = gray[y * width + x] < threshold ? 1 : 0;
          }
        }
      }
    }
    return binary;
  }

  /**
   * 竖直方向交叉校验：从 (cx, cy) 沿竖直方向量 深:浅:深:浅:深 的游程，
   * 检查是否符合 1:1:3:1:1（允许一定误差）。
   * 定位图案在两个方向上都是 1:1:3:1:1，这是排除旋转假阳性的关键。
   */
  function checkVertical(binary, width, height, cx, cy, moduleSize) {
    var col = Math.round(cx);
    if (col < 0 || col >= width) { return false; }

    /* 从中心向指定方向收集连续的游程 */
    function measure(dir) {
      var y = cy;
      var runs = [];
      var cur = binary[y][col];
      var len = 0;
      var guard = 0;
      while (y >= 0 && y < height && guard < 200) {
        var v = binary[y][col];
        if (v === cur) {
          len++;
        } else {
          runs.push({ value: cur, len: len });
          cur = v;
          len = 1;
          if (runs.length >= 3) { break; }
        }
        y += dir;
        guard++;
      }
      if (len) { runs.push({ value: cur, len: len }); }
      return runs;
    }

    var up = measure(-1);
    var down = measure(1);
    /* 拼成完整序列：上方（反向）+ 下方 */
    var seq = [];
    for (var i = up.length - 1; i >= 0; i--) { seq.push(up[i]); }
    for (var j = 1; j < down.length; j++) { seq.push(down[j]); }

    /* 中心段在 seq 中的下标 */
    var center = up.length - 1;
    if (center - 2 < 0 || center + 2 >= seq.length) { return false; }

    var w = [seq[center - 2], seq[center - 1], seq[center], seq[center + 1], seq[center + 2]];
    if (w[0].value !== 1 || w[1].value !== 0 || w[2].value !== 1 ||
        w[3].value !== 0 || w[4].value !== 1) { return false; }

    var total = w[0].len + w[1].len + w[2].len + w[3].len + w[4].len;
    if (total <= 0) { return false; }
    var ms = total / 7;
    var tol = ms * 0.7;
    return Math.abs(w[0].len - ms) < tol &&
           Math.abs(w[1].len - ms) < tol &&
           Math.abs(w[2].len - 3 * ms) < 3 * tol &&
           Math.abs(w[3].len - ms) < tol &&
           Math.abs(w[4].len - ms) < tol;
  }

  /** 在二值图中寻找定位图案（1:1:3:1:1 的比例特征） */
  function findFinderPatterns(binary, width, height) {
    var candidates = [];

    /* 逐行扫描找水平方向的 1:1:3:1:1 游程 */
    for (var y = 0; y < height; y++) {
      var runs = [];
      var lastVal = binary[y][0];
      var runStart = 0;
      for (var x = 1; x <= width; x++) {
        var val = (x < width) ? binary[y][x] : -1;
        if (val !== lastVal) {
          runs.push({ value: lastVal, start: runStart, len: x - runStart });
          runStart = x;
          lastVal = val;
        }
      }
      /* 在游程中匹配 深:浅:深:浅:深 = 1:1:3:1:1 */
      for (var i = 0; i + 4 < runs.length; i++) {
        if (runs[i].value !== 1) { continue; }
        var r0 = runs[i], r1 = runs[i + 1], r2 = runs[i + 2], r3 = runs[i + 3], r4 = runs[i + 4];
        if (r1.value !== 0 || r2.value !== 1 || r3.value !== 0 || r4.value !== 1) { continue; }

        var totalLen = r0.len + r1.len + r2.len + r3.len + r4.len;
        var moduleSize = totalLen / 7;
        if (moduleSize < 1) { continue; }
        var tol = moduleSize * 0.6;

        if (Math.abs(r0.len - moduleSize) < tol &&
            Math.abs(r1.len - moduleSize) < tol &&
            Math.abs(r2.len - 3 * moduleSize) < 3 * tol &&
            Math.abs(r3.len - moduleSize) < tol &&
            Math.abs(r4.len - moduleSize) < tol) {
          var cx = r0.start + totalLen / 2;
          /* 竖直方向交叉校验：真正的定位图案在竖直方向同样是 1:1:3:1:1。
             只做水平扫描时，旋转的条码会产生大量假阳性，这一步能有效过滤。 */
          if (!checkVertical(binary, width, height, cx, y, moduleSize)) { continue; }
          candidates.push({ x: cx, y: y, moduleSize: moduleSize });
        }
      }
    }

    /* 把候选点聚成簇。
       关键点：用「固定锚点」而不是漂移质心做归属判断。
       同一列扫描会沿竖直方向给出多个候选（定位图案的中心竖条），
       因此纵向阈值要放宽到约 4 个模块；但锚点一旦确定就不再移动，
       避免被远处的误检点把质心拖偏（这正是之前定位图案被吞掉的原因）。 */
    var clusters = [];
    for (var k = 0; k < candidates.length; k++) {
      var c = candidates[k];
      var merged = false;
      for (var j = 0; j < clusters.length; j++) {
        var cl = clusters[j];
        var limX = Math.max(cl.moduleSize, c.moduleSize) * 2.5;
        var limY = Math.max(cl.moduleSize, c.moduleSize) * 4;
        /* 同一张图里模块大小基本恒定：尺寸差太多的一定不是同一个定位图案，
           否则大小不一的误检点混进来会把质心拖偏、把 ms 平均得面目全非 */
        var msOk = Math.abs(cl.moduleSize - c.moduleSize)
                 <= Math.max(cl.moduleSize, c.moduleSize) * 0.35;
        if (msOk && Math.abs(cl.anchorX - c.x) <= limX && Math.abs(cl.anchorY - c.y) <= limY) {
          cl.sumX += c.x;
          cl.sumY += c.y;
          cl.sumM += c.moduleSize;
          cl.members.push(c);
          cl.count++;
          /* 用全部成员重算质心，减少单点噪声影响 */
          cl.x = cl.sumX / cl.count;
          cl.y = cl.sumY / cl.count;
          cl.moduleSize = cl.sumM / cl.count;
          merged = true;
          break;
        }
      }
      if (!merged) {
        clusters.push({
          x: c.x, y: c.y, anchorX: c.x, anchorY: c.y,
          moduleSize: c.moduleSize, count: 1,
          sumX: c.x, sumY: c.y, sumM: c.moduleSize,
          members: [c]
        });
      }
    }

    /* 只保留够结实的簇（单点多为数据区的偶发巧合）。
       经验表明：在这一步额外做「中心精修」在旋转图上反而更容易失败，
       真正的鲁棒性来自后面「多种阈值 + 多种候选组合逐一实解」的策略。 */
    var strong = [];
    for (var s = 0; s < clusters.length; s++) {
      var cc = clusters[s];
      if (cc.count < 2) { continue; }
      strong.push({ x: cc.x, y: cc.y, moduleSize: cc.moduleSize, count: cc.count });
    }
    return strong;
  }

  /** 用三个定位图案中心确定透视变换并采样 */
  function sampleGrid(binary, width, height, tl, tr, bl, size) {
    var grid = [];
    for (var r = 0; r < size; r++) { grid.push(new Uint8Array(size)); }

    /* 基于仿射变换：P(u,v) = TL + u*(TR-TL)/dim + v*(BL-TL)/dim */
    var dim = size - 1;
    var ax = (tr.x - tl.x) / dim, ay = (tr.y - tl.y) / dim;
    var bx = (bl.x - tl.x) / dim, by = (bl.y - tl.y) / dim;

    for (var row = 0; row < size; row++) {
      for (var col = 0; col < size; col++) {
        var px = tl.x + ax * col + bx * row;
        var py = tl.y + ay * col + by * row;
        var ix = Math.round(px), iy = Math.round(py);
        if (ix < 0 || iy < 0 || ix >= width || iy >= height) { continue; }
        grid[row][col] = binary[iy][ix];
      }
    }
    return grid;
  }

  /** 把矩阵顺时针旋转 90° */
  function rotate90(grid, size) {
    var out = [];
    for (var r = 0; r < size; r++) {
      var row = new Uint8Array(size);
      for (var c = 0; c < size; c++) {
        /* 顺时针：新矩阵 (r,c) = 原矩阵 (size-1-c, r) */
        row[c] = grid[size - 1 - c][r];
      }
      out.push(row);
    }
    return out;
  }

  /**
   * 从已采样的模块矩阵读取数据。
   * 采样方向取决于「哪个定位图案被当成左上角」「哪条边被当成水平边」，
   * 因此真实朝向可能是 8 种之一（4 个旋转 × 2 个镜像）。
   * 这里把旋转和镜像都试一遍，任一成功即返回。
   */
  function decodeMatrix(grid, size) {
    var cur = grid;
    for (var rot = 0; rot < 4; rot++) {
      var text = decodeMatrixOriented(cur, size);
      if (text !== null && text !== undefined) { return text; }
      /* 再试镜像朝向：转置矩阵即可得到沿主对角线翻转后的版本 */
      var mirrored = transpose(cur, size);
      text = decodeMatrixOriented(mirrored, size);
      if (text !== null && text !== undefined) { return text; }
      cur = rotate90(cur, size);
    }
    return null;
  }

  /** 转置矩阵（等价于沿主对角线镜像） */
  function transpose(grid, size) {
    var out = [];
    for (var r = 0; r < size; r++) {
      var row = new Uint8Array(size);
      for (var c = 0; c < size; c++) { row[c] = grid[c][r]; }
      out.push(row);
    }
    return out;
  }

  /** 在「已摆正」的矩阵上读取数据（含版本/掩码解析与纠错） */
  function decodeMatrixOriented(grid, size) {
    /* 读版本：先用尺寸粗判 */
    var version = Math.round((size - 17) / 4);
    if (version < 1 || version > 40) { return null; }

    /* 读格式信息（左上角），取两个副本中较可靠的一个 */
    function readFormatAt(getter) {
      var bits = 0;
      for (var i = 0; i <= 14; i++) {
        bits |= (getter(i) & 1) << i;
      }
      return bits;
    }
    var fmt1 = readFormatAt(function (i) {
      if (i <= 5) { return grid[8][i]; }
      if (i === 6) { return grid[8][7]; }
      if (i === 7) { return grid[8][8]; }
      if (i === 8) { return grid[7][8]; }
      return grid[14 - i][8];
    });
    var fmt2 = readFormatAt(function (i) {
      if (i <= 7) { return grid[size - 1 - i][8]; }
      return grid[8][size - 15 + i];
    });

    function parseFormat(bits) {
      /* 用 BCH 校验：枚举 32 个合法格式串找汉明距离最小的 */
      var best = null, bestDist = 99;
      for (var lv in EC_FORMAT_BITS) {
        for (var mask = 0; mask < 8; mask++) {
          var cand = formatInfoBits(lv, mask);
          var dist = 0;
          for (var b = 0; b < 15; b++) {
            if (((cand >> b) & 1) !== ((bits >> b) & 1)) { dist++; }
          }
          if (dist < bestDist) { bestDist = dist; best = { level: lv, mask: mask }; }
        }
      }
      return (bestDist <= 3) ? best : null;
    }

    var fmt = parseFormat(fmt1) || parseFormat(fmt2);
    if (!fmt) { return null; }

    /* 版本 ≥ 7 时读版本信息 */
    if (version >= 7) {
      var vbits = 0;
      for (var vi = 0; vi < 18; vi++) {
        var vr = Math.floor(vi / 3), vc = vi % 3;
        vbits |= (grid[vr][size - 11 + vc] & 1) << vi;
      }
      var bestV = version, bestVDist = 99;
      for (var candV = 7; candV <= 40; candV++) {
        var cv = versionInfoBits(candV);
        var d = 0;
        for (var b2 = 0; b2 < 18; b2++) {
          if (((cv >> b2) & 1) !== ((vbits >> b2) & 1)) { d++; }
        }
        if (d < bestVDist) { bestVDist = d; bestV = candV; }
      }
      if (bestVDist <= 3) { version = bestV; }
    }

    /* 重建保留区掩码 */
    var mat = createMatrix(version);
    if (mat.size !== size) { return null; }

    /* 去掩码 */
    var unmasked = [];
    for (var r = 0; r < size; r++) { unmasked.push(grid[r].slice()); }
    var fn = MASK_FN[fmt.mask];
    for (var r2 = 0; r2 < size; r2++) {
      for (var c2 = 0; c2 < size; c2++) {
        if (mat.reserved[r2][c2]) { continue; }
        if (fn(r2, c2)) { unmasked[r2][c2] ^= 1; }
      }
    }

    /* 按之字形读出码字 */
    var bits = [];
    var upward = true;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) { col--; }
      for (var i = 0; i < size; i++) {
        var row = upward ? (size - 1 - i) : i;
        for (var cc = 0; cc < 2; cc++) {
          var c3 = col - cc;
          if (mat.reserved[row][c3]) { continue; }
          bits.push(unmasked[row][c3] & 1);
        }
      }
      upward = !upward;
    }

    var totalCw = Math.floor(bits.length / 8);
    var rawCw = new Uint8Array(totalCw);
    for (var k = 0; k < totalCw; k++) {
      var byteVal = 0;
      for (var j = 0; j < 8; j++) { byteVal = (byteVal << 1) | bits[k * 8 + j]; }
      rawCw[k] = byteVal;
    }

    /* 反交织 → 逐块纠错 → 还原数据码字 */
    var blocks = ecBlocks(version, fmt.level);
    var ecLen = blocks[0].total - blocks[0].data;
    var blockData = [];
    var b;
    for (b = 0; b < blocks.length; b++) {
      blockData.push(new Uint8Array(blocks[b].total));
    }

    /* 反交织 */
    var maxData = 0;
    for (b = 0; b < blocks.length; b++) {
      if (blocks[b].data > maxData) { maxData = blocks[b].data; }
    }
    var idx = 0;
    var col2, blk;
    for (col2 = 0; col2 < maxData; col2++) {
      for (blk = 0; blk < blocks.length; blk++) {
        if (col2 < blocks[blk].data) {
          if (idx < rawCw.length) { blockData[blk][col2] = rawCw[idx++]; }
        }
      }
    }
    var maxEc = 0;
    for (b = 0; b < blocks.length; b++) {
      if (ecLen > maxEc) { maxEc = ecLen; }
    }
    for (col2 = 0; col2 < maxEc; col2++) {
      for (blk = 0; blk < blocks.length; blk++) {
        var dLen = blocks[blk].total - ecLen;
        if (col2 < ecLen) {
          if (idx < rawCw.length) { blockData[blk][dLen + col2] = rawCw[idx++]; }
        }
      }
    }

    /* 纠错 */
    var correctedData = [];
    for (b = 0; b < blocks.length; b++) {
      var ok = rsCorrect(blockData[b], ecLen);
      if (!ok) { return null; }
      correctedData.push(blockData[b].subarray(0, blocks[b].data));
    }

    /* 拼接数据码字 */
    var stream = [];
    for (b = 0; b < correctedData.length; b++) {
      for (var q = 0; q < correctedData[b].length; q++) { stream.push(correctedData[b][q]); }
    }

    /* 解析位流 */
    var bitPos = 0;
    function readBits(n) {
      var v = 0;
      for (var i2 = 0; i2 < n; i2++) {
        var byteIdx = bitPos >> 3;
        if (byteIdx >= stream.length) { return -1; }
        var bit = (stream[byteIdx] >> (7 - (bitPos & 7))) & 1;
        v = (v << 1) | bit;
        bitPos++;
      }
      return v;
    }

    var mode = readBits(4);
    if (mode !== 4) {
      /* 暂只支持字节模式（本站标识符均为 ASCII/UTF-8 文本） */
      return null;
    }
    var charCount = readBits(version < 10 ? 8 : 16);
    if (charCount < 0) { return null; }

    var payload = [];
    for (var pc = 0; pc < charCount; pc++) {
      var byteRead = readBits(8);
      if (byteRead < 0) { break; }
      payload.push(byteRead);
    }
    return utf8Decode(payload);
  }

  /** 在一套二值图上跑完整的解码流程 */
  function decodeFromBinary(binary, width, height) {
    var finders = findFinderPatterns(binary, width, height);
    if (finders.length < 3) { return null; }
    /* 光靠几何打分容易把「数据区的巧合图案」当成定位图案。
       最可靠的做法：把所有几何上说得通的候选组合都拿去真正解一次，
       谁能还原出合法的格式信息 + 通过 RS 校验，谁就是对的。 */
    var ranked = rankCandidates(finders);
    for (var ri = 0; ri < ranked.length; ri++) {
      var cand = ranked[ri];
      var text = tryDecodeWithGeometry(cand, binary, width, height);
      if (text !== null && text !== undefined) { return text; }
    }
    return null;
  }

  /** 从 ImageData 解码（多套阈值策略依次尝试） */
  function decodeImageData(imgData, width, height) {
    try {
      width = width || imgData.width;
      height = height || imgData.height;

      /* 第一轮：常规分块自适应阈值，适应光照不均 */
      var text = decodeFromBinary(binarize(imgData, width, height), width, height);
      if (text !== null && text !== undefined) { return text; }

      /* 第二轮：全局 Otsu 阈值兜底。
         程序生成的清晰二维码光照均匀，用全局阈值往往比自适应更稳 ——
         自适应在纯色区块可能把模块边缘判反，导致「图很清楚却识别不出来」。 */
      text = decodeFromBinary(binarizeOtsu(imgData, width, height), width, height);
      if (text !== null && text !== undefined) { return text; }

      return null;
    } catch (e) {
      if (window.console && console.warn) { console.warn('[owl-qr] 解码失败：', e); }
      return null;
    }
  }

  /** 全局 Otsu 阈值二值化（大津法），作为自适应阈值的兜底 */
  function binarizeOtsu(imgData, width, height) {
    var data = imgData.data || imgData;
    var gray = new Uint8Array(width * height);
    var hist = new Array(256);
    var i, p;
    for (i = 0; i < 256; i++) { hist[i] = 0; }

    for (i = 0, p = 0; i < gray.length; i++, p += 4) {
      var v = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
      gray[i] = v;
      hist[v | 0]++;
    }

    /* 大津法：找到让类间方差最大的阈值 */
    var total = gray.length;
    var sumAll = 0;
    for (i = 0; i < 256; i++) { sumAll += i * hist[i]; }
    var sumB = 0, wB = 0, best = 0, bestVar = -1;
    for (i = 0; i < 256; i++) {
      wB += hist[i];
      if (wB === 0) { continue; }
      var wF = total - wB;
      if (wF === 0) { break; }
      sumB += i * hist[i];
      var mB = sumB / wB;
      var mF = (sumAll - sumB) / wF;
      var between = wB * wF * (mB - mF) * (mB - mF);
      if (between > bestVar) { bestVar = between; best = i; }
    }
    /* 深色像素取严格小于，避免整图被判成同一色 */
    var threshold = best;

    var binary = [];
    for (var y = 0; y < height; y++) {
      var row = new Uint8Array(width);
      for (var x = 0; x < width; x++) {
        row[x] = gray[y * width + x] < threshold ? 1 : 0;
      }
      binary.push(row);
    }
    return binary;
  }

  /** 把三点组合按几何合理性排序（越像真的越靠前） */
  function rankCandidates(finders) {
    var out = [];
    for (var i = 0; i < finders.length; i++) {
      for (var j = i + 1; j < finders.length; j++) {
        for (var k = j + 1; k < finders.length; k++) {
          var pts = [finders[i], finders[j], finders[k]];
          for (var corner = 0; corner < 3; corner++) {
            var tl = pts[corner];
            var others = [];
            for (var o = 0; o < 3; o++) { if (o !== corner) { others.push(pts[o]); } }
            var v1 = { x: others[0].x - tl.x, y: others[0].y - tl.y };
            var v2 = { x: others[1].x - tl.x, y: others[1].y - tl.y };
            var cross = v1.x * v2.y - v1.y * v2.x;
            if (cross === 0) { continue; }              /* 三点共线，不构成直角 */
            /* 由叉积符号决定谁是右上、谁是左下：
               图像坐标 y 轴向下，叉积为正表示 others[0] 在顺时针一侧（即右上）。
               这样无论旋转多少度、三个点以何种顺序传入，都能得到正确的手性，
               不能写死成「others[0] 一定是右上」。 */
            var tr, bl;
            if (cross > 0) { tr = others[0]; bl = others[1]; }
            else { tr = others[1]; bl = others[0]; }

            var lenA = Math.hypot(tr.x - tl.x, tr.y - tl.y);
            var lenB = Math.hypot(bl.x - tl.x, bl.y - tl.y);
            if (lenA < 8 || lenB < 8) { continue; }

            var ratio = Math.abs(lenA - lenB) / Math.max(lenA, lenB);
            var dot = ((tr.x - tl.x) * (bl.x - tl.x) + (tr.y - tl.y) * (bl.y - tl.y)) / (lenA * lenB);
            var ortho = Math.abs(dot);
            if (ortho > 0.35) { continue; }            /* 必须接近直角 */

            var mAvg = (tl.moduleSize + tr.moduleSize + bl.moduleSize) / 3;
            var mMax = Math.max(tl.moduleSize, tr.moduleSize, bl.moduleSize);
            var mMin = Math.min(tl.moduleSize, tr.moduleSize, bl.moduleSize);
            var sizeSpread = (mMax - mMin) / mAvg;

            var spanAvg = (lenA + lenB) / 2;
            /* 两个定位图案中心相隔 (size - 7) 个模块，其中 size = 4v + 17，
               所以 dim = 4v + 10，反解版本 v = (dim - 10) / 4。
               注意 dim 不一定是 4 的倍数（例如 v4 时 dim = 26），
               因此要按「版本」取整，而不是把 dim 硬凑成 4 的倍数。 */
            var dimEst = spanAvg / mAvg;
            var verExact = (dimEst - 10) / 4;
            var estVer = Math.round(verExact);
            if (estVer < 1 || estVer > 40) { continue; }
            /* 以该版本对应的理论 dim 衡量误差，越接近说明几何越可信 */
            var dimIdeal = 4 * estVer + 10;
            var dimErr = dimIdeal > 0 ? Math.abs(dimEst - dimIdeal) / dimIdeal : 1;
            if (dimErr > 0.12) { continue; }           /* 尺寸明显对不上，直接排除 */

            out.push({
              tl: tl, tr: tr, bl: bl,
              span: spanAvg, moduleSize: mAvg, estVersion: estVer,
              score: ratio + ortho + sizeSpread * 2 + dimErr * 2
            });
          }
        }
      }
    }
    out.sort(function (a, b) { return a.score - b.score; });
    /* 几何过滤后仍可能有很多巧合组合，多试一些；
       每次尝试只是一次采样 + 解码，开销很小，换来识别率大幅提升 */
    return out.slice(0, 120);
  }

  /** 用给定几何关系采样并尝试解码 */
  /**
   * 采样一个模块的颜色，返回 0/1。
   * 单点取样在模块尺寸很小或网格略有偏移时容易取错，
   * 因此在模块中心附近取 3×3 的亚像素邻域投票，取多数值。
   */
  function sampleModule(binary, width, height, px, py, ux, uy, vx, vy) {
    /* 邻域步长取模块尺寸的 1/4，保证落在同一个模块内 */
    var stepX = (ux + vx) * 0.25, stepY = (uy + vy) * 0.25;
    var dark = 0, light = 0, total = 0;

    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        var sx = px + stepX * dx;
        var sy = py + stepY * dy;
        var ix = Math.round(sx), iy = Math.round(sy);
        if (ix < 0 || iy < 0 || ix >= width || iy >= height) { continue; }
        total++;
        if (binary[iy][ix]) { dark++; } else { light++; }
      }
    }
    if (!total) { return 0; }
    return dark > light ? 1 : 0;
  }

  function tryDecodeWithGeometry(cand, binary, width, height) {
    var versions = [cand.estVersion, cand.estVersion - 1, cand.estVersion + 1];
    for (var ci = 0; ci < versions.length; ci++) {
      var v = versions[ci];
      if (v < 1 || v > 40) { continue; }
      var size = versionSize(v);
      var dim = size - 7;   /* 三个定位中心之间的模块距离 */
      var ux = (cand.tr.x - cand.tl.x) / dim, uy = (cand.tr.y - cand.tl.y) / dim;
      var vx = (cand.bl.x - cand.tl.x) / dim, vy = (cand.bl.y - cand.tl.y) / dim;

      /* 采样原点存在一点不确定性：定位图案中心通常有几像素误差。
         在旋转 + 抗锯齿的图上，正好压在模块边界上时会整列读错。
         因此把原点在一个模块范围内做少量偏移，逐一尝试，
         只要有一次采样落在模块内部就能成功 —— 这比精确估计中心更鲁棒。 */
      var offsets = [
        [0, 0], [-0.25, 0], [0.25, 0], [0, -0.25], [0, 0.25],
        [-0.25, -0.25], [0.25, 0.25], [-0.25, 0.25], [0.25, -0.25]
      ];

      for (var oi = 0; oi < offsets.length; oi++) {
        var ox = offsets[oi][0], oy = offsets[oi][1];
        /* 定位图案中心在模块坐标 (3.5, 3.5)，外推得到矩阵原点；
           ox / oy 是以「模块」为单位的采样偏移量。 */
        var originX = cand.tl.x - 3.5 * (ux + vx) + ux * ox + vx * oy;
        var originY = cand.tl.y - 3.5 * (uy + vy) + uy * ox + vy * oy;

        var grid = [];
        for (var r = 0; r < size; r++) {
          var rowArr = new Uint8Array(size);
          for (var c = 0; c < size; c++) {
            var px = originX + ux * (c + 0.5) + vx * (r + 0.5);
            var py = originY + uy * (c + 0.5) + vy * (r + 0.5);
            rowArr[c] = sampleModule(binary, width, height, px, py, ux, uy, vx, vy);
          }
          grid.push(rowArr);
        }

        var text = decodeMatrix(grid, size);
        if (text !== null && text !== undefined) { return text; }
      }
    }
    return null;
  }

  function decodeCanvas(canvas) {
    var ctx = canvas.getContext('2d');
    var data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return decodeImageData(data, canvas.width, canvas.height);
  }

  /** 从图片文件解码（自动缩放到合适尺寸以提升识别率） */
  function decodeFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          var longest = Math.max(w, h);

          /* 只在必要时缩放：
             · 过大 → 等比缩小，控制耗时
             · 过小 → 放大，但放大倍数要保守。
               放大是用插值算出来的，会把模块边缘糊掉，反而降低识别率，
               所以阈值取 200px 而不是更大，且倍数不超过 2。 */
          var scale = 1;
          if (longest > 1400) {
            scale = 1400 / longest;
          } else if (longest < 200) {
            scale = Math.min(2, 200 / longest);
          }

          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));

          var canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          var ctx = canvas.getContext('2d');

          /* 缩放时关闭平滑，保持模块边缘锐利；放大时尤其重要 */
          if ('imageSmoothingEnabled' in ctx) { ctx.imageSmoothingEnabled = false; }
          if ('webkitImageSmoothingEnabled' in ctx) { ctx.webkitImageSmoothingEnabled = false; }
          if ('mozImageSmoothingEnabled' in ctx) { ctx.mozImageSmoothingEnabled = false; }

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, cw, ch);
          if (scale === 1) {
            ctx.drawImage(img, 0, 0);
          } else {
            ctx.drawImage(img, 0, 0, cw, ch);
          }

          var text = decodeCanvas(canvas);
          URL.revokeObjectURL(url);
          if (text === null || text === undefined) {
            resolve(null);
          } else {
            resolve(text);
          }
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('图片读取失败'));
      };
      img.src = url;
    });
  }

  /* ======================================================================
     七、对外暴露
     ====================================================================== */

  window.OWLQR = {
    encode: encode,
    toCanvas: toCanvas,
    toSvg: toSvg,
    decodeImageData: decodeImageData,
    decodeCanvas: decodeCanvas,
    decodeFile: decodeFile,
    versionSize: versionSize,
    _internal: {
      rsEncode: rsEncode,
      rsCorrect: rsCorrect,
      utf8Bytes: utf8Bytes,
      utf8Decode: utf8Decode,
      binarize: binarize,
      decodeMatrix: decodeMatrix,
      findFinderPatterns: findFinderPatterns,
      rankCandidates: rankCandidates
    }
  };

})(window);
