/* ==========================================================================
   猫头鹰教 The Owl Cult — data.js
   站点数据文件（公告 / 版本更新记录）

   使用说明（可自行增删，改完保存刷新页面即可，无需改其它文件）：
   1. version   ：当前站点版本号，改动它会触发访客看到「更新日志」弹窗。
   2. updatedAt ：本次更新时间，显示在页脚与更新卡片上。
   3. changelog ：版本更新日志，数组，**请按版本从新到旧排列**。
                  每项：{ version, date, items: [ { zh, en } ] }
   4. announcements：公告，数组，**请按日期从新到旧排列**。
                  每项：{ id, date, level: 'info' | 'notice', zh, en, link?: { href, zh, en } }
                  id 必须唯一（访客关闭某条公告时按 id 记录，不会重复弹出）。
   ========================================================================== */

window.OWL_SITE = {

  /* ---------- 当前版本 ---------- */
  version: '2.1.0',
  updatedAt: '2026-09-13',

  /* ---------- 版本更新记录（从新到旧） ---------- */
  changelog: [
    {
      version: '2.1.0',
      date: '2026-09-13',
      items: [
        { zh: '新增「公告栏」：导航栏下方支持多条公告轮播、上一条/下一条切换与一键关闭。', en: 'New announcement bar: rotate multiple notices below the navbar, with previous/next and one-click dismiss.' },
        { zh: '新增「版本更新提示」：版本变化时右下角弹出更新日志卡片，可标记已读。', en: 'New version notice: a What\'s New card appears in the bottom-right when the version changes.' },
        { zh: '加入方式页的微信号与邮箱支持一键复制，并给出「已复制」提示。', en: 'WeChat ID and email on the Join page can now be copied with one click.' },
        { zh: '关于页新增可折叠的完整更新记录面板（默认收起）。', en: 'The About page gains a collapsible full changelog panel (collapsed by default).' },
        { zh: '页脚显示当前版本号与更新时间。', en: 'The footer now shows the current version and update date.' }
      ]
    },
    {
      version: '2.0.0',
      date: '2026-09-13',
      items: [
        { zh: '全站视觉升级：金色渐变标题、玻璃拟态卡片、按钮光泽扫过。', en: 'Full visual upgrade: gold gradient titles, glassmorphism cards, glossy buttons.' },
        { zh: '新增滚动显现动画、顶部滚动进度条、回到顶部按钮。', en: 'Added scroll reveal animations, a top progress bar and a back-to-top button.' },
        { zh: '新增图片灯箱：点击放大，支持 ← / → 切换与 ESC 关闭。', en: 'Added an image lightbox: click to zoom, browse with arrows, close with ESC.' },
        { zh: '首页 hero 叠加轻量 Canvas 星空萤火粒子，窄屏支持汉堡菜单。', en: 'A lightweight canvas starfield on the hero, plus a hamburger menu on narrow screens.' },
        { zh: '全站图片懒加载，中英文切换状态跨页面保持。', en: 'Site-wide lazy loading, with the language choice remembered across pages.' }
      ]
    },
    {
      version: '1.1.0',
      date: '2026-09-12',
      items: [
        { zh: '页脚新增「夜之箴言」：随机展示双语金句，可点「换一句」更换。', en: 'The footer gains a Night Proverb: a random bilingual line with a "Another" button.' },
        { zh: '四个页面的导航栏与页脚结构、命名统一。', en: 'Unified the navbar and footer structure across all four pages.' }
      ]
    },
    {
      version: '1.0.0',
      date: '2026-09-11',
      items: [
        { zh: '站点上线：首页 / 画廊 / 关于 / 加入方式四页结构。', en: 'Site launched: Home, Gallery, About and Join pages.' },
        { zh: '画廊收录 owl1~owl9 九张猫头鹰图片，支持中英双语图注。', en: 'Gallery collects nine owl photos (owl1-owl9) with bilingual captions.' },
        { zh: '上线中英文一键切换。', en: 'One-click Chinese/English switching.' }
      ]
    }
  ],

  /* ---------- 公告（从新到旧） ---------- */
  announcements: [
    {
      id: '2026-09-13-v210',
      date: '2026-09-13',
      level: 'notice',
      zh: '站点已升级至 v2.1.0：新增公告栏与版本更新提示，加入方式支持一键复制。',
      en: 'The site has been upgraded to v2.1.0: announcement bar, version notice, and one-click copy on the Join page.',
      link: { href: 'about.html#changelog', zh: '查看更新记录', en: 'View changelog' }
    },
    {
      id: '2026-09-12-gathering',
      date: '2026-09-12',
      level: 'info',
      zh: '下次满月集会定于 9 月 26 日 23:00 开始，地点将在联系后单独通知。咕咪。',
      en: 'The next full-moon gathering starts at 23:00 on September 26. The location will be shared privately after you get in touch. Gu Mi.',
      link: { href: 'join.html', zh: '获取加入方式', en: 'How to join' }
    },
    {
      id: '2026-09-11-welcome',
      date: '2026-09-11',
      level: 'info',
      zh: '欢迎来到猫头鹰教。画廊已开放，点击任意图片即可放大浏览。',
      en: 'Welcome to The Owl Cult. The gallery is open — click any image to enlarge it.'
    }
  ]

};
