// ============================================================
// 几何任务栏小插件 · achievements.js
// 成就系统：8 级等比阶梯 + 徽章陈列 + 计数 + 持久化。
// 持久化（方案 A · 单文件累计）：
//   { total, zones, unlockedLevel, today: { date, count } }
//   网页版落 localStorage；桌面版换成 JSON 文件，结构不变。
//   today = 今日计数（2026-09-17 Dust：大家更感兴趣今日而非累计），跨天自动归零。
// 计数与动画解耦：recordKey 先于喷泉 trySpawn 调用，
// 动画槽满丢弃按键时计数依然准确（验收「误差为 0」的保证）。
// 本模块不触碰 DOM —— 渲染通过 init 注入的回调完成（可在 node 里测试）。
// ============================================================
var GOW = globalThis.GOW = globalThis.GOW || {};

GOW.achievements = (function () {
  var cfg = GOW.config;

  var stats = { total: 0, zones: {}, unlockedLevel: 0, today: { date: '', count: 0 } };
  var storage = null;
  var renderBadges = null;   // function(unlockedCount, animateFrom)
  var setTotal = null;       // function(text)
  var onUnlock = null;       // ★ function(level, from) —— 只在「实时升到新级别」时触发（2026-09-19）
                             //   启动时按 total 补算、merge 合并旧存档都不触发（避免开机就弹窗）
  var dirty = false;
  var saveAcc = 0;           // 节流：脏后每 2s 落盘一次
  var SAVE_INTERVAL = 2;

  function defaultStorage() {
    return {
      load: function () {
        try { return JSON.parse(localStorage.getItem(cfg.storageKey) || 'null'); }
        catch (e) { return null; }
      },
      save: function (s) {
        try { localStorage.setItem(cfg.storageKey, JSON.stringify(s)); } catch (e) { }
      }
    };
  }

  function levelFor(total) {
    var lv = 0;
    for (var i = 0; i < cfg.thresholds.length; i++) {
      if (total >= cfg.thresholds[i]) lv = i + 1;
    }
    return lv;
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function init(opts) {
    opts = opts || {};
    storage = opts.storage || defaultStorage();
    renderBadges = opts.renderBadges || function () { };
    setTotal = opts.setTotal || function () { };
    onUnlock = opts.onUnlock || null;

    var saved = storage.load();
    if (saved) {
      stats.total = saved.total | 0;
      stats.zones = saved.zones || {};
      stats.unlockedLevel = saved.unlockedLevel | 0;
      if (saved.today && saved.today.date === todayStr()) {
        stats.today = { date: saved.today.date, count: saved.today.count | 0 };
      }
    }
    // 跨天归零（无论有没有存档）
    if (stats.today.date !== todayStr()) stats.today = { date: todayStr(), count: 0 };
    // ★ 2026-09-19 修 bug：unlockedLevel 不再「只增」——它**完全由 total 派生**。
    //   存档里的级别数字只在「同一套阶梯」下才有意义；阶梯一改版（Dust 实测：
    //   旧表第 7 级在新表里只值第 2 级），旧数字就失真了，随机池会放出一堆
    //   「还不到阶段」的几何体。所以这里无条件按 total 重算，旧字段只读不认。
    var lv = levelFor(stats.total);
    if (lv !== stats.unlockedLevel) { stats.unlockedLevel = lv; dirty = true; }

    renderBadges(stats.unlockedLevel, 0);
    setTotal(formatTotal(stats.total));
  }

  // 每个去重后的按键调用一次（先于喷泉）
  // 注意：不直接写文本 —— 显示层的滚动动画是唯一写入方（避免两次写入打架导致数字回跳）
  function recordKey(zone) {
    stats.total++;
    stats.zones[zone] = (stats.zones[zone] || 0) + 1;
    if (stats.today.date !== todayStr()) stats.today = { date: todayStr(), count: 1 };
    else stats.today.count++;
    dirty = true;
    checkUnlock();
  }

  function checkUnlock() {
    var lv = levelFor(stats.total);
    if (lv > stats.unlockedLevel) {
      var from = stats.unlockedLevel;
      stats.unlockedLevel = lv;
      save();   // 解锁瞬间立即落盘
      renderBadges(lv, from);
      if (onUnlock) onUnlock(lv, from);   // ★ 实时解锁（弹窗 + 放生几何体的唯一触发点）
    }
  }

  // ---- 随机浮出池：基础池 + 已解锁级别对应的几何体（2026-09-19 新成就语义）----
  function unlockedTypes() {
    var list = (cfg.baseTypes || ['cube']).slice();
    for (var i = 0; i < stats.unlockedLevel && i < cfg.levels.length; i++) {
      // pool: false 的级别只做荣誉（点亮图腾），不放生几何体进池
      // —— 彭罗斯三角按 Dust 2026-09-19 要求只留在成就区
      if (cfg.levels[i].pool === false) continue;
      list.push(cfg.levels[i].type);
    }
    return list;
  }

  // 第 lv 级的信息（1 起算）；越界返回 null
  function levelInfo(lv) {
    if (lv < 1 || lv > cfg.levels.length) return null;
    return cfg.levels[lv - 1];
  }

  function formatTotal(n) {
    return '累计 ' + n.toLocaleString('zh-CN');
  }

  function save() {
    if (!storage) return;
    storage.save({
      total: stats.total,
      zones: stats.zones,
      unlockedLevel: stats.unlockedLevel,
      today: stats.today
    });
    dirty = false;
    saveAcc = 0;
  }

  // 主循环每帧调用：脏数据节流落盘
  function tick(dt) {
    if (!dirty) return;
    saveAcc += dt;
    if (saveAcc >= SAVE_INTERVAL) save();
  }

  // 页面隐藏/关闭前调用（桌面版对应窗口关闭前 flush）
  function flush() { if (dirty) save(); }

  // 文件存档合并（桌面版：Rust 从 JSON 文件读出的历史数据推过来）
  // 单调合并：只接受更大的累计 / 更高等级，绝不把当前进度倒退回去
  function merge(saved) {
    if (!saved || typeof saved !== 'object') return;
    var t = saved.total | 0;
    if (t <= stats.total) return;          // 单调：只接受更大的累计，绝不倒扣进度
    stats.total = t;
    if (saved.zones && typeof saved.zones === 'object') stats.zones = saved.zones;
    var lv = levelFor(stats.total);        // ★ 级别永远由 total 派生（同 init，不读存档里的旧数字）
    if (lv !== stats.unlockedLevel) {
      stats.unlockedLevel = lv;
      renderBadges(lv, 0);
    }
    if (saved.today && saved.today.date === todayStr() &&
        (saved.today.count | 0) > stats.today.count) {
      stats.today = { date: saved.today.date, count: saved.today.count | 0 };
    }
    dirty = true;    // 下一轮 tick 落盘
  }

  // 重置统计（设置面板触发）：清空计数与徽章进度，立即落盘覆盖旧存档
  function reset() {
    stats = { total: 0, zones: {}, unlockedLevel: 0, today: { date: todayStr(), count: 0 } };
    dirty = false;
    save();                       // 立即写盘（桌面版同时把空存档发给 Rust）
    renderBadges(0, 0);
    setTotal(formatTotal(0));
  }

  return {
    init: init,
    merge: merge,
    recordKey: recordKey,
    tick: tick,
    flush: flush,
    reset: reset,
    levelFor: levelFor,
    unlockedTypes: unlockedTypes,
    levelInfo: levelInfo,
    stats: function () { return stats; }
  };
})();
