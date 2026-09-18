// ============================================================
// 几何任务栏小插件 · badges.js
// 8 个成就徽章 SVG：前 7 个静态等距线稿（stroke=currentColor，
// 跟随主题 solid 色），第 8 个彭罗斯三角完整复刻几何岛屿头像区
// （自转 + 三面光影随主题切换，关键帧在 style.css）。
// ============================================================
var GOW = globalThis.GOW = globalThis.GOW || {};

GOW.BADGES = [
  {
    id: 'cube', name: '正方体', svg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round">' +
      '<path d="M12 4 L20 8 L12 12 L4 8 Z"/>' +
      '<path d="M4 8 V15 L12 19 L20 15 V8"/>' +
      '<path d="M12 12 V19"/>' +
      '<path d="M12 4 V11 M4 15 L12 11 L20 15" stroke-dasharray="2 2.2" stroke-linecap="butt" opacity="0.5"/>' +
      '</svg>'
  },
  {
    id: 'triPrism', name: '三棱柱', svg:
      // 竖放三棱柱：顶三角 + 前两条竖棱 + 底前棱（实线）；背面竖棱 + 底后两条（虚线）
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round">' +
      '<path d="M12 4 L4 9 L20 9 Z"/>' +
      '<path d="M4 9 V18 M20 9 V18 M4 18 L20 18"/>' +
      '<path d="M12 4 V13 M4 18 L12 13 L20 18" stroke-dasharray="2 2.2" stroke-linecap="butt" opacity="0.5"/>' +
      '</svg>'
  },
  {
    id: 'octahedron', name: '正八面体', svg:
      // 2026-09-17 替换三棱锥（与正四面体重复）：风筝形剪影 + 前竖棱/赤道前棱实线，
      // 赤道后棱虚线（隐藏顶点被前竖棱遮挡，不再叠加虚线）
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round">' +
      '<path d="M12 3 L4 12 L12 21 L20 12 Z"/>' +
      '<path d="M12 3 V21"/>' +
      '<path d="M4 12 L12 15 L20 12"/>' +
      '<path d="M4 12 L12 9 L20 12" stroke-dasharray="2 2.2" stroke-linecap="butt" opacity="0.5"/>' +
      '</svg>'
  },
  {
    id: 'cylinder', name: '圆柱', svg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round">' +
      '<ellipse cx="12" cy="7" rx="7" ry="2.8"/>' +
      '<path d="M5 7 V16 A7 2.8 0 0 0 19 16 V7"/>' +
      '<path d="M5 16 A7 2.8 0 0 1 19 16" stroke-dasharray="2 2.2" stroke-linecap="butt" opacity="0.5"/>' +
      '</svg>'
  },
  {
    id: 'cone', name: '圆锥', svg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round">' +
      '<path d="M12 4 L5 17 M12 4 L19 17"/>' +
      '<path d="M5 17 A7 2.8 0 0 0 19 17"/>' +
      '<path d="M5 17 A7 2.8 0 0 1 19 17" stroke-dasharray="2 2.2" stroke-linecap="butt" opacity="0.5"/>' +
      '</svg>'
  },
  {
    id: 'tetra', name: '正四面体', svg:
      // 三段 Y 形棱全部虚线（同一顶点的棱遮挡状态必须一致，2026-09-17 修正）
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round">' +
      '<path d="M12 4 L5 18 L19 18 Z"/>' +
      '<path d="M12 4 L12 13 M12 13 L5 18 M12 13 L19 18" stroke-dasharray="2 2.2" stroke-linecap="butt" opacity="0.5"/>' +
      '</svg>'
  },
  {
    id: 'sphere', name: '球体', svg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round">' +
      '<circle cx="12" cy="11" r="8"/>' +
      '<path d="M4 11 A8 3 0 0 0 20 11"/>' +
      '<path d="M4 11 A8 3 0 0 1 20 11" stroke-dasharray="2 2.2" stroke-linecap="butt" opacity="0.5"/>' +
      '</svg>'
  },
  {
    id: 'penrose', name: '彭罗斯三角', penrose: true, svg:
      // 复刻几何岛屿头像区的彭罗斯三角，但坐标系重排（修复转角缺角 bug）：
      // 原版 viewBox="-6 -2 100 100" 带偏移，transform-origin:50% 在部分引擎
      // 按 (0,0) 起算 → 旋转中心偏离重心 → 角尖扫出边界被裁（右下角缺角）。
      // 现将全部顶点平移 +8,+4，使重心恰为 (52,52)、viewBox="0 0 104 104"
      // （min-x/min-y=0）→ 任何解释下 50% 都落在重心；半边长 52 > 外接半径
      // 48.83 + 描边 1.25 = 50.08，任意旋转角都不触边。
      '<svg viewBox="0 0 104 104" fill="none">' +
      '<g class="penrose-spin" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round">' +
      '<polygon class="pf pf1" points="8,72 77,72 72,64 22,64 56,4 46,4" fill="#ffffff"/>' +
      '<polygon class="pf pf2" points="8,72 12,80 92,80 56,21 51.5,27.5 77,72" fill="var(--blue-200)"/>' +
      '<polygon class="pf pf3" points="92,80 96,72 56,4 22,64 31,64 56,21" fill="var(--blue-500)"/>' +
      '<polygon class="hl hl1" stroke="none" points="8,72 77,72 72,64 22,64 56,4 46,4" fill="#ffffff"/>' +
      '<polygon class="hl hl2" stroke="none" points="8,72 12,80 92,80 56,21 51.5,27.5 77,72" fill="#ffffff"/>' +
      '<polygon class="hl hl3" stroke="none" points="92,80 96,72 56,4 22,64 31,64 56,21" fill="#ffffff"/>' +
      '</g>' +
      '</svg>'
  }
];
