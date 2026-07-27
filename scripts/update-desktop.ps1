$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DistPath = Join-Path $ProjectRoot 'dist'
$NextDistPath = Join-Path $ProjectRoot 'dist-next'
$ReviewFolderName = -join ([char[]](0x5F85, 0x5BA1, 0x6838, 0x540E, 0x6E05, 0x7406))
$ArchivePrefix = -join ([char[]](0x684C, 0x9762, 0x7248, 0x66F4, 0x65B0))
$DebugFolderName = -join ([char[]](0x8C03, 0x8BD5, 0x6587, 0x4EF6))
$ReviewRoot = Join-Path $ProjectRoot $ReviewFolderName
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$ArchivePath = Join-Path $ReviewRoot "$ArchivePrefix-$Timestamp"
$AppExe = Join-Path $DistPath 'win-unpacked\Markdown Editor.exe'
$NextAppExe = Join-Path $NextDistPath 'win-unpacked\Markdown Editor.exe'

Set-Location -LiteralPath $ProjectRoot

$RunningApp = Get-Process -Name 'Markdown Editor' -ErrorAction SilentlyContinue
if ($RunningApp) {
    throw 'Markdown Editor is running. Close it and run npm run update:desktop again.'
}

# Preserve stale output from a previously interrupted build.
if (Test-Path -LiteralPath $NextDistPath) {
    New-Item -ItemType Directory -Path $ArchivePath -Force | Out-Null
    Move-Item -LiteralPath $NextDistPath -Destination (Join-Path $ArchivePath 'stale-dist-next')
}

Write-Host 'Building renderer...'
& npm run build:renderer
if ($LASTEXITCODE -ne 0) {
    throw "Renderer build failed with exit code $LASTEXITCODE"
}

Write-Host 'Building dist-next\win-unpacked...'
# This unpacked local build does not need executable metadata editing or signing.
# Disabling it avoids a winCodeSign download and keeps updates usable offline.
& npx electron-builder --dir --win --config.directories.output=dist-next --config.win.signAndEditExecutable=false
if ($LASTEXITCODE -ne 0) {
    throw "Desktop package failed with exit code $LASTEXITCODE. The current dist was not changed."
}

if (-not (Test-Path -LiteralPath $NextAppExe -PathType Leaf)) {
    throw "Packaged application not found: $NextAppExe"
}

New-Item -ItemType Directory -Path $ArchivePath -Force | Out-Null
$ArchivedDistPath = Join-Path $ArchivePath 'dist'

# Replace the desktop package only after the new package is complete.
try {
    if (Test-Path -LiteralPath $DistPath) {
        Move-Item -LiteralPath $DistPath -Destination $ArchivedDistPath
    }
    Move-Item -LiteralPath $NextDistPath -Destination $DistPath
} catch {
    if ((-not (Test-Path -LiteralPath $DistPath)) -and (Test-Path -LiteralPath $ArchivedDistPath)) {
        Move-Item -LiteralPath $ArchivedDistPath -Destination $DistPath
    }
    throw
}

# Archive only files known to be disposable diagnostics or build metadata.
$DebugArchive = Join-Path $ArchivePath $DebugFolderName
$DisposableFiles = @(
    (Join-Path $ProjectRoot 'renderer-console.log'),
    (Join-Path $DistPath 'builder-debug.yml'),
    (Join-Path $DistPath 'builder-effective-config.yaml')
)
foreach ($DisposableFile in $DisposableFiles) {
    if (Test-Path -LiteralPath $DisposableFile -PathType Leaf) {
        New-Item -ItemType Directory -Path $DebugArchive -Force | Out-Null
        Move-Item -LiteralPath $DisposableFile -Destination $DebugArchive
    }
}

& (Join-Path $PSScriptRoot 'register-file-assoc.ps1') -AppExe $AppExe

Write-Host ''
Write-Host 'Desktop update completed.'
Write-Host "Review archive: $ArchivePath"
Write-Host "Latest application: $AppExe"
