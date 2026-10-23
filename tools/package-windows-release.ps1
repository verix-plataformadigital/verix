[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$PublishDirectory,

    [string]$OutputDirectory = "release-assets"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = (Get-Location).Path
$publishPath = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $PublishDirectory))
$outputPath = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputDirectory))
$verifierPath = Join-Path $repositoryRoot "tools/verify-portable-package.mjs"

if (!(Test-Path -LiteralPath $publishPath -PathType Container)) {
    throw "Publish directory does not exist: $publishPath"
}

if (!(Test-Path -LiteralPath $verifierPath -PathType Leaf)) {
    throw "Portable package verifier is missing: $verifierPath"
}

$executablePath = Join-Path $publishPath "VERIX.exe"
if (!(Test-Path -LiteralPath $executablePath -PathType Leaf)) {
    throw "Portable Windows executable is missing: $executablePath"
}

New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
$zipPath = Join-Path $outputPath "VERIX-Windows-x64.zip"
$checksumPath = "$zipPath.sha256"

$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$stagePath = Join-Path $tempRoot ("verix-release-package-stage-" + [Guid]::NewGuid().ToString("N"))
$verifyPath = Join-Path $tempRoot ("verix-release-package-check-" + [Guid]::NewGuid().ToString("N"))

try {
    if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }
    if (Test-Path -LiteralPath $checksumPath) {
        Remove-Item -LiteralPath $checksumPath -Force
    }

    # Build a clean staging directory. PDB files are debug symbols, not runtime
    # dependencies, and must never be shipped in the downloadable package.
    New-Item -ItemType Directory -Path $stagePath -Force | Out-Null
    Get-ChildItem -LiteralPath $publishPath -Force -Recurse -File |
        Where-Object { $_.Extension -ine ".pdb" } |
        ForEach-Object {
            $relativePath = [System.IO.Path]::GetRelativePath($publishPath, $_.FullName)
            $stagedFile = Join-Path $stagePath $relativePath
            $stagedParent = Split-Path -Parent $stagedFile
            New-Item -ItemType Directory -Path $stagedParent -Force | Out-Null
            Copy-Item -LiteralPath $_.FullName -Destination $stagedFile -Force
        }

    # Validate the exact staged payload that will be zipped.
    & node $verifierPath $stagePath
    if ($LASTEXITCODE -ne 0) {
        throw "The staged Windows package failed portable-package verification."
    }

    Compress-Archive -Path (Join-Path $stagePath "*") -DestinationPath $zipPath -CompressionLevel Optimal
    New-Item -ItemType Directory -Path $verifyPath -Force | Out-Null
    Expand-Archive -LiteralPath $zipPath -DestinationPath $verifyPath

    # Validate the extracted archive too: this checks the actual deliverable,
    # including required files and the absence of debug symbols/source maps.
    & node $verifierPath $verifyPath
    if ($LASTEXITCODE -ne 0) {
        throw "The generated Windows ZIP failed portable-package verification."
    }

    $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    # Use UTF-8 without BOM and LF line endings so sha256sum --check can verify it
    # on the Linux release job without platform-specific checksum parsing.
    [System.IO.File]::WriteAllText(
        $checksumPath,
        "$hash  VERIX-Windows-x64.zip`n",
        [System.Text.UTF8Encoding]::new($false)
    )

    Write-Host "Windows portable ZIP created: $zipPath"
    Write-Host "SHA-256: $hash"
}
finally {
    foreach ($temporaryPath in @($verifyPath, $stagePath)) {
        if (Test-Path -LiteralPath $temporaryPath) {
            Remove-Item -LiteralPath $temporaryPath -Recurse -Force
        }
    }
}
