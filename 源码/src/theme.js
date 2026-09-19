// ============================================================
// 几何任务栏小插件 · theme.js
// 昼夜 × 四季五套配色 + 每帧向目标色插值（从几何岛屿 app.js 平移）
// ============================================================
var GOW = globalThis.GOW = globalThis.GOW || {};

GOW.theme = (function () {
  var cfg = GOW.config;

  // ---- 色表（几何岛屿 app.js:1175 原样平移）----
  // 注：water / grid 字段已退役——海面颜色固定为 config.waterColor（蓝色），
  // 不随主题变化（Dust 2026-09-16）。保留字段仅为数据完整性。
  var SEASON_COLORS = {
    spring: {
      bg: [[240,249,240],[227,242,227],[200,230,200]],
      tileLow: [180,220,180], tileHigh: [242,252,242],
      solid: [60,140,80],  dash: [60,140,80],
      water: [100,180,120], grid: [60,140,80]
    },
    summer: {
      bg: [[244,249,255],[234,243,252],[207,228,247]],
      tileLow: [191,220,243], tileHigh: [255,255,255],
      solid: [70,120,175],  dash: [70,120,175],
      water: [115,170,225], grid: [36,85,140]
    },
    autumn: {
      bg: [[255,248,240],[253,238,221],[245,213,176]],
      tileLow: [235,205,165], tileHigh: [255,242,222],
      solid: [180,100,30],  dash: [180,100,30],
      water: [220,150,70],  grid: [160,90,25]   // 已退役（海面固定蓝）
    },
    winter: {
      bg: [[248,244,252],[237,228,247],[213,197,232]],
      tileLow: [200,185,225], tileHigh: [242,234,250],
      solid: [110,80,160],  dash: [110,80,160],
      water: [155,126,201], grid: [90,60,140]
    }
  };
  var NIGHT_COLORS = {
    bg: [[10,14,26],[13,21,37],[20,30,53]],
    tileLow: [18,28,52], tileHigh: [32,46,74],
    solid: [170,200,240], dash: [170,200,240],
    water: [130,180,240], grid: [80,120,180]
  };

  // 当前插值后的显示色（canvas 每帧向目标靠近，约 1s 平滑）
  var display = {
    tileLow: [191,220,243], tileHigh: [255,255,255],
    solid: [70,120,175],  dash: [70,120,175],
    water: [115,170,225], grid: [36,85,140],
    glow: 0               // 夜间发光强度 0~1
  };

  var mode = 'day';
  // 季节按真实月份（3–5 春 / 6–8 夏 / 9–11 秋 / 12–2 冬）
  function seasonByMonth(d) {
    var m = (d || new Date()).getMonth();
    if (m >= 2 && m <= 4) return 'spring';
    if (m >= 5 && m <= 7) return 'summer';
    if (m >= 8 && m <= 10) return 'autumn';
    return 'winter';
  }
  var season = seasonByMonth();
  var auto = true;          // 自动模式：昼夜看时刻、季节看月份
  var lastSynced = '';      // body 类名去重（避免每帧 classList 写入）

  function autoApply() {
    if (!auto) return;
    var now = new Date();
    var s = seasonByMonth(now);
    if (s !== season) season = s;   // 跨月自动换季（长期不重启也不会停在旧季节）
    var h = now.getHours();
    mode = (h >= cfg.nightFrom || h < cfg.nightTo) ? 'night' : 'day';
  }

  function target() {
    return mode === 'night' ? NIGHT_COLORS : SEASON_COLORS[season];
  }

  function lerpArr(a, b, f) {
    for (var k = 0; k < a.length; k++) a[k] += (b[k] - a[k]) * f;
  }

  function update(dt, reducedMotion) {
    autoApply();
    var f = reducedMotion ? 1 : (1 - Math.pow(0.001, dt)); // ~1s 平滑
    var t = target();
    lerpArr(display.tileLow, t.tileLow, f);
    lerpArr(display.tileHigh, t.tileHigh, f);
    lerpArr(display.solid, t.solid, f);
    lerpArr(display.dash, t.dash, f);
    lerpArr(display.water, t.water, f);
    lerpArr(display.grid, t.grid, f);
    var g = mode === 'night' ? 1 : 0;
    display.glow += (g - display.glow) * f;
    syncBody();
  }

  function rgb(c, a) {
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
  }

  // body 类名同步（彭罗斯三角 CSS 关键帧按类名切主题）
  function syncBody(force) {
    if (typeof document === 'undefined') return;
    var key = mode + '-' + season;
    if (!force && key === lastSynced) return;
    lastSynced = key;
    var b = document.body;
    b.classList.remove('night', 'season-spring', 'season-summer', 'season-autumn', 'season-winter');
    if (mode === 'night') b.classList.add('night');
    else b.classList.add('season-' + season);
  }

  // ---- 演示控制（阶段二会移除手动切换）----
  function setMode(m)   { auto = false; mode = m; syncBody(true); }
  function setSeason(s) { auto = false; season = s; mode = 'day'; syncBody(true); }
  // ★ 2026-09-19 修 bug：原实现只置 auto=true，season 仍停在上一次手动选的季节
  //   → 手动点过「春」之后再点「自动」，季节一直是春，看着就是「自动没效果」。
  //   自动 = 昼夜看时刻、季节看月份，所以这里必须把季节也拉回「按月份」。
  function setAuto()    { season = seasonByMonth(); auto = true; syncBody(true); }

  return {
    display: display,
    update: update,
    rgb: rgb,
    setMode: setMode,
    setSeason: setSeason,
    setAuto: setAuto,
    isAuto: function () { return auto; },
    mode: function () { return mode; },
    season: function () { return season; }
  };
})();
