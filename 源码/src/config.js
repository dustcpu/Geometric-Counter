// ============================================================
// 几何任务栏小插件 · config.js
// 所有可调参数集中在这里。改手感只动这个文件。
// ============================================================
var GOW = globalThis.GOW = globalThis.GOW || {};

GOW.config = {
  // ---- 模拟任务栏带（阶段一）/ 覆盖窗口（阶段二）----
  W: 1600, H: 48,            // 逻辑尺寸（Dust 实测 200% DPI）

  // ---- 任务栏左侧空白区（实测 x 98–566，宽 468）----
  // 2026-09-17：整体左移 20px（x 78–546），与搜索框留出空隙（Dust）
  zone: { x: 78, width: 468 },
  fountain:    { x: 0, width: 300, slots: 6, slotGap: 50 },   // x 推导 = zone.x
  achievements:{ x: 0, width: 168 },                          // x 推导 = zone.x + fountain.width

  // ---- 任务栏右侧空白区（实测 x 1043–1290，宽 247）----
  // 鼠标拖尾季节粒子活动范围（Dust 2026-09-16 晚新增）
  rightZone: { x: 1043, width: 247 },

  // ---- 几何体（设计值：scale≈0.32、线宽 1.0、虚线 [3,2]）----
  scale: 0.32,
  lineWidth: 1.0,
  dash: [3, 2],
  shapeAlpha: 0.85,

  // ---- 喷泉运动（浮出 0.4s → 悬停存活 1.5s（可续命）→ 落下 0.4s）----
  waterY: 30,       // 水面线高度（48px 带内，水下 18px）
  submerge: 14,     // 完全没入水下时，几何中心低于水面线的深度
  hoverLift: 8,     // 悬停时几何中心高于水面线的距离
  riseDur: 0.4,
  idleTime: 1.5,    // 悬停存活时长：每次注入重置（续命），无注入则开始沉没
  fallDur: 0.4,

  // ---- 注入（2026-09-17 方案 A「满槽喂养」，Dust 定案）----
  // 空槽：随机浮出新几何体；满槽：随机喂养一个在场几何体——
  // 体型目标增长、沉没倒计时重置、溅水花。溢出从此不存在。
  injectStep: 0.010,  // 每次注入的体型目标增量（≈基线 scale 的 3%）
  scaleMax: 0.45,     // 体型上限（2026-09-18 收紧：0.55 会戳出卡片上缘）
  chargeStep: 0.34,   // 到顶后每次注入的蓄能增量（3 次充满）
  chargeDecay: 0.7,   // 蓄能每秒衰减（停手约 1.4s 回落）
  bobAmp: 1.5,      // 悬停时上下浮动幅度 px
  bobFreq: 1.6,     // 浮动角频率
  tiltAmp: 0.05,    // 倾斜幅度（弧度，约 2.9°）

  // ---- 海面 ----
  // ★ 2026-09-17：菱形格点退役，改为随机起伏的波浪线（ocean.js 生成，Dust：更有质感）
  waterColor: [115, 170, 225],

  // ---- 成就阶梯（★ 2026-09-19 重设）----
  // 语义：不再「集齐徽章」，而是「逐步把几何体放生到随机浮出池」——
  //   初始只会浮出正方体；每过一级，对应的一种几何体进入随机池。
  //   成就区永久陈列自转的彭罗斯三角（未全解锁时半透明）。
  // 旧版 100…7700 太易达顶（Dust 几天测试就逼近最高级）。
  // `pool: false` = 该级只做荣誉（点亮图腾），**不放生几何体进池**——
  //   彭罗斯三角按 Dust 2026-09-19 的要求只留在成就区，不从水里浮出来。
  // ⚠️ 想调难度只改这里的 at；thresholds 由它派生，其余代码全部读派生值。
  levels: [
    { at: 1000,   type: 'pyramid',    name: '三棱锥' },
    { at: 4000,   type: 'cylinder',   name: '圆柱' },
    { at: 15000,  type: 'cone',       name: '圆锥' },
    { at: 60000,  type: 'octahedron', name: '正八面体' },
    { at: 200000, type: 'hexPrism',   name: '六棱柱' },
    { at: 600000, type: 'penrose',    name: '彭罗斯三角', pool: false }
  ],
  baseTypes: ['cube'],      // 一开始就能浮出的几何体（未解锁任何级别时）

  // ---- 持久化（方案 A：单文件累计）----
  storageKey: 'gow_stats_v1',   // 网页版用 localStorage；桌面版换文件

  // ---- 主题自动切换（跟随系统时间）----
  nightFrom: 19,    // 19:00 之后
  nightTo: 7        // 07:00 之前 → 夜间
};

// 派生坐标：喷泉/成就区跟随项目区左缘，避免以后挪动时漏改
GOW.config.fountain.x = GOW.config.zone.x;
GOW.config.achievements.x = GOW.config.zone.x + GOW.config.fountain.width;

// 派生：阈值表（保持旧接口，成就模块的 levelFor 直接读它，勿手改）
GOW.config.thresholds = GOW.config.levels.map(function (l) { return l.at; });
