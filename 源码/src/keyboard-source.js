// ============================================================
// 几何任务栏小插件 · keyboard-source.js
// ★ 数据源抽象层（§1 决策 19）：
//   - createWebSource：阶段一，页面内键盘事件
//   - createWebSocketSource：阶段二，接收 Rust 后台推送的 { zone }
//   渲染层只依赖 onKey({ zone })，换数据源零改动。
//
// 六区映射（§4.2，已确认决策 16/17/18）：
//   Enter 归右手主键区；修饰键左右各自归属；小键盘直接丢弃。
//   只识别分区，不记录按键内容。
// ============================================================
var GOW = globalThis.GOW = globalThis.GOW || {};

GOW.keyboard = (function () {
  // 物理键码（KeyboardEvent.code）→ 区
  var ZONE_CODES = {
    leftMain: [
      'Backquote', 'Tab', 'CapsLock',
      'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT',
      'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG',
      'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB',
      'ShiftLeft', 'ControlLeft', 'AltLeft', 'MetaLeft'
    ],
    rightMain: [
      'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP',
      'KeyH', 'KeyJ', 'KeyK', 'KeyL',
      'KeyN', 'KeyM',
      'BracketLeft', 'BracketRight', 'Backslash',
      'Semicolon', 'Quote', 'Comma', 'Period', 'Slash',
      'Enter',
      'ShiftRight', 'ControlRight', 'AltRight', 'MetaRight'
    ],
    space: ['Space'],
    digits: [
      'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
      'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0',
      'Minus', 'Equal', 'Backspace'
    ],
    functions: [
      'Escape',
      'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
      'F7', 'F8', 'F9', 'F10', 'F11', 'F12'
    ],
    edit: [
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'Insert', 'Delete', 'Home', 'End', 'PageUp', 'PageDown'
    ]
  };

  var CODE2ZONE = {};
  var ZONE_SET = {};
  (function build() {
    for (var zone in ZONE_CODES) {
      ZONE_SET[zone] = true;
      var codes = ZONE_CODES[zone];
      for (var i = 0; i < codes.length; i++) CODE2ZONE[codes[i]] = zone;
    }
  })();

  // 小键盘（Numpad*）等未列出的键返回 null → 上层直接丢弃
  function zoneFor(code) {
    return CODE2ZONE[code] || null;
  }

  // ---- 阶段一：页面内键盘 ----
  // e.repeat 过滤 = 「按住算 1 次」的网页版实现（桌面版在 Rust 侧做）
  function createWebSource(onKey) {
    window.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      var zone = zoneFor(e.code);
      if (!zone) return;
      // 防止空格/方向键滚动页面、F 键触发浏览器行为（演示页）
      if (e.code === 'Space' || e.code.indexOf('Arrow') === 0 ||
          e.code === 'Backspace' || e.code === 'Tab' ||
          e.code.indexOf('F') === 0 && /^F\d+$/.test(e.code)) {
        e.preventDefault();
      }
      onKey({ zone: zone, code: e.code });
    });
  }

  // ---- 阶段二：本地 WebSocket（127.0.0.1）----
  // Rust 侧下行：{ zone: "leftMain" }（按键区号）| { init: {...} }（JSON 存档，仅连接时一次）
  // ★ 2026-09-18 修 bug：原先用 CODE2ZONE[msg.zone] 校验，但那张表是
  //   「键码→区号」，用区号查永远 undefined → 所有消息被静默丢弃。
  //   改为用 ZONE_SET（区号集合）校验。
  // onOpen / onMessage 可选：连接建立回调、非按键消息回调（存档等）
  // 返回句柄带 send()：桌面版把存档 JSON 回传给 Rust 落盘
  function createWebSocketSource(url, onKey, onOpen, onMessage) {
    var empty = { close: function () { }, send: function () { } };
    var ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      return empty;
    }
    ws.onopen = function () { if (onOpen) onOpen(); };
    ws.onmessage = function (ev) {
      var msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (e) { return; }          // 忽略坏帧
      if (!msg) return;
      if (typeof msg.zone === 'string' && ZONE_SET[msg.zone]) {
        onKey({ zone: msg.zone });
        return;
      }
      if (onMessage) onMessage(msg);
    };
    return {
      close: function () { try { ws.close(); } catch (e) { } },
      send: function (text) {
        try { if (ws.readyState === 1) ws.send(text); } catch (e) { }
      }
    };
  }

  return { zoneFor: zoneFor, createWebSource: createWebSource, createWebSocketSource: createWebSocketSource };
})();
