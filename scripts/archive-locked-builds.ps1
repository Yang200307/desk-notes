#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ReviewFolderName = -join ([char[]](0x4EBA, 0x5DE5, 0x5BA1, 0x6838, 0x540E, 0x5220, 0x9664))
$ArchivePrefix = -join ([char[]](0x65E7, 0x6784, 0x5EFA))
$ReviewRoot = Join-Path $ProjectRoot $ReviewFolderName
$ArchivePath = Join-Path $ReviewRoot ($ArchivePrefix + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$CurrentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$AdministratorsSid = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
$SystemSid = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')
$Targets = @('dist', 'dist-local')

function Assert-ProjectChild([string]$Path) {
    $resolvedProject = [System.IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\') + '\'
    $resolvedPath = [System.IO.Path]::GetFullPath($Path).TrimEnd('\') + '\'
    if (-not $resolvedPath.StartsWith($resolvedProject, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to modify a path outside the project: $Path"
    }
}

New-Item -ItemType Directory -Path $ArchivePath -Force | Out-Null

foreach ($Name in $Targets) {
    $Target = Join-Path $ProjectRoot $Name
    if (-not (Test-Path -LiteralPath $Target -PathType Container)) {
        continue
    }

    Assert-ProjectChild $Target

    $Acl = [System.Security.AccessControl.DirectorySecurity]::new()
    $Acl.SetAccessRuleProtection($true, $false)
    $Acl.SetOwner($CurrentSid)
    foreach ($Identity in @($CurrentSid, $AdministratorsSid, $SystemSid)) {
        $Rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
            $Identity,
            [System.Security.AccessControl.FileSystemRights]::FullControl,
            [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',
            [System.Security.AccessControl.PropagationFlags]::None,
            [System.Security.AccessControl.AccessControlType]::Allow
        )
        [void]$Acl.AddAccessRule($Rule)
    }
    Set-Acl -LiteralPath $Target -AclObject $Acl
    Move-Item -LiteralPath $Target -Destination (Join-Path $ArchivePath $Name)
}

Write-Host "Completed. Review archive: $ArchivePath"
