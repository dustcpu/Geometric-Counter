"""出包脚本 · 几何任务栏小插件

用法：python package.py [--date YYYYMMDD]
产物落在 <工程根>\\发布包\\：
  - 几何任务栏小插件-setup-<date>.exe   （NSIS 安装程序，内含程序 + README.md）
  - 几何任务栏小插件-share-<date>.zip   （免安装包：exe + README.md + 启动/退出 bat + 源码/）

★ 同一份脚本在两种目录布局下都能直接跑（2026-09-28 改造）：
  - 工作版：<工程根>\\.workbuddy\\devtools\\package.py
  - 源码包：<工程根>\\工具\\package.py
  工程根由脚本自身位置推断（也可用环境变量 PROJECT_ROOT 覆盖），因此**源码包里不必再手改路径**。
  nsis 安装器、隐私扫描器都是「有则用、没有就降级跳过」：
  源码包不含 NSIS 与 privacy_scan.py（后者是作者私有工具），照样能出免安装 zip。

命名规范见 维护日志及须知\\须知\\须知_Agent通用规范.md §3：
默认日期命名；同日多次出包加 " v2" / " v3"；只有明确说「要发布版本」才用版本号。
"""

# -*- coding: utf-8 -*-
import datetime
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile

# ---- 自身位置 & 工程根推断（两种布局通用）----
HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS_DIR = HERE


def _infer_root():
    env = os.environ.get("PROJECT_ROOT")
    if env:
        return env
    parent = os.path.dirname(HERE)                 # 源码包布局：<root>\工具\ → 上一级即工程根
    if os.path.isdir(os.path.join(parent, "src-tauri")):
        return parent
    grand = os.path.dirname(parent)                # 工作版布局：<root>\.workbuddy\devtools\
    if os.path.isdir(os.path.join(grand, "src-tauri")):
        return grand
    return parent                                  # 兜底：按源码包布局猜（出错时看上面的提示）


ROOT = _infer_root()
PKG = os.path.join(ROOT, "发布包")
RELEASE_EXE = os.path.join(ROOT, "src-tauri", "target", "release", "geometric-ocean.exe")
NSI = os.path.join(TOOLS_DIR, "installer.nsi")
README_BASE = os.path.join(PKG, "README-基础版.md")
README_SRC_BASE = os.path.join(PKG, "README-源码-基础版.md")


def _first_existing(paths):
    for p in paths:
        if p and os.path.exists(p):
            return p
    return None


def readme_base():
    """分享包根 README（面向使用者）。源码包布局里没有专门的「基础版」→ 退回源码说明"""
    return _first_existing([README_BASE, README_SRC_BASE, os.path.join(ROOT, "README.md")])


def readme_src():
    """源码说明（放进包内 源码/README.md）。源码包布局里直接用工程根已有的 README.md"""
    return _first_existing([README_SRC_BASE, os.path.join(ROOT, "README.md")])

# ---- 源码包（随分享包分发，已去隐私）----
SRC_FILES = [
    "index.html", "shell.html", "settings.html", "unlock.html", "style.css",
    "src/config.js", "src/theme.js", "src/shapes.js", "src/ocean.js",
    "src/fountain.js", "src/trail.js", "src/badges.js",
    "src/achievements.js", "src/keyboard-source.js",
    "src-tauri/Cargo.toml", "src-tauri/Cargo.lock", "src-tauri/build.rs",
    "src-tauri/tauri.conf.json", "src-tauri/.cargo/config.toml",
    "src-tauri/src/main.rs", "src-tauri/icons/icon.ico", "src-tauri/icons/tray.png",
]
# 随包的三个工具脚本：就在本脚本同一目录（两种布局都成立）
SRC_TOOLS = ["package.py", "installer.nsi", "smoke-test.js"]

# 去隐私替换：作者本机的用户名与路径 → 占位符
# （在源码包那份里这些串已经不存在了，替换自然成为空操作，无害）
SANITIZE = [
    (rb"C:\path\to\.workbuddy", rb"C:\path\to\.workbuddy"),
    (rb"C:\\Users\\YourName", rb"C:\\Users\\YourName"),
    (rb"C:\Users\YourName", rb"C:\Users\YourName"),
    (rb"C:\\path\\to\\geometric-ocean", rb"C:\\path\\to\\geometric-ocean"),
    (rb"C:\path\to\geometric-ocean", rb"C:\path\to\geometric-ocean"),
    (rb"python", rb"python"),
    (rb"python", rb"python"),
    (rb"YourName", rb"YourName"),
]

LAUNCH_BAT = """@echo off
rem Geometric Counter - portable launcher
rem EXIT: Ctrl+Shift+Q  or  tray icon right-click -> Quit
start "" "%~dp0geometric-ocean.exe" --global
"""

QUIT_BAT = """@echo off
rem Emergency exit: force-kill the wallpaper process.
taskkill /IM geometric-ocean.exe /F
"""


def find_nsis():
    """找 makensis：环境变量 → 本工程自带 → 常见安装位置 → PATH。找不到返回 None（降级跳过安装包）"""
    cands = []
    env = os.environ.get("MAKENSIS")
    if env:
        cands.append(env)
    cands += [
        os.path.join(ROOT, ".workbuddy", "nsis", "nsis-3.11", "makensis.exe"),
    ]
    # NSIS 的常见安装位置：用环境变量拼，别写字面量（免得被隐私扫描当成「本机绝对路径」误报）
    for env in ("ProgramFiles(x86)", "ProgramFiles"):
        base = os.environ.get(env)
        if base:
            cands.append(os.path.join(base, "NSIS", "makensis.exe"))
    for c in cands:
        if c and os.path.isfile(c):
            return c
    return shutil.which("makensis")


def find_privacy_scan():
    """找隐私扫描器（作者私有工具，刻意不随源码包分发）。找不到返回 None（跳过闸门并提示）"""
    cands = []
    env = os.environ.get("PRIVACY_SCAN")
    if env:
        cands.append(env)
    cands += [
        os.path.join(ROOT, ".workbuddy", "devtools", "privacy_scan.py"),
        os.path.join(TOOLS_DIR, "privacy_scan.py"),
    ]
    for c in cands:
        if c and os.path.isfile(c):
            return c
    return None


# exe 内个别字符串来自 Tauri 编译期嵌入的工程路径（env!("CARGO_MANIFEST_DIR") 之类的
# 字面量不受 --remap-path-prefix 影响）。发布前做**等长**字节替换：
# 长度不变 → PE 结构不动，安全。
# 目标串按长度现算，因此换机器/换目录也成立（源码包里就是这样）。
def _mask(n):
    """造一个与源串等长的无害占位串（形如 C:xxxx）"""
    return (b"C:" + b"x" * (n - 2)) if n >= 2 else b"x" * n


def exe_patches():
    pairs = []
    for src in (os.path.join(ROOT, "src-tauri"), ROOT):
        b = src.encode("utf-8", "ignore")
        if b:
            pairs.append((b, _mask(len(b))))
    # 长串优先，避免短串先把长串的前缀吃掉
    pairs.sort(key=lambda p: -len(p[0]))
    return pairs


def patch_exe(path):
    raw = open(path, "rb").read()
    n = 0
    for a, b in exe_patches():
        assert len(a) == len(b), "等长替换被破坏：%r → %r" % (a, b)
        c = raw.count(a)
        if c:
            raw = raw.replace(a, b)
            n += c
    open(path, "wb").write(raw)
    return n


def build_source_tree(dest, readme_src_path):
    """把工程源码（去隐私后）拷进 dest（分享包内的 源码/ 目录）"""
    for rel in SRC_FILES:
        src = os.path.join(ROOT, rel.replace("/", os.sep))
        if not os.path.exists(src):
            print("  ⚠ 缺文件（跳过）：%s" % rel)
            continue
        out = os.path.join(dest, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(out), exist_ok=True)
        raw = open(src, "rb").read()
        # 文本类做去隐私替换；二进制（ico/png）原样拷
        if src.lower().endswith((".ico", ".png")):
            open(out, "wb").write(raw)
        else:
            for a, b in SANITIZE:
                raw = raw.replace(a, b)
            open(out, "wb").write(raw)
    tools = os.path.join(dest, "工具")
    os.makedirs(tools, exist_ok=True)
    for rel in SRC_TOOLS:
        src = os.path.join(TOOLS_DIR, rel.replace("/", os.sep))
        if not os.path.exists(src):
            print("  ⚠ 缺工具（跳过）：%s" % rel)
            continue
        raw = open(src, "rb").read()
        for a, b in SANITIZE:
            raw = raw.replace(a, b)
        open(os.path.join(tools, os.path.basename(rel)), "wb").write(raw)
    shutil.copy2(readme_src_path, os.path.join(dest, "README.md"))


def main():
    date = datetime.date.today().strftime("%Y%m%d")
    argv = sys.argv[1:]
    if "--date" in argv:
        date = argv[argv.index("--date") + 1]

    print("工程根：%s" % ROOT)
    print("工具目录：%s" % TOOLS_DIR)
    nsis = find_nsis()
    scanner = find_privacy_scan()
    rb = readme_base()
    rs = readme_src()
    print("NSIS：%s" % (nsis or "未找到（将只出免安装 zip）"))
    print("隐私扫描器：%s" % (scanner or "未找到（跳过闸门）"))

    print("== 1/6 检查产物 ==")
    if not rb or not rs:
        print("  缺少 README：既没有 发布包/README-*.md，工程根也没有 README.md")
        return 1
    if rb != README_BASE:
        print("  ⚠ 包根 README 用 %s 兜底" % os.path.basename(rb))
    for p in [RELEASE_EXE, NSI, rb, rs]:
        if not os.path.exists(p):
            print("  缺少文件：" + p)
            return 1
    print("  OK（release exe %.2f MB）" % (os.path.getsize(RELEASE_EXE) / 1048576))

    stage = os.path.join(PKG, "几何任务栏小插件-share-" + date)
    if os.path.isdir(stage):
        shutil.rmtree(stage)
    os.makedirs(stage)

    print("== 2/6 准备免安装散件 ==")
    shutil.copy2(RELEASE_EXE, os.path.join(stage, "geometric-ocean.exe"))
    n_patch = patch_exe(os.path.join(stage, "geometric-ocean.exe"))
    print("  exe 内嵌路径等长替换：%d 处" % n_patch)
    shutil.copy2(rb, os.path.join(stage, "README.md"))
    with open(os.path.join(stage, "启动-几何任务栏小插件.bat"), "w", encoding="ascii") as f:
        f.write(LAUNCH_BAT)
    with open(os.path.join(stage, "退出-几何任务栏小插件.bat"), "w", encoding="ascii") as f:
        f.write(QUIT_BAT)
    print("  " + stage)

    print("== 3/6 准备去隐私源码（放进包内 源码/ 子目录） ==")
    src_dest = os.path.join(stage, "源码")
    build_source_tree(src_dest, rs)
    n_files = sum(len(fs) for _r, _d, fs in os.walk(src_dest))
    print("  源码 %d 个文件 → %s" % (n_files, src_dest))

    setup_out = os.path.join(PKG, "几何任务栏小插件-setup-%s.exe" % date)
    zip_out = os.path.join(PKG, "几何任务栏小插件-share-%s.zip" % date)

    print("== 4/6 隐私扫描（散件，出包前闸门） ==")
    if scanner:
        rc = subprocess.call([sys.executable, scanner, stage])
        if rc != 0:
            print("  ✗ 散件里有敏感串，已中止出包（见上方明细）")
            return 1
        print("  ✓ 散件干净")
    else:
        print("  ⚠ 未找到隐私扫描器（作者私有工具，不随源码包分发）→ 跳过这道闸门")

    print("== 5/6 编译安装程序 ==")
    if not nsis:
        print("  ⚠ 跳过：没装 NSIS。装法：winget install NSIS.NSIS，"
              "或用环境变量 MAKENSIS 指向 makensis.exe")
        setup_out = None
    else:
        if os.path.exists(setup_out):
            os.remove(setup_out)
        cmd = [
            nsis, "-V2",
            "-DOUT_FILE=" + setup_out,
            "-DREADME_FILE=" + rb,
            "-DEXE_FILE=" + os.path.join(stage, "geometric-ocean.exe"),   # 用打过补丁的那份
            NSI,
        ]
        rc = subprocess.call(cmd)
        if rc != 0 or not os.path.exists(setup_out):
            print("  makensis 失败（exit %s）" % rc)
            return 1
        print("  " + setup_out)

    print("== 6/6 压免安装 zip ==")
    if os.path.exists(zip_out):
        os.remove(zip_out)
    with zipfile.ZipFile(zip_out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for root_dir, _dirs, names in os.walk(stage):
            for n in sorted(names):
                p = os.path.join(root_dir, n)
                z.write(p, os.path.relpath(p, stage))
    print("  " + zip_out)

    ok = True
    with zipfile.ZipFile(zip_out) as z:
        names = z.namelist()
        bad = z.testzip()
    need = {"geometric-ocean.exe", "README.md", "启动-几何任务栏小插件.bat", "退出-几何任务栏小插件.bat",
            "源码/README.md", "源码/src/config.js", "源码/src-tauri/src/main.rs"}
    missing = need - set(names)
    print("  zip 文件数：%d" % len(names))
    print("  zip 完整性：%s" % ("OK" if bad is None else ("损坏 " + bad)))
    print("  缺项：%s" % (", ".join(sorted(missing)) if missing else "无"))
    ok = ok and bad is None and not missing

    # 安装程序是 LZMA 压缩载荷，直接扫字符串扫不到 → 静默解到临时目录再扫
    if setup_out and os.path.exists(setup_out) and scanner:
        verify_dir = os.path.join(tempfile.gettempdir(), "_gc_verify_install")
        if os.path.isdir(verify_dir):
            shutil.rmtree(verify_dir, ignore_errors=True)
        rc = subprocess.call([setup_out, "/S", "/D=" + verify_dir])
        if rc != 0 or not os.path.isdir(verify_dir):
            print("  ⚠ 安装程序静默解包失败（exit %s）——载荷隐私未验证" % rc)
            ok = False
        else:
            rc = subprocess.call([sys.executable, scanner, verify_dir])
            print("  安装程序载荷：%s" % ("干净 ✓" if rc == 0 else "有敏感串 ✗"))
            ok = ok and rc == 0
            uninstaller = os.path.join(verify_dir, "卸载.exe")
            if os.path.exists(uninstaller):
                subprocess.call([uninstaller, "/S"])
            shutil.rmtree(verify_dir, ignore_errors=True)

    parts = ["zip %.2f MB" % (os.path.getsize(zip_out) / 1048576)]
    if setup_out and os.path.exists(setup_out):
        parts.insert(0, "setup %.2f MB" % (os.path.getsize(setup_out) / 1048576))
    print("  " + " ｜ ".join(parts))
    print("结论：" + ("全部通过 ✓" if ok else "有未通过项 ✗"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
