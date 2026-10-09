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

# Validate the raw publish directory before creating any downloadable archive.
& node $verifierPath $publishPath
if ($LASTEXITCODE -ne 0) {
    throw "The Windows publish directory failed portable-package verification."
}

New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
$zipPath = Join-Path $outputPath "VERIX-Windows-x64.zip"
$checksumPath = "$zipPath.sha256"

$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$verifyPath = Join-Path $tempRoot ("verix-release-package-check-" + [Guid]::NewGuid().ToString("N"))

try {
    if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }
    if (Test-Path -LiteralPath $checksumPath) {
        Remove-Item -LiteralPath $checksumPath -Force
    }

    Compress-Archive -Path (Join-Path $publishPath "*") -DestinationPath $zipPath -CompressionLevel Optimal
    Expand-Archive -LiteralPath $zipPath -DestinationPath $verifyPath

    # Validate the extracted archive too: the deliverable, not merely the source
    # publish directory, must contain the executable, launcher and every V2 asset.
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
    if (Test-Path -LiteralPath $verifyPath) {
        Remove-Item -LiteralPath $verifyPath -Recurse -Force
    }
}
