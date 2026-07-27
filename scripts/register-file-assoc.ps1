param(
    [string]$AppExe
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot

if ([string]::IsNullOrWhiteSpace($AppExe)) {
    $AppExe = Join-Path $ProjectRoot 'release\win-unpacked\Markdown Editor.exe'
}

$AppExe = [System.IO.Path]::GetFullPath($AppExe)
$AppDir = Split-Path -Parent $AppExe
$ProgId = 'markdown-editor'
$AppName = 'Markdown Editor'
$Extensions = @('.md', '.markdown', '.mdown', '.mdtext')

if (-not (Test-Path -LiteralPath $AppExe -PathType Leaf)) {
    throw "Desktop application not found: $AppExe"
}

function Set-DefaultRegistryValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Value
    )

    New-Item -Path $Path -Force | Out-Null
    Set-Item -Path $Path -Value $Value
}

$OpenCommand = '"{0}" "%1"' -f $AppExe
$IconValue = '"{0}",0' -f $AppExe

# Register a stable ProgID.
$ProgIdPath = "HKCU:\Software\Classes\$ProgId"
Set-DefaultRegistryValue -Path $ProgIdPath -Value $AppName
Set-DefaultRegistryValue -Path "$ProgIdPath\DefaultIcon" -Value $IconValue
Set-DefaultRegistryValue -Path "$ProgIdPath\shell\open\command" -Value $OpenCommand

# Windows may retain Applications\Markdown Editor.exe as its UserChoice.
# Refreshing this command makes that existing selection use the newest build.
$ApplicationPath = 'HKCU:\Software\Classes\Applications\Markdown Editor.exe'
Set-DefaultRegistryValue -Path "$ApplicationPath\shell\open\command" -Value $OpenCommand
New-Item -Path "$ApplicationPath\SupportedTypes" -Force | Out-Null

foreach ($Extension in $Extensions) {
    $ExtensionPath = "HKCU:\Software\Classes\$Extension"
    Set-DefaultRegistryValue -Path $ExtensionPath -Value $ProgId
    New-ItemProperty -Path $ExtensionPath -Name 'FriendlyTypeName' -Value 'Markdown document' -PropertyType String -Force | Out-Null
    $OpenWithPath = "$ExtensionPath\OpenWithProgids"
    New-Item -Path $OpenWithPath -Force | Out-Null
    New-ItemProperty -Path $OpenWithPath -Name $ProgId -Value '' -PropertyType String -Force | Out-Null
    New-ItemProperty -Path "$ApplicationPath\SupportedTypes" -Name $Extension -Value '' -PropertyType String -Force | Out-Null
}

# Create or replace the shortcut at the system-resolved Desktop location.
$Desktop = [Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $Desktop 'Markdown Editor.lnk'
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $AppExe
$Shortcut.WorkingDirectory = $AppDir
$Shortcut.Description = 'Markdown Editor - current verified build'
$Shortcut.IconLocation = "$AppExe,0"
$Shortcut.Save()

# Notify Explorer that file associations and icons changed.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ShellAssociationRefresh {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(uint eventId, uint flags, IntPtr item1, IntPtr item2);
}
'@
[ShellAssociationRefresh]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)

Write-Host "Registered file associations: $($Extensions -join ', ')"
Write-Host "Desktop shortcut: $ShortcutPath"
Write-Host "Application: $AppExe"
