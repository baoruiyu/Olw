/* ==========================================================================
   猫头鹰教 The Owl Cult — tools/check-doc-identifiers.js
   文档守卫：确保页面上出现的「示例标识符」都不是可用的真实凭据。

   背景：曾经把 OWL1|Harmony|admin|2026-06-01|<真实校验码> 当作示例写在
   帮助卡片里，而它正好能登录内置管理员账号。这个脚本防止同类问题再次发生。

   用法：node tools/check-doc-identifiers.js
   退出码：0 = 全部安全；1 = 发现可用凭据或格式问题。
   ========================================================================== */

'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

/* 在 Node 里加载浏览器模块（它们都挂在 window 上） */
global.window = {};
require(path.join(ROOT, 'assets', 'owl-id.js'));
var OWLID = global.window.OWLID;

/* 要扫描的「面向用户」的文件（脚本本体不参与，避免误报自身） */
var TARGETS = [
  'login.html', 'join.html', 'member.html', 'admin.html',
  'index.html', 'about.html', 'gallery.html', 'shop.html',
  'assets/page-qr-login.js',
  'assets/page-admin-console.js',
  'assets/page-member-identity.js',
  'assets/owl-id.js'
];

/* 字段里不能出现竖线，否则贪婪匹配会把后面的字段一起吞掉。
   注意：英文名允许含空格（例如 Your Name / Zhang Wei），所以不能排除 \s ——
   否则带空格的真实标识符会被漏检（曾经因此让守卫形同虚设）。
   第 2–4 段允许 < >（格式说明里的占位符），第 5 段只允许 16 位十六进制。 */
var ID_RE = /OWL(?:1|R)\|[^|"'<>\n]{1,64}\|[^|"'<>\n]{1,32}\|[^|"'<>\n]{1,20}\|[0-9A-Fa-f]{16}/g;

function stripHtmlEntities(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

(async function main() {
  var problems = [];
  var checked = 0;
  var samples = [];

  for (var i = 0; i < TARGETS.length; i++) {
    var rel = TARGETS[i];
    var abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) { continue; }
    var text = stripHtmlEntities(fs.readFileSync(abs, 'utf8'));

    var m;
    ID_RE.lastIndex = 0;
    while ((m = ID_RE.exec(text)) !== null) {
      var raw = m[0];

      var parts = raw.split('|');
      if (parts.length !== 5) { continue; }
      /* 含占位符（<英文名> 之类）的是「格式说明」，不是具体样本 */
      if (/[<>]/.test(parts[1]) || /[<>]/.test(parts[2]) || /[<>]/.test(parts[3])) { continue; }

      checked++;
      var ok = await OWLID.verify(raw).then(function (r) { return r.ok; });
      samples.push({ file: rel, id: raw, usable: ok });
      if (ok) {
        problems.push(rel + ' 中出现「可实际使用」的标识符：' + raw);
      }
    }
  }

  console.log('扫描文件：' + TARGETS.length + ' 个');
  console.log('发现具体样本（16 位校验码）：' + checked + ' 条');
  samples.forEach(function (s) {
    console.log('  ' + (s.usable ? '✗ 可用（危险）' : '✓ 无效（安全）') + '  ' + s.file + '  ' + s.id);
  });

  if (problems.length) {
    console.log('\n发现 ' + problems.length + ' 处问题：');
    problems.forEach(function (p) { console.log('  - ' + p); });
    console.log('\n请把示例改成校验码为 0000000000000000 的形式（格式正确但永远无法通过校验）。');
    process.exit(1);
  }

  console.log('\n通过：文档里的示例标识符都不可用于登录。');
  process.exit(0);
})();
