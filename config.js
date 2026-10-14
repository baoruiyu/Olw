/* ==========================================================================
   猫头鹰教 The Owl Cult — config.js
   前端唯一需要手动填写的配置文件（不含任何密钥，可以安全上传到静态托管）

   ┌──────────────────────────────────────────────────────────────────────┐
   │ 必填：envId    —— 腾讯云开发 CloudBase 的「环境 ID」                  │
   │ 可选：region   —— 环境地域，默认 ap-shanghai（上海）                  │
   │ 可选：apiFunction —— 云函数名称，默认 owl-api                         │
   │ 可选：siteUrl  —— 站点访问地址（仅用于页面提示，不参与鉴权）           │
   └──────────────────────────────────────────────────────────────────────┘

   环境 ID 在哪看：
   CloudBase 控制台 → 打开你的环境 → 「环境总览 / 概览」页顶部，
   形如 owl-cult-3gxxxxxxxxxxxx 的一串字符，复制到这里即可。
   （详见 docs/部署手册.md 第 2 章、第 8 章）
   ========================================================================== */

window.OWL_CONFIG = window.OWL_CONFIG || {

  /* ① 必填：云开发环境 ID，把下面引号里的内容替换成你自己的环境 ID */
  envId: 'REPLACE_WITH_YOUR_ENV_ID',

  /* ② 环境地域：上海 ap-shanghai / 广州 ap-guangzhou / 新加坡 ap-singapore */
  region: 'ap-shanghai',

  /* ③ 后端云函数名称（与 cloud/functions/ 下的目录名保持一致） */
  apiFunction: 'owl-api',

  /* ④ 站点访问地址（可留空；填了只用于页面上的提示文案） */
  siteUrl: '',

  /* ⑤ 站点版本号（与 data.js 中的 version 保持一致即可） */
  version: '2.2.0',

  /* ⑥ 前端 SDK 的 CDN 地址（按顺序尝试，第一个失败会自动换下一个，一般不用改） */
  sdkUrls: [
    'https://static.cloudbase.net/cloudbase-js-sdk/2.28.6/cloudbase.full.js',
    'https://imgcache.qq.com/qcloud/cloudbase-js-sdk/2.28.6/cloudbase.full.js'
  ]
};

/* 便捷判断：环境 ID 是否已经填好（未填写时全站自动退化为纯静态模式） */
window.OWL_CONFIG.isReady = function () {
  var id = window.OWL_CONFIG.envId || '';
  return !!id && id.indexOf('REPLACE') !== 0 && id !== 'your-env-id';
};
