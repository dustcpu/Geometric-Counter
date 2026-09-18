// ============================================================
// 几何任务栏小插件 · ocean.js
// 透明覆盖模式的海面，分两层（2026-09-17 重构）：
//   drawWaves     背景层：3 条随机起伏的波浪线（替代原菱形格点，
//                 Dust：像海浪一样随机上下起伏，更有质感）——画在几何体后面
//   drawWaterline 前景层：双层水面线 —— 最后画，横穿几何体下半部，
//                 这才是「浸在水里」而不是「浮在线后」
// 背景不填充 —— 任务栏原色透出（阶段一由页面模拟任务栏底色）。
// 海面只存在于项目区域（任务栏左侧空白 x 98–566）。
// ============================================================
var GOW = globalThis.GOW = globalThis.GOW || {};

GOW.ocean = (function () {
  var cfg = GOW.config;

  // ---- 波浪线参数：初始化时随机生成一次（每条频率/振幅/速度/相位都不同）----
  var waveLines = [];
  (function () {
    var offsets = [-7, -13, -19];   // 相对水面线的高度（越远越高、越淡）
    for (var i = 0; i < offsets.length; i++) {
      waveLines.push({
        base: cfg.waterY + offsets[i],
        f1: 0.008 + Math.random() * 0.008,    // 低频长波
        amp1: 1.6 + Math.random() * 1.6,
        sp1: 0.35 + Math.random() * 0.5,
        ph1: Math.random() * Math.PI * 2,
        f2: 0.028 + Math.random() * 0.02,     // 高频碎波
        amp2: 0.7 + Math.random() * 0.9,
        sp2: -0.6 + Math.random() * 1.2,
        ph2: Math.random() * Math.PI * 2
      });
    }
  })();

  // ---- 背景层：波浪线 ----
  function drawWaves(ctx, t) {
    var zx = cfg.zone.x, zw = cfg.zone.width;
    ctx.save();
    ctx.beginPath();
    ctx.rect(zx, 0, zw, cfg.waterY);
    ctx.clip();
    ctx.lineWidth = 1;
    for (var i = 0; i < waveLines.length; i++) {
      var w = waveLines[i];
      var a = 0.18 * (1 - i * 0.28);   // 近浓远淡（每线独立浓度）
      // 水平渐隐画笔：浓度直接写入渐变端点（两端 10% 溶解，中段保持该线浓度）
      var g = ctx.createLinearGradient(zx, 0, zx + zw, 0);
      g.addColorStop(0, GOW.theme.rgb(cfg.waterColor, 0));
      g.addColorStop(0.1, GOW.theme.rgb(cfg.waterColor, a));
      g.addColorStop(0.9, GOW.theme.rgb(cfg.waterColor, a));
      g.addColorStop(1, GOW.theme.rgb(cfg.waterColor, 0));
      ctx.strokeStyle = g;
      ctx.beginPath();
      for (var x = zx; x <= zx + zw; x += 4) {
        var y = w.base
          + Math.sin(x * w.f1 + t * w.sp1 + w.ph1) * w.amp1
          + Math.sin(x * w.f2 - t * w.sp2 + w.ph2) * w.amp2;
        if (x === zx) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- 前景层：水面线（双层：主线 + 下方淡影）----
  function drawWaterline(ctx, t) {
    var zx = cfg.zone.x, zw = cfg.zone.width, wy = cfg.waterY;
    ctx.save();
    ctx.beginPath();
    ctx.rect(zx, -4, zw, cfg.H + 8);
    ctx.clip();
    ctx.lineCap = 'round';
    for (var layer = 0; layer < 2; layer++) {
      var a = layer === 0 ? 0.4 : 0.15;
      // 每层独立渐隐画笔（浓度写入端点）
      var g = ctx.createLinearGradient(zx, 0, zx + zw, 0);
      g.addColorStop(0, GOW.theme.rgb(cfg.waterColor, 0));
      g.addColorStop(0.1, GOW.theme.rgb(cfg.waterColor, a));
      g.addColorStop(0.9, GOW.theme.rgb(cfg.waterColor, a));
      g.addColorStop(1, GOW.theme.rgb(cfg.waterColor, 0));
      ctx.beginPath();
      for (var x = zx; x <= zx + zw; x += 4) {
        var y = wy
          + Math.sin(x * 0.018 + t * 1.1) * 1.8
          + Math.sin(x * 0.041 - t * 0.7) * 1.0
          + (layer === 1 ? 2.5 : 0);
        if (x === zx) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = g;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  return { drawWaves: drawWaves, drawWaterline: drawWaterline };
})();
