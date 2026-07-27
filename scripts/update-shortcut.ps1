param(
    [Parameter(Mandatory = $true)]
    [string]$AppExe
)

$ErrorActionPreference = 'Stop'
$ResolvedAppExe = (Resolve-Path -LiteralPath $AppExe).Path
$DesktopPath = [Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $DesktopPath 'Markdown Editor.lnk'
$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $ResolvedAppExe
$Shortcut.WorkingDirectory = Split-Path -Parent $ResolvedAppExe
$Shortcut.IconLocation = "$ResolvedAppExe,0"
$Shortcut.Description = 'Markdown Editor'
$Shortcut.Save()

Write-Host "Desktop shortcut updated: $ShortcutPath"
