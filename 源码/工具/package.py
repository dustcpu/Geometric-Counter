"""出包脚本 · 几何任务栏小插件

用法：python C:\\path\\to\\geometric-ocean\\.workbuddy\\devtools\\package.py [--date YYYYMMDD]
产物落在 C:\\path\\to\\geometric-ocean\\发布包\\：
  - 几何任务栏小插件-setup-<date>.exe   （NSIS 安装程序，内含程序 + README.md）
  - 几何任务栏小插件-share-<date>.zip   （免安装包：exe + README.md + 启动/退出 bat）

命名规范见 维护日志及须知\\须知\\须知_Agent通用规范.md §3：
默认日期命名；同日多次出包加 " v2" / " v3"；只有明确说「要发布版本」才用版本号。
"""

# -*- coding: utf-8 -*-
import datetime
import os
import shutil
import subprocess
import sys
import zipfile

ROOT = r"C:\path\to\geometric-ocean"
PKG = os.path.join(ROOT, "发布包")
RELEASE_EXE = os.path.join(ROOT, "src-tauri", "target", "release", "geometric-ocean.exe")
NSIS = os.path.join(ROOT, ".workbuddy", "nsis", "nsis-3.11", "makensis.exe")
NSI = os.path.join(ROOT, ".workbuddy", "devtools", "installer.nsi")
README_BASE = os.path.join(PKG, "README-基础版.md")
README_SRC_BASE = os.path.join(PKG, "README-源码-基础版.md")

# ---- 源码包（随分享包分发，已去隐私）----
SRC_FILES = [
    "index.html", "shell.html", "settings.html", "style.css",
    "src/config.js", "src/theme.js", "src/shapes.js", "src/ocean.js",
    "src/fountain.js", "src/trail.js", "src/badges.js",
    "src/achievements.js", "src/keyboard-source.js",
    "src-tauri/Cargo.toml", "src-tauri/Cargo.lock", "src-tauri/build.rs",
    "src-tauri/tauri.conf.json", "src-tauri/.cargo/config.toml",
    "src-tauri/src/main.rs", "src-tauri/icons/icon.ico",
]
SRC_TOOLS = [
    ".workbuddy/devtools/package.py",
    ".workbuddy/devtools/installer.nsi",
    ".workbuddy/devtools/smoke-test.js",
]
# 去隐私替换：作者本机的用户名与路径 → 占位符
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
rem EXIT: Ctrl+Shift+Q  or  tray icon (blue square) right-click -> Quit
start "" "%~dp0geometric-ocean.exe" --global
"""

QUIT_BAT = """@echo off
rem Emergency exit: force-kill the wallpaper process.
taskkill /IM geometric-ocean.exe /F
"""


# exe 内个别字符串来自 Tauri 编译期嵌入的工程路径（env!("CARGO_MANIFEST_DIR") 之类的
# 字面量不受 --remap-path-prefix 影响）。发布前做**等长**字节替换：
# 长度不变 → PE 结构不动，安全。
EXE_PATCHES = [
    (b"C:\\path\\to\\geometric-ocean\\src-tauri", b"C:\\projects\\src-tauri"),   # 21 字节 = 21 字节
    (b"C:\\path\\to\\geometric-ocean", b"C:\\projects"),                          # 11 字节 = 11 字节
]


def patch_exe(path):
    raw = open(path, "rb").read()
    n = 0
    for a, b in EXE_PATCHES:
        assert len(a) == len(b), "等长替换被破坏：%r → %r" % (a, b)
        c = raw.count(a)
        if c:
            raw = raw.replace(a, b)
            n += c
    open(path, "wb").write(raw)
    return n


def build_source_tree(dest):
    """把工程源码（去隐私后）拷进 dest（分享包内的 源码/ 目录）"""
    for rel in SRC_FILES:
        src = os.path.join(ROOT, rel.replace("/", os.sep))
        if not os.path.exists(src):
            print("  ⚠ 缺文件（跳过）：%s" % rel)
            continue
        out = os.path.join(dest, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(out), exist_ok=True)
        raw = open(src, "rb").read()
        # 文本类做去隐私替换；二进制（ico）原样拷
        if src.endswith(".ico"):
            open(out, "wb").write(raw)
        else:
            for a, b in SANITIZE:
                raw = raw.replace(a, b)
            open(out, "wb").write(raw)
    tools = os.path.join(dest, "工具")
    os.makedirs(tools, exist_ok=True)
    for rel in SRC_TOOLS:
        src = os.path.join(ROOT, rel.replace("/", os.sep))
        if not os.path.exists(src):
            print("  ⚠ 缺工具（跳过）：%s" % rel)
            continue
        raw = open(src, "rb").read()
        for a, b in SANITIZE:
            raw = raw.replace(a, b)
        open(os.path.join(tools, os.path.basename(rel)), "wb").write(raw)
    shutil.copy2(README_SRC_BASE, os.path.join(dest, "README.md"))


def main():
    date = datetime.date.today().strftime("%Y%m%d")
    argv = sys.argv[1:]
    if "--date" in argv:
        date = argv[argv.index("--date") + 1]

    print("== 1/5 检查产物 ==")
    for p in (RELEASE_EXE, NSIS, NSI, README_BASE):
        if not os.path.exists(p):
            print("  缺少文件：" + p)
            return 1
    print("  OK（release exe %.2f MB）" % (os.path.getsize(RELEASE_EXE) / 1048576))

    # 散件目录（仅打包输入，最后会保留——便于手工核验；命名带 ShareSuffix）
    stage = os.path.join(PKG, "几何任务栏小插件-share-" + date)
    if os.path.isdir(stage):
        shutil.rmtree(stage)
    os.makedirs(stage)

    print("== 2/5 准备免安装散件 ==")
    shutil.copy2(RELEASE_EXE, os.path.join(stage, "geometric-ocean.exe"))
    n_patch = patch_exe(os.path.join(stage, "geometric-ocean.exe"))
    print("  exe 内嵌路径等长替换：%d 处" % n_patch)
    shutil.copy2(README_BASE, os.path.join(stage, "README.md"))
    with open(os.path.join(stage, "启动-几何任务栏小插件.bat"), "w", encoding="ascii") as f:
        f.write(LAUNCH_BAT)
    with open(os.path.join(stage, "退出-几何任务栏小插件.bat"), "w", encoding="ascii") as f:
        f.write(QUIT_BAT)
    print("  " + stage)

    print("== 2b 准备去隐私源码（放进包内 源码/ 子目录） ==")
    src_dest = os.path.join(stage, "源码")
    build_source_tree(src_dest)
    n_files = sum(len(fs) for _r, _d, fs in os.walk(src_dest))
    print("  源码 %d 个文件 → %s" % (n_files, src_dest))

    setup_out = os.path.join(PKG, "几何任务栏小插件-setup-%s.exe" % date)
    zip_out = os.path.join(PKG, "几何任务栏小插件-share-%s.zip" % date)

    print("== 3/5 隐私扫描（散件，出包前闸门） ==")
    rc = subprocess.call([sys.executable, os.path.join(ROOT, ".workbuddy", "devtools", "privacy_scan.py"), stage])
    if rc != 0:
        print("  ✗ 散件里有敏感串，已中止出包（见上方明细）")
        return 1
    print("  ✓ 散件干净")

    print("== 4/6 编译安装程序 ==")
    if os.path.exists(setup_out):
        os.remove(setup_out)
    cmd = [
        NSIS, "-V2",
        "-DOUT_FILE=" + setup_out,
        "-DREADME_FILE=" + README_BASE,
        "-DEXE_FILE=" + os.path.join(stage, "geometric-ocean.exe"),   # 用打过补丁的那份
        NSI,
    ]
    rc = subprocess.call(cmd)
    if rc != 0 or not os.path.exists(setup_out):
        print("  makensis 失败（exit %s）" % rc)
        return 1
    print("  " + setup_out)

    print("== 5/6 压免安装 zip ==")
    if os.path.exists(zip_out):
        os.remove(zip_out)
    with zipfile.ZipFile(zip_out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for root_dir, _dirs, names in os.walk(stage):
            for n in sorted(names):
                p = os.path.join(root_dir, n)
                z.write(p, os.path.relpath(p, stage))
    print("  " + zip_out)

    print("== 6/6 核验（含安装程序载荷隐私扫描） ==")
    with zipfile.ZipFile(zip_out) as z:
        names = z.namelist()
        bad = z.testzip()
    need = {"geometric-ocean.exe", "README.md", "启动-几何任务栏小插件.bat", "退出-几何任务栏小插件.bat",
            "源码/README.md", "源码/src/config.js", "源码/src-tauri/src/main.rs"}
    missing = need - set(names)
    print("  zip 文件数：%d" % len(names))
    print("  zip 完整性：%s" % ("OK" if bad is None else ("损坏 " + bad)))
    print("  缺项：%s" % (", ".join(sorted(missing)) if missing else "无"))

    # 安装程序是 LZMA 压缩载荷，直接扫字符串扫不到 → 静默解到临时目录再扫
    verify_dir = os.path.join(ROOT, ".workbuddy", "downloads", "_verify_install")
    if os.path.isdir(verify_dir):
        shutil.rmtree(verify_dir)
    rc = subprocess.call([setup_out, "/S", "/D=" + verify_dir])
    if rc != 0 or not os.path.isdir(verify_dir):
        print("  ⚠ 安装程序静默解包失败（exit %s）——载荷隐私未验证" % rc)
        return 1
    rc = subprocess.call([sys.executable, os.path.join(ROOT, ".workbuddy", "devtools", "privacy_scan.py"), verify_dir])
    print("  安装程序载荷：%s" % ("干净 ✓" if rc == 0 else "有敏感串 ✗"))
    # 清场（解包出来的程序 + 卸载器）
    uninstaller = os.path.join(verify_dir, "卸载.exe")
    if os.path.exists(uninstaller):
        subprocess.call([uninstaller, "/S"])
    if os.path.isdir(verify_dir):
        shutil.rmtree(verify_dir, ignore_errors=True)

    print("  setup %.2f MB ｜ zip %.2f MB"
          % (os.path.getsize(setup_out) / 1048576, os.path.getsize(zip_out) / 1048576))
    ok = (bad is None and not missing and rc == 0)
    print("结论：" + ("全部通过 ✓" if ok else "有未通过项 ✗"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
