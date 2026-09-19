// ============================================================
// 几何任务栏小插件 · fountain.js
// 喷泉 v2 —— 方案 A「满槽注入」（2026-09-17 Dust 定案）：
//   空槽：随机挑一个空槽浮出新几何体（随机位置体验保留）
//   满槽：随机挑一个在场几何体「注入」这次按键——
//         体型目标 +injectStep（上限 scaleMax）、沉没倒计时重置、溅水花
//   悬停 idleTime 内无注入 → 开始沉没；落下期间体型缓回基线
//   溢出从此不存在（dropped 保留但恒为 0）；计数与动画解耦不变
// 半浸没裁切 + 水下倒影 + 破水水花 + 涟漪照旧。
// ============================================================
var GOW = globalThis.GOW = globalThis.GOW || {};

GOW.fountain = (function () {
  var cfg = GOW.config;
  var slots = [];        // { s: null | shape }
  var ripples = [];      // { x, age, life }
  var splashes = [];     // { x, y, vx, vy, r, age, life }
  var SPLASH_MAX = 30;
  var injected = 0;
  var spawned = 0;
  var peakScale = 0;

  var hoverCY = cfg.waterY - cfg.hoverLift;

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInCubic(t) { return t * t * t; }

  function init() {
    slots = [];
    for (var i = 0; i < cfg.fountain.slots; i++) slots.push({ s: null });
    ripples = [];
    splashes = [];
    injected = 0; spawned = 0; peakScale = 0;
  }

  function slotX(i) {
    return cfg.fountain.x + cfg.fountain.slotGap / 2 + i * cfg.fountain.slotGap;
  }

  // ★ 随机浮出池（2026-09-19 起由成就系统接管）：
  //   初始只有正方体，每解锁一级「放生」一种新几何体，最后一级放出彭罗斯三角。
  //   默认值仅为兜底（网页演示版未接成就池时用），实际由 setPool 覆盖。
  var TYPE_POOL = ['cube', 'pyramid', 'cylinder', 'cone', 'octahedron', 'hexPrism'];

  function setPool(list) {
    if (list && list.length) TYPE_POOL = list.slice();
  }

  function newShape(type, zone) {
    return {
      type: type,
      zone: zone,
      phase: 'rising',   // rising → hover → fall
      t: 0,              // 浮出计时
      h: 0,              // 悬停计时（浮动用）
      ft: 0,             // 落下计时
      idle: cfg.idleTime,
      phaseOffset: Math.random() * Math.PI * 2,
      scale: cfg.scale,
      scaleTarget: cfg.scale,
      charge: 0          // 蓄能：到顶后连打积攒，停手衰减（发光）
    };
  }

  function addRipple(x) {
    ripples.push({ x: x, age: 0, life: 0.7 });
    if (ripples.length > 12) ripples.shift();
  }

  // ---- 破水水花 ----
  function spawnSplash(x) {
    var n = 3 + (Math.random() * 4 | 0);
    for (var i = 0; i < n; i++) {
      if (splashes.length >= SPLASH_MAX) break;
      splashes.push({
        x: x + (Math.random() - 0.5) * 8,
        y: cfg.waterY + (Math.random() - 0.5) * 2,
        vx: (Math.random() - 0.5) * 50,
        vy: -(25 + Math.random() * 45),
        r: 0.8 + Math.random() * 0.9,
        age: 0,
        life: 0.35 + Math.random() * 0.3
      });
    }
  }

  // 每个去重后的按键调用一次。方案 A：空槽浮出 / 满槽注入，永不丢弃。
  // zone 仅作语义保留（统计在 keyboard 层按区累计）。
  function trySpawn(zone) {
    var free = [], occ = [], i;
    for (i = 0; i < slots.length; i++) (slots[i].s ? occ : free).push(i);

    if (free.length) {
      var si = free[(Math.random() * free.length) | 0];
      slots[si].s = newShape(TYPE_POOL[(Math.random() * TYPE_POOL.length) | 0], zone);
      spawned++;
      return true;
    }
    if (!occ.length) return false;   // 理论不可达（init 后恒有槽）

    // ---- 满槽收拢（2026-09-17 Dust 定案）----
    // 只留一个「留任者」满足放大要求（选当前最大的，成长有连续性）；
    // 其余立即进入沉没让位，位置对新的随机浮出开放。
    var champ = occ[0];
    for (i = 1; i < occ.length; i++) {
      if (slots[occ[i]].s.scaleTarget > slots[champ].s.scaleTarget) champ = occ[i];
    }
    var cs = slots[champ].s;
    cs.scaleTarget = Math.min(cfg.scaleMax, cs.scaleTarget + cfg.injectStep);
    // 已到体型上限 → 转为蓄能（连打时持续发光，停手回落）
    if (cs.scaleTarget >= cfg.scaleMax - 1e-6) {
      cs.charge = Math.min(1, (cs.charge || 0) + cfg.chargeStep);
    }
    if (cs.scaleTarget > peakScale) peakScale = cs.scaleTarget;
    cs.idle = cfg.idleTime;                 // 续命
    if (cs.phase === 'fall') { cs.phase = 'hover'; cs.h = 0; cs.ft = 0; }
    for (i = 0; i < occ.length; i++) {
      if (occ[i] === champ) continue;
      var os = slots[occ[i]].s;
      if (os.phase !== 'fall') { os.phase = 'fall'; os.ft = 0; }   // 让位沉没
    }
    injected++;
    spawnSplash(slotX(champ));
    addRipple(slotX(champ));
    return true;
  }

  function update(dt) {
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i].s;
      if (!s) continue;
      var cyBefore = centerY(s);

      if (s.phase === 'rising') {
        s.t += dt;
        if (s.t >= cfg.riseDur) { s.phase = 'hover'; s.h = 0; }
      } else if (s.phase === 'hover') {
        s.h += dt;
        s.idle -= dt;
        if (s.idle <= 0) s.phase = 'fall';
      } else { // fall
        s.ft += dt;
        s.scaleTarget = cfg.scale;   // 落下期间体型缓回基线
        if (s.ft >= cfg.fallDur) {
          slots[i].s = null;
          addRipple(slotX(i));
          continue;
        }
      }

      // 体型向目标缓动（注入的肿胀感 / 落下的回落感）
      s.scale += (s.scaleTarget - s.scale) * Math.min(1, dt * 8);

      // 蓄能衰减（停手约 1.4s 回落）
      if (s.charge > 0) s.charge = Math.max(0, s.charge - cfg.chargeDecay * dt);

      // 穿越水面线检测：浮出破水 / 沉没落水瞬间各喷一次水花
      var cyAfter = centerY(s);
      if ((cyBefore > cfg.waterY) !== (cyAfter > cfg.waterY)) {
        spawnSplash(slotX(i));
      }
    }
    for (var r = ripples.length - 1; r >= 0; r--) {
      ripples[r].age += dt;
      if (ripples[r].age >= ripples[r].life) ripples.splice(r, 1);
    }
    for (var p = splashes.length - 1; p >= 0; p--) {
      var sp = splashes[p];
      sp.age += dt;
      if (sp.age >= sp.life || sp.y > cfg.waterY + 2) { splashes.splice(p, 1); continue; }
      sp.vy += 170 * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
    }
  }

  // 由相位计算几何中心高度
  function centerY(s) {
    if (s.phase === 'rising') {
      var p = easeOutCubic(Math.min(1, s.t / cfg.riseDur));
      return cfg.waterY + cfg.submerge + (hoverCY - (cfg.waterY + cfg.submerge)) * p;
    }
    if (s.phase === 'hover') {
      // 浮动幅度在入悬停瞬间从 0 渐起，避免相位跳变
      var ramp = Math.min(1, 0.15 + s.h * 4);
      return hoverCY + Math.sin(s.h * cfg.bobFreq * Math.PI * 2 + s.phaseOffset) * cfg.bobAmp * ramp;
    }
    var p2 = easeInCubic(Math.min(1, s.ft / cfg.fallDur));
    return hoverCY + ((cfg.waterY + cfg.submerge) - hoverCY) * p2;
  }

  // drawShape 的 py（按几何体类型的基准点约定；side 随体型变化）
  function pyFor(type, cy, side) {
    if (type === 'pyramid' || type === 'cone') return cy + side / 2;
    if (type === 'octahedron') return cy;
    return cy - side / 2;   // cube / cylinder / hexPrism
  }

  function draw(ctx, tGlobal) {
    var d = GOW.theme.display;

    // 涟漪（压扁椭圆，模拟水面透视）
    for (var r = 0; r < ripples.length; r++) {
      var rp = ripples[r];
      var prog = rp.age / rp.life;
      var rad = 3 + prog * 14;
      ctx.strokeStyle = GOW.theme.rgb(cfg.waterColor, (1 - prog) * 0.35);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(rp.x, cfg.waterY, rad, rad * 0.35, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 几何体：裁切到水面以上，只画露出部分
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i].s;
      if (!s) continue;
      var x = slotX(i);
      var cy = centerY(s);
      var tilt = Math.sin(tGlobal * 1.4 + s.phaseOffset) * cfg.tiltAmp;
      var side = 28 * s.scale * 1.118;
      var py = pyFor(s.type, cy, side);

      ctx.save();
      ctx.beginPath();
      ctx.rect(-4, -4, cfg.W + 8, cfg.waterY + 4);
      ctx.clip();
      ctx.translate(x, cy);
      ctx.rotate(tilt);
      ctx.translate(-x, -cy);
      GOW.drawShape(ctx, d, s, x, py, s.scale, cfg.shapeAlpha,
        { lineWidth: cfg.lineWidth, dashPattern: cfg.dash });

      // ---- 蓄能光晕：charge > 0 时叠加一次加亮描绘（到顶后连打的反馈）----
      if (s.charge > 0.02) {
        ctx.globalCompositeOperation = 'lighter';
        GOW.drawShape(ctx, d, s, x, py, s.scale, 0.35 * s.charge,
          { lineWidth: cfg.lineWidth, dashPattern: cfg.dash });
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();

      // ---- 水下倒影：镜像翻转 + 极淡，画在水面线以下 ----
      ctx.save();
      ctx.beginPath();
      ctx.rect(-4, cfg.waterY, cfg.W + 8, cfg.H - cfg.waterY + 4);
      ctx.clip();
      ctx.translate(0, 2 * cfg.waterY);
      ctx.scale(1, -1);
      ctx.translate(x, cy);
      ctx.rotate(tilt);
      ctx.translate(-x, -cy);
      GOW.drawShape(ctx, d, s, x, py, s.scale, 0.09 + (d.glow || 0) * 0.05,
        { lineWidth: cfg.lineWidth, dashPattern: cfg.dash });
      ctx.restore();
    }

    // 破水水珠（画在几何体之上，更醒目）
    for (var q = 0; q < splashes.length; q++) {
      var dp = splashes[q];
      var dprog = dp.age / dp.life;
      ctx.fillStyle = GOW.theme.rgb(cfg.waterColor, (1 - dprog) * 0.8);
      ctx.beginPath();
      ctx.arc(dp.x, dp.y, dp.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return {
    init: init,
    trySpawn: trySpawn,
    update: update,
    draw: draw,
    dropped: function () { return 0; },   // 收拢机制后恒为 0（保留接口兼容）
    injected: function () { return injected; },
    spawned: function () { return spawned; },
    peakScale: function () { return peakScale; },
    // 在场且未在沉没中的数量（收拢后应只剩留任者）
    hoverCount: function () {
      var n = 0;
      for (var i = 0; i < slots.length; i++) {
        if (slots[i].s && slots[i].s.phase !== 'fall') n++;
      }
      return n;
    },
    activeCount: function () {
      var n = 0;
      for (var i = 0; i < slots.length; i++) if (slots[i].s) n++;
      return n;
    },
    setPool: setPool,
    pool: function () { return TYPE_POOL.slice(); }
  };
})();
