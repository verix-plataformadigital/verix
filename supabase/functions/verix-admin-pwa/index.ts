/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const UPSTREAM_ROOT = "https://verix-plataformadigital.github.io/verix/admin-proxy/";
const FUNCTION_PREFIX = "/functions/v1/verix-admin-pwa/";
const MANIFEST_HREF = "./manifest.webmanifest?v=verix-admin-origin-1";

const FILES = new Map<string, { type: string }>([
  ["index.html", { type: "text/html; charset=utf-8" }],
  ["manifest.webmanifest", { type: "application/manifest+json; charset=utf-8" }],
  ["sw.js", { type: "text/javascript; charset=utf-8" }],
  ["verix-presence-v1.js", { type: "text/javascript; charset=utf-8" }],
  ["AI-ACCESS-POLICY.md", { type: "text/plain; charset=utf-8" }],
  ["assets/admin-icon.svg", { type: "image/svg+xml" }],
  ["assets/admin-icon-192.png", { type: "image/png" }],
  ["assets/admin-icon-512.png", { type: "image/png" }],
  ["assets/icon-32.png", { type: "image/png" }],
  ["assets/icon-192.png", { type: "image/png" }],
  ["assets/icon-512.png", { type: "image/png" }],
  ["assets/verix-emblem.svg", { type: "image/svg+xml" }]
]);

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...RESPONSE_HEADERS,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function rewriteHtml(input: string): string {
  let html = input
    .replace(/<link\b[^>]*\brel=["']manifest["'][^>]*>\s*/gi, "")
    .replaceAll("../assets/", "./assets/")
    .replaceAll("../verix-presence-v1.js", "./verix-presence-v1.js")
    .replaceAll("../AI-ACCESS-POLICY.md", "./AI-ACCESS-POLICY.md");
  if (!/<\/head>/i.test(html)) throw new Error("Admin HTML is missing its closing head element");
  html = html.replace(
    /<\/head>/i,
    '  <link rel="manifest" href="' + MANIFEST_HREF + '">\n</head>'
  );
  return html;
}

function rewriteManifest(input: string): string {
  const manifest = JSON.parse(input);
  manifest.id = "/functions/v1/verix-admin-pwa/";
  manifest.start_url = "./index.html?app=verix-admin-edge-v1";
  manifest.scope = "./";
  manifest.icons = (Array.isArray(manifest.icons) ? manifest.icons : []).map((icon: Record<string, unknown>) => ({
    ...icon,
    src: String(icon.src || "").replace(/^(?:\.\.\/|\.\/)?assets\//, "./assets/")
  }));
  return JSON.stringify(manifest);
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { ...RESPONSE_HEADERS, "Allow": "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" }
    });
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  // Supabase's gateway can expose either the full external path or only the
  // path after the function name. Accept both forms and the root URL.
  const routePrefixes = [
    FUNCTION_PREFIX.slice(0, -1),
    "/verix-admin-pwa"
  ];
  let routedPath = pathname;
  let matchedPrefix = false;

  for (const prefix of routePrefixes) {
    if (pathname === prefix) {
      routedPath = "";
      matchedPrefix = true;
      break;
    }
    if (pathname.startsWith(prefix + "/")) {
      routedPath = pathname.slice(prefix.length);
      matchedPrefix = true;
      break;
    }
  }

  if (!matchedPrefix && pathname.startsWith("/functions/v1/")) {
    return jsonError("Not found", 404);
  }

  let relativePath = routedPath.replace(/^\/+/, "");
  if (!relativePath) relativePath = "index.html";
  try { relativePath = decodeURIComponent(relativePath); }
  catch { return jsonError("Invalid path", 400); }

  if (relativePath.includes("..") || relativePath.includes("\\") || relativePath.includes("%")) {
    return jsonError("Invalid path", 400);
  }

  const asset = FILES.get(relativePath);
  if (!asset) return jsonError("Not found", 404);

  try {
    const upstream = await fetch(UPSTREAM_ROOT + relativePath, {
      method: "GET",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" }
    });
    if (!upstream.ok) {
      return jsonError("Admin asset temporarily unavailable", 502);
    }

    let body: BodyInit;
    if (relativePath === "index.html") {
      body = rewriteHtml(await upstream.text());
    } else if (relativePath === "manifest.webmanifest") {
      body = rewriteManifest(await upstream.text());
    } else if (asset.type.startsWith("text/") || asset.type.includes("javascript") || asset.type.includes("manifest+json")) {
      body = await upstream.text();
    } else {
      body = await upstream.arrayBuffer();
    }

    return new Response(request.method === "HEAD" ? null : body, {
      status: 200,
      headers: { ...RESPONSE_HEADERS, "Content-Type": asset.type }
    });
  } catch (_) {
    return jsonError("Admin asset could not be loaded", 502);
  }
});
