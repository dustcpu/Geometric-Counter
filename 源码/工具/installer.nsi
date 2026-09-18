; 几何任务栏小插件 · 预览版安装程序
; 免管理员（RequestExecutionLevel user），装到 %LOCALAPPDATA%，卸载干净
Unicode true
Name "几何任务栏小插件"
; 输出名与 README 路径由打包脚本传入（package.py），故这里只做兜底默认值
!ifndef OUT_FILE
  !define OUT_FILE "C:\path\to\geometric-ocean\发布包\几何任务栏小插件-setup-YYYYMMDD.exe"
!endif
!ifndef README_FILE
  !define README_FILE "C:\path\to\geometric-ocean\发布包\README-基础版.md"
!endif
!ifndef EXE_FILE
  !define EXE_FILE "C:\path\to\geometric-ocean\src-tauri\target\release\geometric-ocean.exe"
!endif
OutFile "${OUT_FILE}"
InstallDir "$LOCALAPPDATA\GeometricCounter"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails show
ShowUninstDetails show

!include "MUI2.nsh"

!define MUI_ICON "C:\path\to\geometric-ocean\src-tauri\icons\icon.ico"
!define MUI_UNICON "C:\path\to\geometric-ocean\src-tauri\icons\icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\geometric-ocean.exe"
!define MUI_FINISHPAGE_RUN_PARAMETERS "--global"
!define MUI_FINISHPAGE_RUN_TEXT "立即启动「几何任务栏小插件」"
!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Section "安装" SecInstall
  SetShellVarContext current

  ; 若已有实例在跑，先结束（否则文件占用无法覆盖）
  nsExec::Exec 'taskkill /IM geometric-ocean.exe /F'

  SetOutPath "$INSTDIR"
  File "${EXE_FILE}"
  File "/oname=README.md" "${README_FILE}"

  WriteUninstaller "$INSTDIR\卸载.exe"

  CreateDirectory "$SMPROGRAMS\几何任务栏小插件"
  CreateShortCut "$SMPROGRAMS\几何任务栏小插件\启动 几何任务栏小插件.lnk" "$INSTDIR\geometric-ocean.exe" "--global" "$INSTDIR\geometric-ocean.exe" 0
  CreateShortCut "$SMPROGRAMS\几何任务栏小插件\使用说明.lnk" "$INSTDIR\README.md"
  CreateShortCut "$SMPROGRAMS\几何任务栏小插件\卸载 几何任务栏小插件.lnk" "$INSTDIR\卸载.exe"
  CreateShortCut "$DESKTOP\几何任务栏小插件.lnk" "$INSTDIR\geometric-ocean.exe" "--global" "$INSTDIR\geometric-ocean.exe" 0

  ; 注册到「应用和功能」（HKCU，免管理员）
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GeometricCounter" "DisplayName" "几何任务栏小插件（预览版）"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GeometricCounter" "DisplayVersion" "0.1.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GeometricCounter" "Publisher" "内测版"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GeometricCounter" "UninstallString" '"$INSTDIR\卸载.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GeometricCounter" "DisplayIcon" "$INSTDIR\geometric-ocean.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GeometricCounter" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GeometricCounter" "NoRepair" 1

  ; 清掉改名前的旧卸载登记（键名带 Wallpaper），免得「应用和功能」里出现两条
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GeometricOceanWallpaper"
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  nsExec::Exec 'taskkill /IM geometric-ocean.exe /F'

  Delete "$INSTDIR\geometric-ocean.exe"
  Delete "$INSTDIR\README.md"
  Delete "$INSTDIR\卸载.exe"
  RMDir "$INSTDIR"

  Delete "$SMPROGRAMS\几何任务栏小插件\启动 几何任务栏小插件.lnk"
  Delete "$SMPROGRAMS\几何任务栏小插件\使用说明.lnk"
  Delete "$SMPROGRAMS\几何任务栏小插件\卸载 几何任务栏小插件.lnk"
  RMDir "$SMPROGRAMS\几何任务栏小插件"
  Delete "$DESKTOP\几何任务栏小插件.lnk"

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GeometricCounter"
SectionEnd
