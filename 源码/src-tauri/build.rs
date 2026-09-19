// 几何任务栏小插件 · 构建脚本
// 编译前把根目录的前端三件套（index.html / style.css / src/）同步到 dist/——
// frontendDist 必须是「纯前端目录」，不能指项目根（会把 src-tauri/target 的
// 编译产物也当资源嵌入，撞上 cargo 文件锁）。dist/ 是纯生成物，可随时删除。
fn main() {
    let manifest = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let root = manifest.parent().expect("src-tauri 必有父目录");
    let dist = root.join("dist");

    if dist.exists() {
        std::fs::remove_dir_all(&dist).expect("清理旧 dist 失败");
    }
    std::fs::create_dir_all(&dist).expect("创建 dist 失败");

    for item in ["index.html", "shell.html", "settings.html", "unlock.html", "style.css", "src"] {
        let from = root.join(item);
        let to = dist.join(item);
        if from.is_dir() {
            copy_dir_all(&from, &to).expect(&format!("同步 {} 失败", item));
        } else {
            std::fs::copy(&from, &to).expect(&format!("复制 {} 失败", item));
        }
    }

    tauri_build::build()
}

fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &to)?;
        } else {
            std::fs::copy(entry.path(), to)?;
        }
    }
    Ok(())
}
