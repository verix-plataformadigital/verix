import fs from "node:fs";

const file = fs.readFileSync("windows/VerixPortable/Program.cs", "utf8");
const project = fs.readFileSync("windows/VerixPortable/VerixPortable.csproj", "utf8");
const workflow = fs.readFileSync(".github/workflows/reengineering-v2.yml", "utf8");
const responsiveWorkflow = fs.readFileSync(".github/workflows/mobile-responsive.yml", "utf8");
const windowsReleaseWorkflow = fs.readFileSync(".github/workflows/build-windows-release.yml", "utf8");
const packager = fs.readFileSync("tools/package-windows-release.ps1", "utf8");
const pagesWorkflow = fs.readFileSync(".github/workflows/deploy-pages.yml", "utf8");
const secureReleaseWorkflow = fs.readFileSync(".github/workflows/secure-release.yml", "utf8");
const launcher = fs.readFileSync("windows/VerixPortable/Run-V2-Local.cmd", "utf8");

function methodBody(signature) {
  const start = file.indexOf(signature);
  if (start < 0) {
    throw new Error("Missing required Windows host method: " + signature);
  }

  const open = file.indexOf("{", start + signature.length);
  if (open < 0) {
    throw new Error("Missing method body for Windows host method: " + signature);
  }

  let depth = 0;
  for (let index = open; index < file.length; index += 1) {
    if (file[index] === "{") depth += 1;
    else if (file[index] === "}") depth -= 1;

    if (depth === 0) {
      return file.slice(open + 1, index);
    }
  }

  throw new Error("Unclosed method body for Windows host method: " + signature);
}

function requireMarkers(scope, signature, markers) {
  const body = methodBody(signature);
  for (const marker of markers) {
    if (!body.includes(marker)) {
      throw new Error(
        "Missing Windows host security control in " + scope + ": " + marker
      );
    }
  }
}

const requiredFileMarkers = [
  "NavigationStarting",
  "FrameNavigationStarting",
  "NewWindowRequested",
  "DownloadStarting",
  "IsUserInitiated",
  "extranet.imtt.external.rnsi.local",
  "consultapsp.imtt.external.rnsi.local",
  "SetVirtualHostNameToFolderMapping",
  "CoreWebView2HostResourceAccessKind.DenyCors",
  "v2-assets",
  "--v2-local",
  "AreDevToolsEnabled = false",
  "AreHostObjectsAllowed = false",
  "IsWebMessageEnabled = false",
  "IsPasswordAutosaveEnabled = false",
  "IsGeneralAutofillEnabled = false",
  "IsSwipeNavigationEnabled = false"
];

for (const marker of requiredFileMarkers) {
  if (!file.includes(marker)) {
    throw new Error("Missing required Windows host security marker: " + marker);
  }
}

// Check each URL policy inside the method that is supposed to enforce it.
// This prevents a marker elsewhere in the file from masking a weakened guard.
requireMarkers("production origin", "private static bool IsAllowedProductionUri(Uri uri)", [
  "uri.Scheme == Uri.UriSchemeHttps",
  "string.Equals(uri.Host, AllowedHost, StringComparison.OrdinalIgnoreCase)",
  "uri.Port == 443",
  'uri.AbsolutePath.StartsWith("/verix/"',
  "string.IsNullOrEmpty(uri.UserInfo)"
]);

requireMarkers("external HTTPS allowlist", "private static bool IsAllowedExternalUri(Uri uri)", [
  "uri.Scheme == Uri.UriSchemeHttps",
  "ExternalAllowedHosts.Contains(uri.Host)",
  "uri.Port == 443",
  "string.IsNullOrEmpty(uri.UserInfo)"
]);

requireMarkers("internal RNSI origin", "private static bool IsAllowedInternalRnsUri(Uri uri)", [
  "uri.Scheme == Uri.UriSchemeHttp",
  "InternalHttpAllowedHosts.Contains(uri.Host)",
  "uri.Port == 80",
  'uri.AbsolutePath.StartsWith("/veiculos/"',
  "string.IsNullOrEmpty(uri.UserInfo)"
]);

requireMarkers("local V2 origin", "private static bool IsAllowedV2LocalUri(Uri uri)", [
  "uri.Scheme == Uri.UriSchemeHttps",
  "string.Equals(uri.Host, AllowedHost, StringComparison.OrdinalIgnoreCase)",
  "uri.Port == -1 || uri.Port == 443",
  'uri.AbsolutePath == "/"',
  'uri.AbsolutePath, "/index.html"',
  "string.IsNullOrEmpty(uri.UserInfo)"
]);

requireMarkers("primary origin selection", "private static bool IsAllowedPrimaryUri(Uri uri)", [
  "LocalV2Mode",
  "IsAllowedV2LocalUri(uri)",
  "IsAllowedProductionUri(uri)"
]);

requireMarkers("local V2 asset mapping", "private async Task InitializeWebViewAsync()", [
  "if (LocalV2Mode)",
  'Path.Combine(AppContext.BaseDirectory, "v2-assets")',
  "File.Exists(localEntryPoint)",
  "SetVirtualHostNameToFolderMapping",
  "CoreWebView2HostResourceAccessKind.DenyCors",
  "SHA256.HashData",
  "LocalV2StartUrl"
]);

requireMarkers("top-level navigation", "private void OnNavigationStarting(", [
  "IsAllowedPrimaryUri(uri)",
  "IsAllowedExternalUri(uri)",
  "IsAllowedInternalRnsUri(uri)",
  "e.Cancel = true"
]);

requireMarkers("main WebView frame navigation", "private void OnFrameNavigationStarting(", [
  "IsAllowedPrimaryUri(uri)",
  "e.Cancel = true"
]);

requireMarkers("new-window navigation", "private async void OnNewWindowRequested(", [
  "!e.IsUserInitiated",
  "IsAllowedPrimaryUri(uri)",
  "IsAllowedInternalRnsUri(uri)",
  "IsAllowedExternalUri(uri)",
  "e.Handled = true"
]);

requireMarkers("RNSI top-level navigation", "private static void OnRnsiNavigationStarting(", [
  "IsAllowedInternalRnsUri(new Uri(e.Uri))",
  "e.Cancel = true"
]);

requireMarkers("RNSI frame navigation", "private static void OnRnsiFrameNavigationStarting(", [
  "IsAllowedInternalRnsUri(new Uri(e.Uri))",
  "e.Cancel = true"
]);

requireMarkers("RNSI popups", "private static void OnRnsiNewWindowRequested(", [
  "e.Handled = true"
]);

requireMarkers("RNSI downloads", "private static void OnRnsDownloadStarting(", [
  "e.Cancel = true"
]);

const protectedSettings = [
  "AreDevToolsEnabled = false",
  "AreDefaultContextMenusEnabled = false",
  "AreDefaultScriptDialogsEnabled = false",
  "AreHostObjectsAllowed = false",
  "AreBrowserAcceleratorKeysEnabled = false",
  "IsGeneralAutofillEnabled = false",
  "IsPasswordAutosaveEnabled = false",
  "IsWebMessageEnabled = false",
  "IsSwipeNavigationEnabled = false"
];

requireMarkers("main WebView settings", "private async Task InitializeWebViewAsync()", protectedSettings);
requireMarkers("RNSI native-scale rendering", "private async Task<(Form Form, CoreWebView2 CoreWebView2)> CreateRnsiWindowAsync(", [
  "view.ZoomFactor = 1.0;"
]);
requireMarkers("RNSI WebView settings", "private async Task<(Form Form, CoreWebView2 CoreWebView2)> CreateRnsiWindowAsync(", protectedSettings);

const requiredProjectMarkers = [
  'Content Include="$(V2AssetsRoot)**\\*"',
  "CopyToPublishDirectory",
  "ValidateV2AssetsForPublish",
  "Run-V2-Local.cmd",
  "v2-assets\\%(RecursiveDir)"
];
for (const marker of requiredProjectMarkers) {
  if (!project.includes(marker)) {
    throw new Error("Missing portable asset packaging control: " + marker);
  }
}

const requiredWorkflowMarkers = [
  "npm ci --no-fund --no-audit",
  "npm run build:v2",
  "dotnet publish",
  "pwsh -File tools/package-windows-release.ps1",
  "verify-windows-release-artifact:",
  "actions/download-artifact",
  "sha256sum --check VERIX-Windows-x64.zip.sha256",
  "unzip -t \"$zip\"",
  "node tools/verify-portable-package.mjs \"$extracted\""
];
for (const marker of requiredWorkflowMarkers) {
  if (!workflow.includes(marker)) {
    throw new Error("Missing Windows CI packaging control: " + marker);
  }
}

const requiredPackagerMarkers = [
  "tools/verify-portable-package.mjs",
  "& node $verifierPath",
  "Compress-Archive",
  "Expand-Archive",
  "Get-FileHash",
  "VERIX-Windows-x64.zip",
  "$zipPath.sha256",
  "System.IO.File]::WriteAllText"
];
for (const marker of requiredPackagerMarkers) {
  if (!packager.includes(marker)) {
    throw new Error("Windows release packager is missing verification control: " + marker);
  }
}

if (!launcher.includes("VERIX.exe") || !launcher.includes("--v2-local")) {
  throw new Error("Local V2 launcher must start VERIX.exe with --v2-local.");
}

for (const [label, source] of [
  ["V2 quality workflow", workflow],
  ["responsive browser workflow", responsiveWorkflow]
]) {
  if (!source.includes("workflow_call:")) {
    throw new Error(label + " must support secure reuse by the tagged release workflow.");
  }
}

const requiredWindowsReleaseMarkers = [
  "uses: ./.github/workflows/reengineering-v2.yml\n    permissions:\n      contents: read\n      actions: read",
  "uses: ./.github/workflows/mobile-responsive.yml",
  "needs:\n      - validate-v2\n      - validate-responsive",
  "name: verix-windows-win-x64",
  "sha256sum --check VERIX-Windows-x64.zip.sha256",
  "if: startsWith(github.ref, 'refs/tags/verix-v')",
  "contents: write",
  "gh release create",
  "gh release upload"
];
for (const marker of requiredWindowsReleaseMarkers) {
  if (!windowsReleaseWorkflow.includes(marker)) {
    throw new Error("Windows release workflow is missing required release gate: " + marker);
  }
}

const deployGuard = [
  "  deploy:",
  "    # workflow_dispatch can be started from any branch. Never let a PR branch publish to production Pages.",
  "    if: github.ref == 'refs/heads/main'",
  "    needs: build"
].join("\n");
if (!pagesWorkflow.includes(deployGuard)) {
  throw new Error("GitHub Pages production deploy must be restricted to refs/heads/main.");
}

for (const [label, source] of [
  ["GitHub Pages deploy", pagesWorkflow],
  ["manual secure release", secureReleaseWorkflow]
]) {
  for (const marker of ["npm install --global npm@12.2.0", "npm ci --no-fund --no-audit", "package-lock.json"]) {
    if (!source.includes(marker)) {
      throw new Error(label + " is missing reproducible dependency control: " + marker);
    }
  }
  if (source.includes("run: npm install --no-fund --no-audit")) {
    throw new Error(label + " still resolves dependencies with non-reproducible npm install.");
  }
}

const forbidden = [
  "--disable-web-security",
  "--allow-running-insecure-content",
  "--disable-site-isolation-trials",
  "--user-data-dir=http",
  "AreHostObjectsAllowed = true"
];

for (const marker of forbidden) {
  if (file.includes(marker)) {
    throw new Error("Forbidden WebView2 security override detected: " + marker);
  }
}

console.log("✓ Windows WebView2 host security policy passed.");
