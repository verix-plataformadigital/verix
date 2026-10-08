import fs from "node:fs";

const file = fs.readFileSync("windows/VerixPortable/Program.cs", "utf8");

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
  "consultapsp.imtt.external.rnsi.local",
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

requireMarkers("top-level navigation", "private void OnNavigationStarting(", [
  "IsAllowedProductionUri(uri)",
  "IsAllowedExternalUri(uri)",
  "IsAllowedInternalRnsUri(uri)",
  "e.Cancel = true"
]);

requireMarkers("main WebView frame navigation", "private void OnFrameNavigationStarting(", [
  "IsAllowedProductionUri(uri)",
  "e.Cancel = true"
]);

requireMarkers("new-window navigation", "private async void OnNewWindowRequested(", [
  "!e.IsUserInitiated",
  "IsAllowedProductionUri(uri)",
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
requireMarkers("RNSI WebView settings", "private async Task<(Form Form, CoreWebView2 CoreWebView2)> CreateRnsiWindowAsync(", protectedSettings);

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
