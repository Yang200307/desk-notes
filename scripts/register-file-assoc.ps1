# Markdown 编辑器 — 注册 .md 文件关联
# 以管理员身份运行此脚本
# 右键 → "以管理员身份运行" 或在管理员 PowerShell 中执行

$ErrorActionPreference = "Stop"

# 应用路径 — 指向 win-unpacked 目录下的 exe
$AppDir = "C:\Users\10339\OneDrive\桌面\origin_data\Markdown阅读器\dist\win-unpacked"
$AppExe = Join-Path $AppDir "Markdown Editor.exe"
$AppName = "Markdown编辑器"

if (-not (Test-Path $AppExe)) {
    Write-Host "错误: 找不到 $AppExe" -ForegroundColor Red
    Write-Host "请确认 dist\win-unpacked\Markdown Editor.exe 存在" -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "=== Markdown 编辑器 — .md 文件关联注册 ===" -ForegroundColor Cyan
Write-Host ""

# 1. 注册应用程序
$RegPath = "HKCU:\Software\Classes\markdown-editor"
New-Item -Path $RegPath -Force | Out-Null
Set-ItemProperty -Path $RegPath -Name "(default)" -Value $AppName -Type String

# 图标
New-Item -Path "$RegPath\DefaultIcon" -Force | Out-Null
Set-ItemProperty -Path "$RegPath\DefaultIcon" -Name "(default)" -Value """$AppExe"",0" -Type String

# 打开命令
New-Item -Path "$RegPath\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$RegPath\shell\open\command" -Name "(default)" -Value """$AppExe"" ""%1""" -Type String
Write-Host "[OK] 已注册应用程序" -ForegroundColor Green

# 2. 关联 .md 扩展名
$Exts = @(".md", ".markdown", ".mdown", ".mdtext")
foreach ($ext in $Exts) {
    $ExtPath = "HKCU:\Software\Classes\$ext"
    New-Item -Path $ExtPath -Force | Out-Null
    Set-ItemProperty -Path $ExtPath -Name "(default)" -Value "markdown-editor" -Type String

    # 友好名称
    New-Item -Path "$ExtPath" -Force | Out-Null
    New-ItemProperty -Path "$ExtPath" -Name "FriendlyTypeName" -Value "Markdown 文档" -Type String -Force

    Write-Host "[OK] 已关联 $ext" -ForegroundColor Green
}

# 3. 刷新图标缓存
iex "cmd /c assoc .md=markdown-editor 2>nul"
iex "cmd /c ftype markdown-editor=""$AppExe"" ""%1"" 2>nul"
Write-Host "[OK] 已刷新文件关联" -ForegroundColor Green

# 4. 创建桌面快捷方式
$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "Markdown 编辑器.lnk"
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $AppExe
$Shortcut.WorkingDirectory = $AppDir
$Shortcut.Description = "所见即所得 Markdown 编辑器"
$Shortcut.IconLocation = "$AppExe,0"
$Shortcut.Save()
Write-Host "[OK] 已创建桌面快捷方式" -ForegroundColor Green

Write-Host ""
Write-Host "=== 完成！===" -ForegroundColor Cyan
Write-Host ""
Write-Host "现在你可以：" -ForegroundColor White
Write-Host "  1. 双击桌面上的 ""Markdown 编辑器"" 快捷方式启动" -ForegroundColor White
Write-Host "  2. 双击任意 .md 文件，选择 Markdown编辑器 打开" -ForegroundColor White
Write-Host "  3. 右键 .md 文件 → 打开方式 → Markdown编辑器" -ForegroundColor White
Write-Host ""

Read-Host "按 Enter 关闭"

# ============================================
# 卸载脚本（如需取消关联，请运行以下命令）:
#
# Remove-Item -Path "HKCU:\Software\Classes\markdown-editor" -Recurse -Force
# foreach ($ext in @(".md", ".markdown", ".mdown", ".mdtext")) {
#     Remove-ItemProperty -Path "HKCU:\Software\Classes\$ext" -Name "(default)" -Force
# }
# Remove-Item "$env:USERPROFILE\Desktop\Markdown 编辑器.lnk" -Force
# ============================================
