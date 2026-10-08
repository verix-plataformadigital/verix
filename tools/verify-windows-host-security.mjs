import fs from "node:fs";

const file = fs.readFileSync("windows/VerixPortable/Program.cs", "utf8");

const required = [
  "NavigationStarting",
  "FrameNavigationStarting",
  "NewWindowRequested",
  "IsUserInitiated",
  "consultapsp.imtt.external.rnsi.local",
  "X-Content-Type",
  "AreDevToolsEnabled = false",
  "AreHostObjectsAllowed = false",
  "IsWebMessageEnabled = false"
];

for (const marker of required) {
  if (!file.includes(marker)) {
    throw new Error("Missing required Windows host security marker: " + marker);
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

const internalHostCount = (file.match(/consultapsp\.imtt\.external\.rnsi\.local/g) || []).length;
if (internalHostCount < 2) {
  throw new Error("RNSI host allowlist is not explicit enough.");
}

console.log("✓ Windows WebView2 host security policy passed.");
