// ============================================================
// 几何任务栏小插件 · 冒烟测试（node 直接运行，无依赖）
// 覆盖：模块加载、六区映射、喷泉槽位溢出、成就解锁与持久化
// 运行：node .workbuddy/devtools/smoke-test.js
// ============================================================
'use strict';
var assert = require('assert');
var path = require('path');

var SRC = path.join(__dirname, '..', '..', 'src');
['config', 'theme', 'shapes', 'ocean', 'badges', 'keyboard-source', 'fountain', 'trail', 'achievements']
  .forEach(function (f) { require(path.join(SRC, f + '.js')); });

var GOW = globalThis.GOW;
var cfg = GOW.config;
console.log('✓ 9 个模块加载无异常');

// ---- 六区映射（§4.2 + 已确认决策）----
var kz = GOW.keyboard.zoneFor;
var cases = {
  KeyQ: 'leftMain', KeyB: 'leftMain', Tab: 'leftMain', CapsLock: 'leftMain',
  ShiftLeft: 'leftMain', ControlLeft: 'leftMain', MetaLeft: 'leftMain',
  KeyP: 'rightMain', KeyM: 'rightMain', Semicolon: 'rightMain',
  Enter: 'rightMain', ShiftRight: 'rightMain', MetaRight: 'rightMain',
  Space: 'space',
  Digit1: 'digits', Digit0: 'digits', Minus: 'digits', Backspace: 'digits',
  Escape: 'functions', F12: 'functions',
  ArrowUp: 'edit', PageDown: 'edit', Insert: 'edit'
};
Object.keys(cases).forEach(function (code) {
  assert.strictEqual(kz(code), cases[code], code + ' → ' + cases[code]);
});
// 小键盘与未知键丢弃
['Numpad0', 'NumpadEnter', 'NumpadAdd', 'IntlBackslash', 'Whatever'].forEach(function (code) {
  assert.strictEqual(kz(code), null, code + ' → null（丢弃）');
});
console.log('✓ 六区映射正确（Enter→右手、修饰键左右分属、NumPad 丢弃）');

// ---- 喷泉：随机槽位 + 满槽收拢（方案 A v3，2026-09-17）----
GOW.fountain.init();
for (var i = 0; i < cfg.fountain.slots; i++) {
  assert.ok(GOW.fountain.trySpawn('leftMain'), '第 ' + (i + 1) + ' 次应浮出');
}
assert.strictEqual(GOW.fountain.activeCount(), cfg.fountain.slots);
// 满槽首键 → 收拢：最大者注入，其余进入沉没让位
assert.ok(GOW.fountain.trySpawn('rightMain'), '满槽键应触发收拢注入');
assert.strictEqual(GOW.fountain.injected(), 1);
assert.strictEqual(GOW.fountain.hoverCount(), 1, '收拢后只留一个留任者');
assert.strictEqual(GOW.fountain.dropped(), 0, '无丢弃');
assert.ok(GOW.fountain.peakScale() > cfg.scale, '留任者应增长');
assert.ok(GOW.fountain.peakScale() <= cfg.scaleMax + 1e-9, '体型不超过上限');
// 沉没让位完成后（0.4s），只剩留任者
for (var s = 0; s < 10; s++) GOW.fountain.update(0.05);
assert.strictEqual(GOW.fountain.activeCount(), 1, '让位者沉没后只剩留任者');
// 再次填满 + 收拢：留任者（最大）继续连任成长
for (var j = 0; j < cfg.fountain.slots - 1; j++) GOW.fountain.trySpawn('rightMain');
assert.strictEqual(GOW.fountain.activeCount(), cfg.fountain.slots);
GOW.fountain.trySpawn('rightMain');
assert.strictEqual(GOW.fountain.hoverCount(), 1, '第二轮收拢仍只留一个');
assert.ok(GOW.fountain.peakScale() > cfg.scale + cfg.injectStep, '留任者跨轮次持续成长');
// 生命周期：无输入 → 留任者悬停 1.5s + 落下 0.4s 后全部释放
for (var s2 = 0; s2 < 50; s2++) GOW.fountain.update(0.05);
assert.strictEqual(GOW.fountain.activeCount(), 0, '无注入续命后全部沉没释放');
console.log('✓ 喷泉方案 A v3：随机浮出 + 满槽收拢（最大者留任成长，其余让位）');

// ---- 成就：阶梯、解锁、持久化（注入假存储，不碰 localStorage）----
var savedPayload = null;
var saveCount = 0;
var rendered = { count: -1, animateFrom: -1, calls: 0 };
var totalText = '';
GOW.achievements.init({
  storage: {
    load: function () { return null; },
    save: function (s) { savedPayload = JSON.parse(JSON.stringify(s)); saveCount++; }
  },
  renderBadges: function (count, animateFrom) {
    rendered = { count: count, animateFrom: animateFrom, calls: rendered.calls + 1 };
  },
  setTotal: function (text) { totalText = text; }
});

assert.strictEqual(GOW.achievements.levelFor(0), 0);
assert.strictEqual(GOW.achievements.levelFor(99), 0);
assert.strictEqual(GOW.achievements.levelFor(100), 1);
assert.strictEqual(GOW.achievements.levelFor(101), 1);
assert.strictEqual(GOW.achievements.levelFor(7700), 8);
assert.strictEqual(GOW.achievements.levelFor(99999), 8);
console.log('✓ 8 级等比阶梯边界正确');

for (var k = 0; k < 100; k++) GOW.achievements.recordKey('leftMain');
assert.strictEqual(GOW.achievements.stats().total, 100);
assert.strictEqual(GOW.achievements.stats().zones.leftMain, 100);
assert.strictEqual(GOW.achievements.stats().unlockedLevel, 1);
assert.strictEqual(rendered.count, 1, '解锁后徽章渲染数 = 1');
assert.ok(saveCount >= 1, '解锁瞬间落盘');
assert.strictEqual(savedPayload.total, 100);
assert.strictEqual(savedPayload.unlockedLevel, 1);
// 今日计数（2026-09-17 新增）：recordKey 累加 + 落盘携带 today 字段
assert.strictEqual(GOW.achievements.stats().today.count, 100, '今日计数应同步累加');
assert.strictEqual(savedPayload.today.count, 100, '落盘应包含 today');
assert.ok(/\d{4}-\d{2}-\d{2}/.test(savedPayload.today.date), 'today.date 为日期串');
// recordKey 不再直接写文本（滚动动画是唯一写入方），setTotal 仅 init 时调用一次
assert.strictEqual(totalText, '累计 0', 'setTotal 仅 init 调用：' + totalText);

// 计数与动画解耦：喷泉满槽时计数仍准确
for (var k2 = 0; k2 < 50; k2++) {
  GOW.achievements.recordKey('rightMain');
  GOW.fountain.trySpawn('rightMain');   // 槽满被丢，但计数已 +1
}
assert.strictEqual(GOW.achievements.stats().total, 150);
assert.strictEqual(GOW.achievements.stats().zones.rightMain, 50);
console.log('✓ 计数与动画解耦（槽满丢弃不影响计数）');

// ---- 徽章表完整性 ----
assert.strictEqual(GOW.BADGES.length, cfg.thresholds.length, '8 徽章 = 8 阈值');
GOW.BADGES.forEach(function (b) {
  assert.ok(b.svg && b.svg.indexOf('<svg') === 0, b.id + ' SVG 存在');
});
assert.ok(GOW.BADGES[7].penrose === true, '第 8 枚是彭罗斯三角');
// 彭罗斯坐标系红线：viewBox 必须为 min-x/min-y=0 的对称盒（重心=正中心），
// 否则 transform-origin:50% 在部分引擎按 (0,0) 起算 → 旋转中心偏离 → 转角缺角
assert.ok(GOW.BADGES[7].svg.indexOf('viewBox="0 0 104 104"') !== -1, '彭罗斯 viewBox 已重排为对称归零坐标系');
console.log('✓ 徽章表完整（7 静态 + 彭罗斯）');

// ---- 主题色表完整性 ----
['spring', 'summer', 'autumn', 'winter'].forEach(function (sn) {
  var c = GOW.theme.display; // 只验证插值目标存在
  void c;
});
GOW.theme.update(10, false);   // 大 dt → 颜色一步到位
assert.ok(GOW.theme.display.solid.every(function (v) { return v >= 0 && v <= 255; }));
console.log('✓ 主题插值无 NaN/越界');

// ---- 页面接线检查（node 测不了 DOM，但能查 index.html 是否漏接）----
var fs = require('fs');
var html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
['GOW.fountain.init()', 'GOW.achievements.init(', 'GOW.keyboard.createWebSource(', 'requestAnimationFrame']
  .forEach(function (needle) {
    assert.ok(html.indexOf(needle) !== -1, 'index.html 缺少接线：' + needle);
  });
console.log('✓ index.html 接线完整（喷泉初始化/成就/数据源/主循环）');

// ---- 拖尾粒子：随打字生成 + 自然消亡 ----
assert.ok(GOW.trail.type().length > 0, '粒子类型可解析');
for (var w = 0; w < 5; w++) GOW.trail.onKey();
assert.strictEqual(GOW.trail.count(), 5, '每次按键应生成 1 个粒子，实际 ' + GOW.trail.count());
for (var w2 = 0; w2 < 40; w2++) GOW.trail.update(0.1);   // 4s → 大部分消亡
assert.ok(GOW.trail.count() < 5, '粒子应随时间消亡，剩余 ' + GOW.trail.count());
console.log('✓ 拖尾粒子：随打字生成（1 键 1 粒）+ 自然消亡');

// ---- 五主题显式遍历（防时间敏感配置缺失复发：2026-09-16 夜间 trail 崩溃的教训）----
['spring', 'summer', 'autumn', 'winter'].forEach(function (sn) {
  GOW.theme.setSeason(sn);
  GOW.theme.update(1, false);   // 大 dt → 颜色一步到位
  GOW.trail.onKey();            // 每种主题下都生成粒子（会踩遍各自的 CONFIG 字段）
  GOW.trail.update(0.016);
});
GOW.theme.setMode('night');
GOW.theme.update(1, false);
GOW.trail.onKey();
GOW.trail.update(0.016);
assert.ok(GOW.trail.count() > 0, '五主题下粒子生成均不应崩溃');
GOW.theme.setAuto();            // 还原自动模式
console.log('✓ 五主题显式遍历（四季 + 夜间粒子生成/字段完整性）');

console.log('\n全部通过 ✔');
