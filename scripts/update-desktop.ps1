$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ReleasePath = Join-Path $ProjectRoot 'release'
$NextReleasePath = Join-Path $ProjectRoot 'release-next'
$ReviewFolderName = -join ([char[]](0x4EBA, 0x5DE5, 0x5BA1, 0x6838, 0x540E, 0x5220, 0x9664))
$ArchivePrefix = -join ([char[]](0x684C, 0x9762, 0x7248, 0x66F4, 0x65B0))
$DebugFolderName = -join ([char[]](0x8C03, 0x8BD5, 0x6587, 0x4EF6))
$ReviewRoot = Join-Path $ProjectRoot $ReviewFolderName
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$ArchivePath = Join-Path $ReviewRoot "$ArchivePrefix-$Timestamp"
$AppExe = Join-Path $ReleasePath 'win-unpacked\Markdown Editor.exe'
$NextAppExe = Join-Path $NextReleasePath 'win-unpacked\Markdown Editor.exe'

Set-Location -LiteralPath $ProjectRoot

$RunningApp = Get-Process -Name 'Markdown Editor' -ErrorAction SilentlyContinue
if ($RunningApp) {
    throw 'Markdown Editor is running. Close it and run npm run update:desktop again.'
}

if (Test-Path -LiteralPath $NextReleasePath) {
    New-Item -ItemType Directory -Path $ArchivePath -Force | Out-Null
    Move-Item -LiteralPath $NextReleasePath -Destination (Join-Path $ArchivePath 'stale-release-next')
}

Write-Host 'Building renderer...'
& npm run build:renderer
if ($LASTEXITCODE -ne 0) {
    throw "Renderer build failed with exit code $LASTEXITCODE"
}

Write-Host 'Building release-next\win-unpacked...'
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
& npx electron-builder --dir --win --publish never --config.directories.output=release-next --config.win.signExecutable=false
if ($LASTEXITCODE -ne 0) {
    throw "Desktop package failed with exit code $LASTEXITCODE. The current release was not changed."
}

if (-not (Test-Path -LiteralPath $NextAppExe -PathType Leaf)) {
    throw "Packaged application not found: $NextAppExe"
}

New-Item -ItemType Directory -Path $ArchivePath -Force | Out-Null
$ArchivedReleasePath = Join-Path $ArchivePath 'release'

try {
    if (Test-Path -LiteralPath $ReleasePath) {
        Move-Item -LiteralPath $ReleasePath -Destination $ArchivedReleasePath
    }
    Move-Item -LiteralPath $NextReleasePath -Destination $ReleasePath
} catch {
    if ((-not (Test-Path -LiteralPath $ReleasePath)) -and (Test-Path -LiteralPath $ArchivedReleasePath)) {
        Move-Item -LiteralPath $ArchivedReleasePath -Destination $ReleasePath
    }
    throw
}

$DebugArchive = Join-Path $ArchivePath $DebugFolderName
$DisposableFiles = @(
    (Join-Path $ProjectRoot 'renderer-console.log'),
    (Join-Path $ReleasePath 'builder-debug.yml'),
    (Join-Path $ReleasePath 'builder-effective-config.yaml')
)
foreach ($DisposableFile in $DisposableFiles) {
    if (Test-Path -LiteralPath $DisposableFile -PathType Leaf) {
        New-Item -ItemType Directory -Path $DebugArchive -Force | Out-Null
        Move-Item -LiteralPath $DisposableFile -Destination $DebugArchive
    }
}

& (Join-Path $PSScriptRoot 'register-file-assoc.ps1') -AppExe $AppExe
& (Join-Path $PSScriptRoot 'update-shortcut.ps1') -AppExe $AppExe

Write-Host ''
Write-Host 'Desktop update completed.'
Write-Host "Review archive: $ArchivePath"
Write-Host "Latest application: $AppExe"
