// ============================================================
// 几何任务栏小插件 · trail.js
// 右侧空白区（config.rightZone，实测 x 1043–1290）的季节粒子。
// ★ 随打字生成（Dust 2026-09-16 晚定稿：不是鼠标触发）——
//   每个按键在右侧区域随机位置撒 1 个粒子，打字快粒子多、慢则少。
//   运动参数沿用几何岛屿 MouseTrail（app.js:2843+），
//   绘制简化适配 48px 条带：春花瓣 / 夏蒲公英 / 秋银杏 / 冬雪花 / 夜星尘。
// 画在主 band canvas 上，clip 到右侧区域，不碰喷泉与海面。
// ============================================================
var GOW = globalThis.GOW = globalThis.GOW || {};

GOW.trail = (function () {
  var cfg = GOW.config;
  var MAX = 40;          // 粒子池上限
  // 区域每次调用时从 cfg 读取（支持桌面壳的自适应布局动态改区）
  function zx() { return cfg.rightZone.x; }
  function zw() { return cfg.rightZone.width; }

  function rand(a, b) { return a + Math.random() * (b - a); }

  // 五套粒子配置（rate=个/秒；life 帧值 /60 转秒；gravity px/s²；drag 每 1/60s 阻尼）
  var CONFIG = {
    spring: { rate: [18, 26], life: [45, 62], size: [2.2, 4.2], color: '#f8c8d8',
              vx: [-14, 14], vy: [-12, 6], gravity: 14, drag: 0.955,
              rotSpeed: [-3.2, 3.2], sway: 6, swayFreq: [1.2, 2.2] },
    summer: { rate: [10, 15], life: [80, 120], size: [2.4, 4.0], color: '#ffffff',
              speed: [5, 12], gravity: 3, drag: 0.985, wind: [30, 70],
              rotSpeed: [-1.4, 1.4], sway: 0, swayFreq: [1, 1] },
    autumn: { rate: [18, 26], life: [50, 68], size: [2.6, 4.6], color: '#e8b83a',
              vx: [-10, 10], vy: [4, 14], gravity: 20, drag: 0.96,
              rotSpeed: [-2.4, 2.4], sway: 30, swayFreq: [2.2, 3.4] },
    winter: { rate: [16, 24], life: [60, 80], size: [2.0, 3.8], color: '#dbe8fa',
              vx: [-6, 6], vy: [2, 8], gravity: 8, drag: 0.968,
              rotSpeed: [-1.0, 1.0], sway: 4, swayFreq: [0.8, 1.6] },
    night:  { rate: [5, 7], life: [60, 85], size: [1.4, 2.6], color: '#fffbe6',
              speed: [3, 9], gravity: 0, drag: 0.985,
              rotSpeed: [0, 0], sway: 0, swayFreq: [1, 1], twinkle: 0.55 }
  };

  var particles = [];

  function type() {
    var th = GOW.theme;
    return th.mode() === 'night' ? 'night' : th.season();
  }

  // ★ 每个按键调用一次：在右侧区域随机位置生成 1 个粒子
  //   右侧区域宽为 0（没空间）时直接不生成
  function onKey() {
    if (particles.length >= MAX) return;
    if (zw() < 40) return;
    var t = type();
    spawn(t, CONFIG[t], rand(zx() + 4, zx() + zw() - 4), rand(6, cfg.H - 10));
  }

  function spawn(t, c, x, y) {
    var p = {
      type: t,
      x: x, y: y, vx: 0, vy: 0,
      age: 0,
      size: rand(c.size[0], c.size[1]),
      rot: Math.random() * Math.PI * 2,
      rotSpeed: rand(c.rotSpeed[0], c.rotSpeed[1]),
      swayPhase: Math.random() * Math.PI * 2,
      swayFreq: rand(c.swayFreq[0], c.swayFreq[1]),
      twinklePhase: Math.random() * Math.PI * 2,
      maxLife: rand(c.life[0], c.life[1]) / 60
    };
    p.life = p.maxLife;
    if (c.speed) {
      var ang = Math.random() * Math.PI * 2;
      var sp = rand(c.speed[0], c.speed[1]);
      p.vx = Math.cos(ang) * sp;
      p.vy = Math.sin(ang) * sp;
    } else {
      p.vx = rand(c.vx[0], c.vx[1]);
      p.vy = rand(c.vy[0], c.vy[1]);
    }
    // 形态参数生成时定死（绘制层不引入每帧随机）
    if (t === 'spring') {
      p.floret = Math.random() < 0.125;          // 1/8 概率五瓣小桃花
    } else if (t === 'summer') {
      p.bristles = [];                            // 冠毛 8~12 条
      var nB = 8 + (Math.random() * 5 | 0);
      for (var ib = 0; ib < nB; ib++) {
        p.bristles.push({ a: -Math.PI / 2 + (Math.random() - 0.5) * 2.4, len: 0.75 + Math.random() * 0.5 });
      }
      p.windX = (Math.random() < 0.5 ? -1 : 1) * rand(c.wind[0], c.wind[1]);
      p.windY = rand(-18, 5);
    }
    particles.push(p);
  }

  function update(dt) {
    var c = CONFIG[type()];
    var dragF = Math.pow(c.drag, dt * 60);
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.age += dt;
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vx *= dragF; p.vy *= dragF;
      p.vy += c.gravity * dt;
      p.x += p.vx * dt + (p.windX || 0) * dt
           + (c.sway ? Math.sin(p.age * p.swayFreq * Math.PI * 2 + p.swayPhase) * c.sway * dt : 0);
      p.y += p.vy * dt + (p.windY || 0) * dt;
      p.rot += p.rotSpeed * dt;
      if (p.x < zx() - 6 || p.x > zx() + zw() + 6 || p.y < -8 || p.y > cfg.H + 8) {
        particles.splice(i, 1);
      }
    }
  }

  // ---- 绘制（小尺寸简化：花瓣/冠毛/扇叶/枝晶/光点）----
  function petalPath(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(s * 0.85, -s * 0.25, 0, s);
    ctx.quadraticCurveTo(-s * 0.85, -s * 0.25, 0, -s);
    ctx.closePath();
    ctx.fill();
  }

  function drawOne(ctx, p) {
    var c = CONFIG[p.type];
    ctx.fillStyle = c.color;
    ctx.strokeStyle = c.color;
    var s = p.size;

    if (p.type === 'spring') {
      if (p.floret) {
        for (var k = 0; k < 5; k++) {
          ctx.save();
          ctx.rotate(k * Math.PI * 2 / 5);
          ctx.translate(0, -s * 0.55);
          petalPath(ctx, s * 0.42);
          ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = '#e87a9a';
        ctx.fill();
      } else {
        petalPath(ctx, s);
      }

    } else if (p.type === 'summer') {
      // 冠毛朝上 + 细梗 + 种子
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (var b = 0; b < p.bristles.length; b++) {
        var br = p.bristles[b];
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.sin(br.a) * s * br.len * 1.6, -Math.cos(br.a) * s * br.len * 1.6);
      }
      ctx.moveTo(0, 0);
      ctx.lineTo(0, s * 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, s * 0.9, s * 0.22, 0, Math.PI * 2);
      ctx.fill();

    } else if (p.type === 'autumn') {
      // 银杏扇叶：以叶柄为圆心的上扇面 + 细柄
      ctx.beginPath();
      ctx.moveTo(0, s * 0.9);
      ctx.arc(0, s * 0.9, s, Math.PI * 1.5 - 1.05, Math.PI * 1.5 + 1.05);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.9);
      ctx.lineTo(0, s * 1.35);
      ctx.stroke();

    } else if (p.type === 'winter') {
      // 六臂枝晶
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (var a = 0; a < 6; a++) {
        var ang = a * Math.PI / 3;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.sin(ang) * s, -Math.cos(ang) * s);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
      ctx.fill();

    } else { // night 星尘：光点 + 四芒针
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha *= 0.5;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-s * 1.7, 0); ctx.lineTo(s * 1.7, 0);
      ctx.moveTo(0, -s * 1.7); ctx.lineTo(0, s * 1.7);
      ctx.stroke();
    }
  }

  function draw(ctx) {
    if (!particles.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(zx(), 0, zw(), cfg.H);
    ctx.clip();
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var prog = 1 - p.life / p.maxLife;   // 0 新生 → 1 消亡
      var alpha = prog < 0.15 ? prog / 0.15 : (prog > 0.6 ? (1 - prog) / 0.4 : 1);
      if (p.type === 'night') {
        alpha *= 0.7 + 0.3 * Math.sin(p.age * 6 + p.twinklePhase);
      }
      if (alpha <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      drawOne(ctx, p);
      ctx.restore();
    }
    ctx.restore();
  }

  return {
    onKey: onKey,
    update: update,
    draw: draw,
    count: function () { return particles.length; },
    type: type
  };
})();
