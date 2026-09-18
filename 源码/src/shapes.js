// ============================================================
// 几何任务栏小插件 · shapes.js
// 等距线稿几何体绘制 —— 从几何岛屿 app.js:1646 的 drawShape 整段平移。
// 差异：lineWidth / 虚线间隔参数化（任务栏小尺寸需要 1.0 / [3,2]）；
//       颜色与 glow 从参数传入（不再读全局 themeDisplay）。
// 等距投影约定：X-Y 平面水平、Z 轴垂直
//   → 立方体顶面菱形宽高比 2:1（半宽 a、半高 a/2）
//   → 菱形一边的等距投影 = a√5/2 ≈ 1.118a
//   → 立方体棱长（垂直）= 1.118a，让顶/底菱形对齐
// 纪念碑谷线稿风格：不填充，只描边；可见线实线 + 不可见线虚线
// ============================================================
var GOW = globalThis.GOW = globalThis.GOW || {};

GOW.drawShape = function (ctx, colors, s, px, py, scale, alpha, opts) {
  var A = 28 * scale;            // 顶面菱形半宽
  var Hh = A * 0.5;              // 顶面菱形半高
  var side = A * 1.118;          // 立方体棱长（垂直）
  var lw = (opts && opts.lineWidth) || 1.8;
  var dashP = (opts && opts.dashPattern) || [4, 3];

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  var sc = colors.solid, dc = colors.dash, glow = colors.glow || 0;
  var SOLID = 'rgba(' + (sc[0] | 0) + ',' + (sc[1] | 0) + ',' + (sc[2] | 0) + ',0.75)';
  var DASH  = 'rgba(' + (dc[0] | 0) + ',' + (dc[1] | 0) + ',' + (dc[2] | 0) + ',0.45)';
  if (glow > 0.3) {
    ctx.shadowColor = 'rgba(' + (sc[0] | 0) + ',' + (sc[1] | 0) + ',' + (sc[2] | 0) + ',' + (glow * 0.5).toFixed(2) + ')';
    ctx.shadowBlur = 8 * glow;
  }

  // 画一条线（实或虚）
  function line(p1, p2, color, dashed) {
    ctx.strokeStyle = color;
    ctx.setLineDash(dashed ? dashP : []);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  // 画一串首尾相接线段
  function poly(points, color, dashed, closed) {
    ctx.strokeStyle = color;
    ctx.setLineDash(dashed ? dashP : []);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    if (closed) ctx.closePath();
    ctx.stroke();
  }

  if (s.type === 'cube') {
    var tT = { x: px,     y: py - Hh };
    var tR = { x: px + A, y: py };
    var tB = { x: px,     y: py + Hh };
    var tL = { x: px - A, y: py };
    var bT = { x: tT.x,   y: tT.y + side };
    var bR = { x: tR.x,   y: tR.y + side };
    var bB = { x: tB.x,   y: tB.y + side };
    var bL = { x: tL.x,   y: tL.y + side };

    // 不可见（虚线）：底面背面两条 + 后棱
    line(bT, bR, DASH, true);
    line(bT, bL, DASH, true);
    line(tT, bT, DASH, true);
    // 可见：顶面菱形 + 底面正面两条 + 3 条前棱
    poly([tT, tR, tB, tL], SOLID, false, true);
    line(bR, bB, SOLID, false);
    line(bB, bL, SOLID, false);
    line(tL, bL, SOLID, false);
    line(tR, bR, SOLID, false);
    line(tB, bB, SOLID, false);

  } else if (s.type === 'pyramid') {
    var baseHW = A * 0.5;
    var baseHH = A * 0.25;
    var height = side;
    var ba = { x: px,          y: py - baseHH }; // 后
    var bb = { x: px + baseHW, y: py };          // 右
    var bc = { x: px,          y: py + baseHH }; // 前
    var bd = { x: px - baseHW, y: py };          // 左
    var Tp = { x: px, y: py - height };

    poly([ba, bb, bc, bd], DASH, true, true);  // 底面整圈虚线
    line(Tp, ba, DASH, true);                  // 后侧棱虚线
    line(Tp, bb, SOLID, false);                // 3 条可见侧棱
    line(Tp, bc, SOLID, false);
    line(Tp, bd, SOLID, false);
    line(bb, bc, SOLID, false);                // 可见底边实线覆盖
    line(bc, bd, SOLID, false);

  } else if (s.type === 'cylinder') {
    var rx = A, ry = A * 0.5, cylH = side;
    var topY = py - side * 0.5;
    var botY = topY + cylH;

    // 底椭圆后半（背向）虚线
    ctx.strokeStyle = DASH;
    ctx.setLineDash(dashP);
    ctx.beginPath();
    ctx.ellipse(px, botY, rx, ry, 0, Math.PI, 2 * Math.PI, false);
    ctx.stroke();
    // 底椭圆前半（面向）实线
    ctx.strokeStyle = SOLID;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.ellipse(px, botY, rx, ry, 0, 0, Math.PI, false);
    ctx.stroke();
    // 顶椭圆整圈
    ctx.strokeStyle = SOLID;
    ctx.beginPath();
    ctx.ellipse(px, topY, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    // 左右母线
    line({ x: px - rx, y: topY }, { x: px - rx, y: botY }, SOLID, false);
    line({ x: px + rx, y: topY }, { x: px + rx, y: botY }, SOLID, false);

  } else if (s.type === 'cone') {
    var cRx = A, cRy = A * 0.5, cH = side;
    var cApex = { x: px, y: py - cH };
    // 底椭圆后半弧虚线
    ctx.strokeStyle = DASH;
    ctx.setLineDash(dashP);
    ctx.beginPath();
    ctx.ellipse(px, py, cRx, cRy, 0, Math.PI, 2 * Math.PI, false);
    ctx.stroke();
    // 背面母线虚线
    line(cApex, { x: px, y: py - cRy }, DASH, true);
    // 底椭圆前半弧实线
    ctx.strokeStyle = SOLID;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.ellipse(px, py, cRx, cRy, 0, 0, Math.PI, false);
    ctx.stroke();
    // 两条轮廓母线
    line(cApex, { x: px - cRx, y: py }, SOLID, false);
    line(cApex, { x: px + cRx, y: py }, SOLID, false);

  } else if (s.type === 'octahedron') {
    var oHh = A * 0.5, oHalf = A;
    var oU = { x: px, y: py - oHalf };
    var oD = { x: px, y: py + oHalf };
    var oL = { x: px - A, y: py };
    var oT = { x: px, y: py - oHh };
    var oR = { x: px + A, y: py };
    var oB = { x: px, y: py + oHh };
    // 不可见：上/下顶点到赤道后点 oT 的后棱 + 赤道后半两条
    line(oU, oT, DASH, true);
    line(oD, oT, DASH, true);
    line(oL, oT, DASH, true);
    line(oT, oR, DASH, true);
    // 可见
    line(oU, oL, SOLID, false);
    line(oU, oR, SOLID, false);
    line(oU, oB, SOLID, false);
    line(oD, oL, SOLID, false);
    line(oD, oR, SOLID, false);
    line(oD, oB, SOLID, false);
    line(oR, oB, SOLID, false);
    line(oB, oL, SOLID, false);

  } else { // hexPrism 六棱柱
    var hR = A;                          // 六边形外接半径（=顶面半宽）
    var hQ = A * Math.sqrt(3) / 4;       // 前后顶点竖直偏移
    function hexRing(yc) {
      return [
        { x: px + hR,       y: yc },        // 0 右
        { x: px + hR / 2,   y: yc + hQ },   // 1 前右
        { x: px - hR / 2,   y: yc + hQ },   // 2 前左
        { x: px - hR,       y: yc },        // 3 左
        { x: px - hR / 2,   y: yc - hQ },   // 4 后左
        { x: px + hR / 2,   y: yc - hQ }    // 5 后右
      ];
    }
    var hTop = hexRing(py);
    var hBot = hexRing(py + side);
    // 不可见：底面后半 + 背面母线 4/5
    poly([hBot[0], hBot[5], hBot[4], hBot[3]], DASH, true, false);
    line(hTop[4], hBot[4], DASH, true);
    line(hTop[5], hBot[5], DASH, true);
    // 可见
    poly(hTop, SOLID, false, true);
    poly([hBot[3], hBot[2], hBot[1], hBot[0]], SOLID, false, false);
    for (var hi = 0; hi < 4; hi++) line(hTop[hi], hBot[hi], SOLID, false);
  }

  ctx.restore();
};
