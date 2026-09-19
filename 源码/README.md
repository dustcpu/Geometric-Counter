# 几何任务栏小插件 · 源码说明

> 本目录是完整可编译的工程（纯前端 + Rust/Tauri 桌面壳）。
> **已做隐私过滤**：作者本机的用户名与路径都换成了占位符，你需要按自己的环境改回来（见第一节）。

---

## 一、怎么编译起来

### 环境要求（Windows 10/11）

| 需要 | 说明 |
|---|---|
| **Rust**（MSVC 工具链） | `rustup` 默认安装即可；或官方独立发行包 |
| **VS Build Tools 2022** | 安装时勾选「**使用 C++ 的桌面开发**」（含 Windows SDK） |
| **WebView2 运行时** | Win11 自带；Win10 一般随 Edge 装了 |
| Node.js（可选） | 只有 `工具\smoke-test.js` 冒烟测试用得到 |

### 三步跑起来

1. **把整个 `源码\` 目录拷到你的工作位置**，例如 `C:\path\to\geometric-ocean`
2. **改掉路径占位符**（本包已把作者路径替换为占位符）：
   - `src-tauri\.cargo\config.toml` → 把 `--remap-path-prefix` 两行改成你自己的路径
     （这两行是干嘛的见第四节，**别直接删**）
   - `工具\package.py` → `ROOT` 改成你的工程目录
   - `工具\installer.nsi` → 一般不用改（路径由 `package.py` 传入，有兜底默认值）
3. **编译**：

```bat
cd src-tauri
cargo build --release
rem 产物：src-tauri\target\release\geometric-ocean.exe
```

### 两种运行模式

| 模式 | 启动方式 | 行为 |
|---|---|---|
| **2a**（默认） | 直接双击 exe | 只有窗口 + 窗口内键盘（**需点击海面获取焦点**）；零系统钩子 |
| **2b** | `geometric-ocean.exe --global` | 全局键盘钩子 + 本地 WebSocket(127.0.0.1:27183) + `Ctrl+Shift+Q` + 鼠标穿透 |

> 想直接用：把 `工具\package.py` 跑一遍就会出免安装包与安装程序（见 `工具\` 说明）。

---

## 二、目录说明

```
源码/
├── index.html            浏览器演示版（阶段一的 1600×48 模拟带，可直接用浏览器打开）
├── shell.html            桌面壳页面（Tauri 窗口加载这个，只有海面卡 + 粒子卡）
├── settings.html         设置面板（双击海面打开的独立窗口，经 Tauri IPC 读写设置）
├── unlock.html           解锁弹窗（成就升级时右下角短暂出现的 320×120 小窗）
├── style.css             三个页面共用的样式
├── src/                  前端九个模块（原生 JS，无框架、无构建步骤）
│   ├── config.js         所有可调参数集中在此（尺寸/槽位/阶梯/运动参数）
│   ├── theme.js          昼夜 × 四季色表与主题过渡
│   ├── shapes.js         七种几何体绘制（六种会从水里浮出 + 彭罗斯三角，后者只用于图腾与弹窗）
│   ├── ocean.js          波浪线 + 水面线（两端带渐隐画笔）
│   ├── fountain.js       喷泉生命周期：浮出 → 悬停 → 衰减；满槽注入与蓄能发光；随机池由成就驱动
│   ├── trail.js          右侧季节粒子（春花瓣/夏蒲公英/秋银杏/冬雪花/夜星尘）
│   ├── badges.js         成就徽章 SVG（现在只剩最后一枚在用：成就区常驻的彭罗斯三角图腾）
│   ├── achievements.js   成就阶梯、计数、存档读写与合并；升级时回调「放生几何体 + 弹窗」
│   └── keyboard-source.js 数据源抽象：页面内键盘 / 本地 WebSocket
├── src-tauri/            Rust 桌面壳
│   ├── src/main.rs       全部 Rust 逻辑：窗口定位、区域裁剪、置顶、悬停、WS、全局钩子、托盘
│   ├── build.rs          编译前把根目录的前端文件同步到 dist/（Tauri 需要纯前端目录）
│   ├── tauri.conf.json   窗口与打包配置
│   ├── .cargo/config.toml 编译参数（路径重写，见第四节）
│   └── icons/icon.ico    图标
└── 工具/                 构建与出包脚本
    ├── package.py        一键出包：散件 + 安装程序 + zip + 隐私扫描 + 核验
    ├── installer.nsi     NSIS 安装脚本（中文界面、免管理员、HKCU 卸载登记）
    └── smoke-test.js     前端冒烟测试（15 项断言，改前端后跑一下）
```

---

## 三、架构要点（改代码前先看这几条）

1. **两个页面共享一套模块**：`index.html`（浏览器演示）/ `shell.html`（桌面壳）。
   改 `src/` 或 `style.css` 两边都会变。
2. **`build.rs` 固定从工程根同步** `index.html` / `shell.html` / `settings.html` / `unlock.html` /
   `style.css` / `src/` 到 `dist/`，Tauri 再把 `dist/` 嵌进 exe → 这几个**必须在工程根**。
3. **窗口不是一整块**：窗口覆盖 78→1290（逻辑像素），但用 Win32 `SetWindowRgn`
   裁成「左海面卡 + 右粒子卡」两块圆角区域，**中间挖空**——既不遮挡任务栏图标，也不拦点击。
4. **置顶靠抢层**：任务栏本身也是置顶窗口，点击时会压住我们 → 用
   `SetWinEventHook(EVENT_SYSTEM_FOREGROUND)` 事件级抢回，另有 2 秒轮询兜底。
5. **悬停要自己探**：2b 鼠标穿透后网页收不到鼠标事件 → Rust 每 100ms 查光标是否在海面卡内，
   改变时 `eval` 给页面。
6. **键盘只有「区号」过界**：全局钩子把按键立刻折算成六个区域之一（左手区/右手区/空格区/
   数字区/功能键区/编辑键区），原始键值不落盘、不转发、不出 Rust 函数作用域。
7. **自适应布局**：按任务栏 `Start`（开始按钮）与 `TrayNotifyWnd`（托盘）的实测位置算卡片位置，
   每 2 秒复测 → 换分辨率/DPI/图标数量都能自愈。
8. **存档双写**：页面写 localStorage，同时经本地 WebSocket 交给 Rust 写
   `%LOCALAPPDATA%\GeometricCounter\stats.json`；启动时读回并**单调合并**（只增不减）。
9. **设置走 IPC**：设置面板 → `save_settings` 命令 → Rust 落盘 `settings.json` →
   `eval` 广播给主窗口即时生效。**设置窗口打开期间暂停主窗口抢层**，否则它会把设置窗口压住。
   （注意：本地 WebSocket 是**单客户端**通道，设置面板不能复用它——会把主窗口挤掉。）
10. **避让规则集中在 Rust**：任务栏图标遮挡（`measure_layout` 算图标组右缘）、
   全屏应用 / 自动隐藏 / shell 浮出层（`spawn_visibility_guard` 统一掩码）都在 `main.rs` 里。
11. **成就 = 逐级「放生」几何体**：成就区永久陈列自转的彭罗斯三角（未集齐时半透明）；
    每升一级把对应几何体加入随机浮出池，并经 `show_unlock` 命令在右下角弹一张小卡片。
    **解锁级别完全由累计数派生**（`levelFor(total)`），存档里的级别字段只读不认 ——
    否则一改阶梯，旧数字就失真，随机池会放出「还不到阶段」的几何体。
    阶梯表在 `config.js` 的 `levels`；其中 `pool: false` 的级别只做荣誉、不放生几何体。
12. **窗口必须预创建**：`WebviewWindowBuilder::build()` 只能在事件循环（主）线程调用，
    子线程调用会让**进程直接退出**；操作已有窗口（hide/show/eval）才是线程安全的。
    设置面板与解锁弹窗都在启动时预创建好并隐藏，之后只做 show/hide。

---

## 四、为什么 `.cargo/config.toml` 里有 `--remap-path-prefix`

Rust 会把**依赖库源码的绝对路径**嵌进 release 二进制（panic 位置信息），
实测未处理时含有 **300+ 处「作者本机用户目录」下的 `.cargo\registry\...` 绝对路径**——
分发出去等于把自己的用户名和目录结构一起送给别人。

`--remap-path-prefix=<你的用户目录>=~` 会把这些路径重写成 `~\...`。
**删掉它之前请想清楚**：不删只是一种选择，但删了就会泄露。

---

## 五、已知限制

- **多显示器**未做：只取主屏（`primary_monitor`），外接屏不跟随
- **真透明不可用**：本机 WebView2 会把透明窗口渲染成白膜铺满窗口，故走「Win11 卡片风」
  （不透明深色 + 1px 描边 + 圆角窗口区域）
- **本源码包仅供学习/自用**，随项目一同开源：https://github.com/dustcpu/Geometric-Counter
- 隐私扫描脚本（`privacy_scan.py`）**不随包分发**——它内部含作者的禁串清单（本身就是隐私信息）
