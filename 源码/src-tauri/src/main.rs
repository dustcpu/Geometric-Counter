// ============================================================
// 几何任务栏小插件 · 阶段二桌面壳（Rust 侧）
//
// 运行模式（代码一次写好，运行顺序 2a 先行）：
//   geometric-ocean.exe            → 阶段 2a：透明窗口 + 页面内键盘，零系统钩子
//   geometric-ocean.exe --global   → 阶段 2b：+ WS 服务(127.0.0.1:27183)
//                                      + 全局键盘钩子 + 全局快捷键 Ctrl+Shift+Q
//
// 隐私红线：全局钩子收到 keycode 后「立即映射为区号」，原始按键值
// 不落盘、不转发、不出 zone_of() 函数作用域——按键内容从未存在于任何层。
//
// 首次编译提示：rdev 0.5 的 Key 枚举变体名以 docs.rs/rdev/0.5 为准，
// 如个别变体名有出入（数字行/Enter 的命名），编译错误会直接指出，改名即可。
// ============================================================

// 不显示控制台窗口（debug 也一样）——调试控制台会抢焦点，导致主窗口收不到键盘
#![windows_subsystem = "windows"]

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Manager, PhysicalPosition};

/// 监听暂停开关（托盘「暂停 / 恢复」控制；暂停时钩子只吞键不广播）
static PAUSED: AtomicBool = AtomicBool::new(false);
/// 当前海面卡区域（逻辑 x / 宽）——由自适应布局更新，供悬停监视读取
static LAYOUT_ZONE: Mutex<(f64, f64)> = Mutex::new((78.0, 468.0));
/// WebSocket 下行通道（单客户端模型：每个新连接替换旧 sender）
static WS_TX: Mutex<Option<mpsc::Sender<String>>> = Mutex::new(None);
const WS_ADDR: &str = "127.0.0.1:27183";

// ---- Win32：强制置顶与状态探针 ----
// Tauri 的 set_always_on_top 在样式已存在时不会重排 z-order，
// 而任务栏每次被点击都会把自己提到 topmost 组最前 → 必须用 SetWindowPos 抢回来。
#[cfg(windows)]
mod win32 {
    #[link(name = "user32")]
    extern "system" {
        pub fn SetWindowPos(
            hwnd: isize, after: isize,
            x: i32, y: i32, cx: i32, cy: i32, flags: u32,
        ) -> i32;
        pub fn GetWindowLongW(hwnd: isize, index: i32) -> i32;
        pub fn IsWindowVisible(hwnd: isize) -> i32;
        pub fn SetWindowRgn(hwnd: isize, rgn: isize, redraw: i32) -> i32;
    }
    #[link(name = "gdi32")]
    extern "system" {
        pub fn CreateRoundRectRgn(x1: i32, y1: i32, x2: i32, y2: i32, ew: i32, eh: i32) -> isize;
        pub fn CombineRgn(dst: isize, src1: isize, src2: isize, mode: i32) -> i32;
        pub fn DeleteObject(obj: isize) -> i32;
        pub fn GetPixel(dc: isize, x: i32, y: i32) -> u32;
    }
    #[link(name = "user32")]
    extern "system" {
        pub fn GetDC(hwnd: isize) -> isize;
        pub fn ReleaseDC(hwnd: isize, dc: isize) -> i32;
        pub fn GetCursorPos(pt: *mut POINT) -> i32;
        pub fn GetWindowRect(hwnd: isize, rect: *mut RECT) -> i32;
        pub fn SetWinEventHook(
            eventmin: u32, eventmax: u32, hmod: isize,
            proc: *const (), idproc: u32, idthread: u32, flags: u32,
        ) -> isize;
        pub fn GetMessageW(msg: *mut MSG, hwnd: isize, min: u32, max: u32) -> i32;
        pub fn GetForegroundWindow() -> isize;
        pub fn GetClassNameW(hwnd: isize, buf: *mut u16, max: i32) -> i32;
        pub fn FindWindowW(class: *const u16, title: *const u16) -> isize;
        pub fn FindWindowExW(parent: isize, after: isize, class: *const u16, title: *const u16) -> isize;
    }
    #[link(name = "kernel32")]
    extern "system" {
        pub fn CreateMutexW(attrs: isize, owner: i32, name: *const u16) -> isize;
        pub fn GetLastError() -> u32;
    }
    #[repr(C)]
    pub struct POINT {
        pub x: i32,
        pub y: i32,
    }
    #[repr(C)]
    pub struct RECT {
        pub left: i32,
        pub top: i32,
        pub right: i32,
        pub bottom: i32,
    }
    /// 消息结构（不透明，留足空间即可；只为钩子线程跑消息泵）
    #[repr(C)]
    pub struct MSG {
        pub data: [u64; 8],
    }
    pub const EVENT_SYSTEM_FOREGROUND: u32 = 0x0003;
    pub const WINEVENT_OUTOFCONTEXT: u32 = 0x0000;
    pub const ERROR_ALREADY_EXISTS: u32 = 183;
    pub const HWND_TOPMOST: isize = -1;
    pub const SWP_NOSIZE: u32 = 0x0001;
    pub const SWP_NOMOVE: u32 = 0x0002;
    pub const SWP_NOACTIVATE: u32 = 0x0010;
    pub const GWL_EXSTYLE: i32 = -20;
    pub const WS_EX_TOPMOST: i32 = 0x0008;
    pub const RGN_OR: i32 = 2;
}

// ---- 窗口几何默认值（会被 measure_layout 的实测布局覆盖）----
//   config.js 默认：zone.x/width = 78/468（海面区）、rightZone.x/width = 1043/247（粒子区）
// 实际位置由 measure_layout 按任务栏实测（开始按钮 / 托盘位置）决定，
// 换机器/换分辨率都能自愈；中间图标区用窗口区域挖空，既不遮挡也不拦点击。
const LEFT_BAND_W: f64 = 468.0;        // 海面卡默认宽
const RIGHT_BAND_W: f64 = 247.0;       // 粒子卡默认宽

/// 悬停监视（穿透模式的正确姿势）：网页收不到鼠标事件，
/// 由 Rust 每 100ms 查一次光标是否在【海面卡】内（区域随自适应布局变），变化时推给页面。
#[cfg(windows)]
fn spawn_hover_watch(win: &tauri::WebviewWindow) {
    let w = win.clone();
    std::thread::spawn(move || {
        let scale = w.scale_factor().unwrap_or(1.0) as f64;
        let mon_h = w
            .primary_monitor()
            .ok()
            .flatten()
            .map(|m| m.size().height as f64)
            .unwrap_or(2000.0);
        let (ty0, ty1) = ((mon_h - 48.0 * scale).round() as i32, mon_h.round() as i32);
        let mut last: Option<bool> = None;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(100));
            // 每次读当前布局区域（自适应布局可能已变）
            let (zx, zw) = LAYOUT_ZONE
                .lock()
                .map(|g| *g)
                .unwrap_or((78.0, 468.0));
            let lx0 = (zx * scale).round() as i32;
            let lx1 = ((zx + zw) * scale).round() as i32;
            unsafe {
                let mut pt = win32::POINT { x: 0, y: 0 };
                if win32::GetCursorPos(&mut pt) == 0 {
                    continue;
                }
                let inside = pt.x >= lx0 && pt.x < lx1 && pt.y >= ty0 && pt.y < ty1;
                if last != Some(inside) {
                    last = Some(inside);
                    let _ = w.eval(&format!("window.__OCEAN_HOVER = {};", inside));
                }
            }
        }
    });
}

// ---- 前台事件钩子：任务栏抢层时毫秒级抢回（无注入，回调在本进程线程）----
static OCEAN_HWND: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);

#[cfg(windows)]
extern "system" fn on_foreground_event(
    _hook: isize, _event: u32, _hwnd: isize,
    _id_object: i32, _id_child: i32, _id_thread: u32, _time: u32,
) {
    let h = OCEAN_HWND.load(Ordering::Relaxed);
    if h != 0 {
        unsafe {
            win32::SetWindowPos(
                h, win32::HWND_TOPMOST, 0, 0, 0, 0,
                win32::SWP_NOMOVE | win32::SWP_NOSIZE | win32::SWP_NOACTIVATE,
            );
        }
    }
}

#[cfg(windows)]
fn spawn_foreground_guard(win: &tauri::WebviewWindow) {
    let h = win.hwnd().map(|h| h.0 as isize).unwrap_or(0);
    OCEAN_HWND.store(h, Ordering::Relaxed);
    std::thread::spawn(move || unsafe {
        let hook = win32::SetWinEventHook(
            win32::EVENT_SYSTEM_FOREGROUND,
            win32::EVENT_SYSTEM_FOREGROUND,
            0,
            on_foreground_event as *const (),
            0,
            0,
            win32::WINEVENT_OUTOFCONTEXT,
        );
        if hook == 0 {
            return;   // 钩不上就退回 2s 轮询兜底（已存在）
        }
        // out-of-context 钩子需要本线程跑消息泵
        let mut msg = win32::MSG { data: [0; 8] };
        loop {
            if win32::GetMessageW(&mut msg, 0, 0, 0) <= 0 {
                break;
            }
        }
    });
}

/// 自适应布局：按任务栏实际布局算出左右卡片的位置（逻辑像素）。
/// 换台电脑分辨率/缩放/任务栏图标数不同时，卡片仍落在空白区而不是压住图标。
#[derive(Clone, Copy, PartialEq, Debug)]
struct Layout {
    win_x: f64,
    win_w: f64,
    zone_x: f64,      // 海面卡
    zone_w: f64,
    right_x: f64,     // 粒子卡
    right_w: f64,     // 0 = 没有空间，放弃粒子卡
}

#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn measure_layout(win: &tauri::WebviewWindow) -> Layout {
    let scale = win.scale_factor().unwrap_or(1.0);
    let mon_w = win
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| m.size().width as f64 / scale)
        .unwrap_or(1600.0);

    // 任务栏子窗口：Start = 居中图标组左缘；TrayNotifyWnd = 托盘左缘
    let (group_left, tray_left) = unsafe {
        let tb = win32::FindWindowW(wide("Shell_TrayWnd").as_ptr(), std::ptr::null());
        let mut g = mon_w * 0.5 - 240.0;     // 兜底：居中组左缘估算
        let mut t = mon_w - 320.0;           // 兜底：托盘左缘估算
        if tb != 0 {
            let st = win32::FindWindowExW(tb, 0, wide("Start").as_ptr(), std::ptr::null());
            if st != 0 {
                let mut r = win32::RECT { left: 0, top: 0, right: 0, bottom: 0 };
                if win32::GetWindowRect(st, &mut r) != 0 {
                    g = r.left as f64 / scale;
                }
            }
            let tn = win32::FindWindowExW(tb, 0, wide("TrayNotifyWnd").as_ptr(), std::ptr::null());
            if tn != 0 {
                let mut r = win32::RECT { left: 0, top: 0, right: 0, bottom: 0 };
                if win32::GetWindowRect(tn, &mut r) != 0 {
                    t = r.left as f64 / scale;
                }
            }
        }
        (g, t)
    };

    let margin = 24.0;
    // ---- 海面卡：优先保持设计位置 x=78；左侧空间不够就往左挪 / 收窄 ----
    let avail_left = (group_left - margin).max(220.0);
    let mut zone_x = 78.0_f64.min((avail_left - 200.0).max(6.0));
    let mut zone_w = LEFT_BAND_W.min(avail_left - zone_x);
    if zone_w < 200.0 {
        zone_x = (avail_left - LEFT_BAND_W).max(6.0);
        zone_w = (avail_left - zone_x).min(LEFT_BAND_W);
    }
    if zone_w < 160.0 {
        zone_w = 160.0;   // 极端兜底，宁可压一点也不消失
    }

    // ---- 粒子卡：贴托盘左侧放置；空间不足则缩窄，再不足就放弃 ----
    let right_right = (tray_left - 16.0).max(0.0);
    let mut right_w = RIGHT_BAND_W.min(247.0).min(right_right - (zone_x + zone_w + 24.0));
    let mut right_x = right_right - right_w;
    if right_w < 100.0 {
        right_w = 0.0;    // 没空间 → 关闭粒子卡（trail 会自行跳过）
        right_x = 0.0;
    }

    let win_x = zone_x;
    let win_right = if right_w > 0.0 { right_x + right_w } else { zone_x + zone_w };
    Layout {
        win_x,
        win_w: (win_right - win_x).max(200.0),
        zone_x,
        zone_w,
        right_x,
        right_w,
    }
}

/// 把布局落到窗口上：尺寸 / 位置 / 圆角区域 / 通知渲染层
#[cfg(windows)]
fn apply_layout(win: &tauri::WebviewWindow, lay: Layout, rev: u32) {
    if let Ok(mut g) = LAYOUT_ZONE.lock() {
        *g = (lay.zone_x, lay.zone_w);
    }
    let scale = win.scale_factor().unwrap_or(1.0);
    let mon_h = win
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| m.size().height as f64)
        .unwrap_or(2000.0);

    // 1) 尺寸与位置（高度始终 48 逻辑，贴屏幕底部）
    win.set_size(tauri::LogicalSize::new(lay.win_w, 48.0)).ok();
    let x_phys = (lay.win_x * scale).round() as i32;
    let y_phys = (mon_h - 48.0 * scale).round() as i32;
    win.set_position(PhysicalPosition::new(x_phys, y_phys)).ok();

    // 2) 圆角区域（窗口局部物理像素）
    let h = (48.0 * scale).round() as i32;
    let inset_x = (1.0 * scale).round() as i32;
    let inset_t = (2.0 * scale).round() as i32;
    let inset_b = (1.0 * scale).round() as i32;
    let diam = (18.0 * scale).round() as i32;
    let y1 = inset_t;
    let y2 = h - inset_b;
    let lx1 = ((lay.zone_x - lay.win_x) * scale).round() as i32 + inset_x;
    let lx2 = ((lay.zone_x - lay.win_x + lay.zone_w) * scale).round() as i32 - inset_x;
    unsafe {
        let hwnd = win.hwnd().map(|h| h.0 as isize).unwrap_or(0);
        if hwnd != 0 && lx2 > lx1 {
            let left = win32::CreateRoundRectRgn(lx1, y1, lx2, y2, diam, diam);
            let mut combined = left;
            if lay.right_w > 0.0 {
                let rx1 = ((lay.right_x - lay.win_x) * scale).round() as i32 + inset_x;
                let rx2 = ((lay.right_x - lay.win_x + lay.right_w) * scale).round() as i32 - inset_x;
                let right = win32::CreateRoundRectRgn(rx1, y1, rx2, y2, diam, diam);
                if left != 0 && right != 0 {
                    win32::CombineRgn(left, left, right, win32::RGN_OR);
                    win32::DeleteObject(right);
                }
            }
            if combined != 0 {
                win32::SetWindowRgn(hwnd, combined, 1);
            }
        }
    }

    // 3) 通知渲染层（页面按这个重设画布与区域）
    let js = format!(
        "window.__LAYOUT={{rev:{},winX:{},winW:{},zoneX:{},zoneW:{},rightX:{},rightW:{}}};",
        rev, lay.win_x, lay.win_w, lay.zone_x, lay.zone_w, lay.right_x, lay.right_w
    );
    let _ = win.eval(&js);

    // 4) 诊断（仅布局变化时写）
    let dbg = format!(
        "rev={} scale={} win=>x{} w{} zone=>x{} w{} right=>x{} w{}",
        rev, scale, lay.win_x, lay.win_w, lay.zone_x, lay.zone_w, lay.right_x, lay.right_w
    );
    let _ = std::fs::write(diag_path("ocean-layout.txt"), dbg);
}

/// 布局看门狗：每 2s 复测一次（任务栏/分辨率/图标数变化都能自愈），
/// 同时把布局重推给渲染层（兼容页面晚加载）。
#[cfg(windows)]
fn spawn_layout_watch(win: &tauri::WebviewWindow) {
    let w = win.clone();
    std::thread::spawn(move || {
        let mut rev: u32 = 0;
        let mut last: Option<Layout> = None;
        loop {
            let lay = measure_layout(&w);
            if last != Some(lay) {
                rev += 1;
                last = Some(lay);
            }
            apply_layout(&w, lay, rev);
            std::thread::sleep(std::time::Duration::from_millis(2000));
        }
    });
}

/// 成就存档文件（JSON）：%LOCALAPPDATA%\GeometricCounter\stats.json
/// 任何机器上都稳定可查、可备份；页面把存档 JSON 发过来，这里原样落盘
fn stats_file() -> std::path::PathBuf {
    let base = std::env::var("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
    let dir = base.join("GeometricCounter");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("stats.json")
}

/// 旧存档路径（2026-09-18 改名前的目录名带 Wallpaper）——只读不写。
/// 改名后首次启动会从这里把进度读出来，随后照常写进新目录，用户无缝迁移。
fn stats_file_legacy() -> std::path::PathBuf {
    let base = std::env::var("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
    base.join("GeometricOceanWallpaper").join("stats.json")
}

/// 读存档：新路径优先，读不到再试旧路径（兼容改名前的进度）
fn read_stats() -> Option<String> {
    for p in [stats_file(), stats_file_legacy()] {
        if let Ok(text) = std::fs::read_to_string(&p) {
            let t = text.trim().to_string();
            if t.starts_with('{') {
                return Some(t);
            }
        }
    }
    None
}

/// 诊断日志路径：优先写项目内的 `.workbuddy\downloads\`（本机便于远程读取），
/// 找不到项目目录（换了机器，比如朋友电脑）就退回系统临时目录。
/// ★ 刻意不写死任何绝对路径——分享包里不能出现作者本机的路径信息。
fn diag_path(name: &str) -> std::path::PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(|p| p.to_path_buf());
        let mut depth = 0;
        while let Some(d) = dir {
            let cand = d.join(".workbuddy").join("downloads");
            if cand.is_dir() {
                return cand.join(name);
            }
            depth += 1;
            if depth > 6 {
                break;   // 别一路爬到盘根
            }
            dir = d.parent().map(|p| p.to_path_buf());
        }
    }
    std::env::temp_dir().join(name)
}

/// 单实例锁：同名互斥体已存在 → 说明已有实例在跑，直接退出。
/// （避免双击两次启动脚本造成窗口重叠 + 按键双倍计数）
#[cfg(windows)]
fn ensure_single_instance() {
    let name: Vec<u16> = "Local\\GeometricCounter_SingleInstance\0"
        .encode_utf16()
        .collect();
    unsafe {
        let h = win32::CreateMutexW(0, 0, name.as_ptr());
        if h != 0 && win32::GetLastError() == win32::ERROR_ALREADY_EXISTS {
            std::process::exit(0);
        }
    }
}

/// 判断前台窗口是否是「外壳浮出层」——开始菜单 / 任务栏缩略图预览 / 任务视图 等。
/// 这些窗口在 Windows 给外壳保留的更高层级带里，普通程序抢不过；
/// 与其被盖住一半，不如主动让位（隐藏），浮出层关闭后自动回来。
#[cfg(windows)]
fn is_shell_flyout_foreground() -> bool {
    unsafe {
        let hwnd = win32::GetForegroundWindow();
        if hwnd == 0 {
            return false;
        }
        let mut buf = [0u16; 256];
        let n = win32::GetClassNameW(hwnd, buf.as_mut_ptr(), 256);
        if n <= 0 {
            return false;
        }
        let cls = String::from_utf16_lossy(&buf[..n as usize]);
        matches!(
            cls.as_str(),
            // 开始菜单 / 搜索 / 各类 shell 浮出面板
            "Windows.UI.Core.CoreWindow"
            // Win11 任务栏缩略图预览、快速设置、通知中心
            | "XamlExplorerHostIslandWindow"
            // 经典缩略图预览窗口
            | "TaskListThumbnailWnd"
            // 任务视图（Win+Tab / 时间线）
            | "MultitaskingViewFrame"
        )
    }
}

/// 浮出层守卫：150ms 轮询前台窗口类别，进出浮出层时隐藏/恢复海面。
#[cfg(windows)]
fn spawn_flyout_guard(win: &tauri::WebviewWindow) {
    let w = win.clone();
    std::thread::spawn(move || {
        let mut hidden = false;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(150));
            let flyout = is_shell_flyout_foreground();
            if flyout == hidden {
                continue;   // 状态未变
            }
            if flyout {
                w.hide().ok();
                hidden = true;
            } else {
                // 浮出层关闭 → 回来（重贴区域 + 恢复置顶）
                w.show().ok();
                w.set_always_on_top(true).ok();   // 区域由布局看门狗维护，无需重贴
                hidden = false;
            }
        }
    });
}

// ---- 区号映射（与 src/keyboard-source.js 的六区一一对应）----
// 键名以 rdev 0.5.3 实际枚举为准（src/rdev.rs pub enum Key）：
// Alt 无左右之分（右 Alt = AltGr）；Enter 叫 Return；方括号叫 LeftBracket/RightBracket
// 只识别分区；小键盘（Kp*）与其余未列出键返回 None → 丢弃
fn zone_of(key: rdev::Key) -> Option<&'static str> {
    use rdev::Key::*;
    Some(match key {
        // 左手主键区（含左侧修饰键；Alt = 左 Alt）
        BackQuote | Tab | CapsLock
        | KeyQ | KeyW | KeyE | KeyR | KeyT
        | KeyA | KeyS | KeyD | KeyF | KeyG
        | KeyZ | KeyX | KeyC | KeyV | KeyB
        | ShiftLeft | ControlLeft | Alt | MetaLeft => "leftMain",
        // 右手主键区（Return 归右手；AltGr = 右 Alt；修饰键左右各自归属）
        KeyY | KeyU | KeyI | KeyO | KeyP
        | KeyH | KeyJ | KeyK | KeyL | KeyN | KeyM
        | LeftBracket | RightBracket | BackSlash
        | SemiColon | Quote | Comma | Dot | Slash
        | Return
        | ShiftRight | ControlRight | AltGr | MetaRight => "rightMain",
        Space => "space",
        // 数字/符号区（Num1..Num0 = 数字行；含 Minus/Equal/Backspace）
        Num1 | Num2 | Num3 | Num4 | Num5 | Num6 | Num7 | Num8 | Num9 | Num0
        | Minus | Equal | Backspace => "digits",
        // 功能键
        Escape | F1 | F2 | F3 | F4 | F5 | F6 | F7 | F8 | F9 | F10 | F11 | F12 => "functions",
        // 方向/编辑键
        UpArrow | DownArrow | LeftArrow | RightArrow
        | Insert | Delete | Home | End | PageUp | PageDown => "edit",
        _ => return None,
    })
}

fn broadcast_zone(zone: &str) {
    if PAUSED.load(Ordering::Relaxed) {
        return;
    }
    if let Ok(guard) = WS_TX.lock() {
        if let Some(tx) = guard.as_ref() {
            let _ = tx.send(format!("{{\"zone\":\"{}\"}}", zone));
        }
    }
}

// ---- 全局键盘钩子（仅 --global 模式启动；回调极轻：映射+转发，微秒级）----
fn spawn_global_hook() {
    std::thread::spawn(|| {
        let mut pressed: HashSet<rdev::Key> = HashSet::new();
        let result = rdev::listen(move |event: rdev::Event| {
            match event.event_type {
                rdev::EventType::KeyPress(key) => {
                    // 去重：OS 自动重复的 KeyPress 被已按下集合挡住 → 按住算 1 次
                    if pressed.insert(key) {
                        if let Some(zone) = zone_of(key) {
                            broadcast_zone(zone);
                        }
                    }
                }
                rdev::EventType::KeyRelease(key) => {
                    pressed.remove(&key);
                }
                _ => {}
            }
        });
        if let Err(e) = result {
            eprintln!("[geometric-ocean] 全局键盘钩子异常退出: {:?}", e);
        }
    });
}

// ---- WebSocket 服务（仅 --global 模式启动；单客户端、只发不收）----
fn spawn_ws_server() {
    std::thread::spawn(move || {
        let listener = match std::net::TcpListener::bind(WS_ADDR) {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[geometric-ocean] WS 绑定 {} 失败: {}", WS_ADDR, e);
                return;
            }
        };
        for stream in listener.incoming() {
            let Ok(tcp) = stream else { continue };
            let (tx, rx) = mpsc::channel::<String>();
            if let Ok(mut guard) = WS_TX.lock() {
                *guard = Some(tx);
            }
            std::thread::spawn(move || {
                let mut ws = match tungstenite::accept(tcp) {
                    Ok(w) => w,
                    Err(_) => return,
                };
                let _ = ws.get_mut().set_nonblocking(true);

                // 连上先把 JSON 存档推给页面（文件不存在则跳过；页面做单调合并）
                if let Some(t) = read_stats() {
                    if let Ok(guard) = WS_TX.lock() {
                        if let Some(tx) = guard.as_ref() {
                            let _ = tx.send(format!("{{\"init\":{}}}", t));
                        }
                    }
                }

                loop {
                    use std::sync::mpsc::RecvTimeoutError as E;
                    match rx.recv_timeout(std::time::Duration::from_millis(50)) {
                        Ok(text) => {
                            if ws.send(tungstenite::Message::text(text)).is_err() {
                                break;
                            }
                        }
                        Err(E::Timeout) => {}
                        Err(E::Disconnected) => break,
                    }
                    // 客户端帧：JSON（存档）落盘，其余忽略（保活）
                    match ws.read() {
                        Ok(tungstenite::Message::Close(_)) => break,
                        Err(tungstenite::Error::Io(ref e))
                            if e.kind() == std::io::ErrorKind::WouldBlock => {}
                        Err(_) => break,
                        Ok(m) => {
                            if let Ok(s) = m.to_text() {
                                let t = s.trim();
                                if t.starts_with('{') && t.len() < 4096 {
                                    let _ = std::fs::write(stats_file(), t);
                                }
                            }
                        }
                    }
                }
                if let Ok(mut guard) = WS_TX.lock() {
                    *guard = None;
                }
            });
        }
    });
}

// 程序化生成托盘图标（32×32 纯色海蓝），避免引入图标文件依赖
fn default_icon() -> tauri::image::Image<'static> {
    let mut rgba = vec![0u8; 32 * 32 * 4];
    for px in rgba.chunks_mut(4) {
        px.copy_from_slice(&[115, 170, 225, 255]);
    }
    tauri::image::Image::new_owned(rgba, 32, 32)
}

fn main() {
    // 单实例：已有实例在跑则静默退出
    #[cfg(windows)]
    ensure_single_instance();

    let global_mode = std::env::args().any(|a| a == "--global");

    tauri::Builder::default()
        .setup(move |app| {
            let win = app
                .get_webview_window("ocean")
                .expect("ocean 窗口未在 tauri.conf.json 中定义");

            // ---- 自适应布局：实测任务栏布局 → 尺寸/位置/区域/通知页面 ----
            // 同时兼作分辨率与 DPI 变化重定位（看门狗每 2s 复测）
            #[cfg(windows)]
            {
                spawn_layout_watch(&win);
                spawn_hover_watch(&win);
                spawn_flyout_guard(&win);
            }
            win.show().ok();

            // ---- 置顶保卫战（事件级为主 + 慢轮询兜底）----
            // 主手段：SetWinEventHook(EVENT_SYSTEM_FOREGROUND) —— 前台窗口一变（比如点任务栏）
            //         毫秒级收到通知并立刻抢回层级，闪烁压到不可察。
            // 兜底：每 2s 轮询一次（防钩子漏事件），并只在 状态变化时 写探针日志（限流）。
            #[cfg(windows)]
            spawn_foreground_guard(&win);
            {
                use std::io::Write;
                let w = win.clone();
                std::thread::spawn(move || {
                    let h = match w.hwnd() {
                        Ok(h) => h.0 as isize,
                        Err(_) => 0,
                    };
                    let mut last_logged: Option<(bool, bool)> = None;
                    loop {
                        std::thread::sleep(std::time::Duration::from_millis(2000));
                        let topmost = unsafe {
                            win32::GetWindowLongW(h, win32::GWL_EXSTYLE) & win32::WS_EX_TOPMOST != 0
                        };
                        let visible = unsafe { win32::IsWindowVisible(h) } != 0;
                        // 兜底抢层（事件钩子为主，这里防漏）
                        unsafe {
                            win32::SetWindowPos(
                                h, win32::HWND_TOPMOST, 0, 0, 0, 0,
                                win32::SWP_NOMOVE | win32::SWP_NOSIZE | win32::SWP_NOACTIVATE,
                            );
                        }
                        // 仅状态变化时记录（避免日志无限增长）
                        if last_logged != Some((topmost, visible)) {
                            last_logged = Some((topmost, visible));
                            let line = format!("state-change topmost={} visible={}\n", topmost, visible);
                            if let Ok(mut f) = std::fs::OpenOptions::new()
                                .create(true)
                                .append(true)
                                .open(diag_path("ocean-state.log"))
                            {
                                let _ = f.write_all(line.as_bytes());
                            }
                        }
                    }
                });
            }
            // 鼠标穿透：2a 关闭（可点击窗口获取焦点，测窗口内按键）；
            // 2b（--global）开启——海面完全不影响任何点击
            if global_mode {
                win.set_ignore_cursor_events(true).ok();
            }

            // ---- 托盘：三层退出之第 2 层（暂停 / 恢复 / 退出）----
            let toggle = MenuItem::with_id(app, "toggle", "暂停 / 恢复监听", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &quit])?;
            TrayIconBuilder::with_id("main")
                .icon(default_icon())
                .tooltip("几何任务栏小插件")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "toggle" => {
                        let now = !PAUSED.load(Ordering::Relaxed);
                        PAUSED.store(now, Ordering::Relaxed);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // ---- 2b 专属：全局键盘 + WS 服务 + 全局快捷键 Ctrl+Shift+Q ----
            // （2a 保持零系统钩子；三层退出之第 1 层随 2b 启用）
            if global_mode {
                spawn_ws_server();
                spawn_global_hook();
                use tauri_plugin_global_shortcut::ShortcutState;
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_shortcuts(["ctrl+shift+q"])
                        .expect("注册全局快捷键 Ctrl+Shift+Q 失败")
                        .with_handler(|app, _shortcut, event| {
                            // 字段/方法名如与插件版本不符，编译错误会指出（state 字段 vs state()）
                            if event.state == ShortcutState::Pressed {
                                app.exit(0);
                            }
                        })
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running geometric-ocean");
}
