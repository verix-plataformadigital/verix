import fs from "node:fs";
import path from "node:path";

const SOURCE_DIRECTORY = "src/operational";
const MODULE_MARKER = /<!-- @verix:module:\d{4} -->/;

/**
 * Resolve a source file below src/operational and reject path traversal.
 * All file paths come from a checked-in manifest, but are validated regardless.
 */
function resolveSourceFile(sourceDirectory, relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    relativePath.includes("\\") ||
    relativePath.includes("\0") ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("Invalid operational source path.");
  }

  const resolvedPath = path.resolve(sourceDirectory, relativePath);
  const relative = path.relative(sourceDirectory, resolvedPath);

  if (
    relative.length === 0 ||
    relative === ".." ||
    relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Operational source path escapes its source directory.");
  }

  return resolvedPath;
}

function readJson(filePath, description) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error("Could not read " + description + ": " + error.message);
  }
}

/**
 * Assemble the operational HTML from ordered classic-script/style source blocks.
 * Concatenation order is semantic: scripts retain their original global scope,
 * and styles retain one cascade in the original order.
 */
export function readOperationalSource(root = process.cwd()) {
  const sourceDirectory = path.resolve(root, SOURCE_DIRECTORY);
  const manifest = readJson(
    path.join(sourceDirectory, "blocks.json"),
    "operational source manifest",
  );

  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.blocks)) {
    throw new Error("Unsupported operational source manifest.");
  }

  const templatePath = resolveSourceFile(sourceDirectory, "template.html");
  let html = fs.readFileSync(templatePath, "utf8");
  const usedMarkers = new Set();
  const usedFiles = new Set();

  for (const block of manifest.blocks) {
    if (
      typeof block.marker !== "string" ||
      block.marker.length === 0 ||
      usedMarkers.has(block.marker)
    ) {
      throw new Error("Duplicate or missing operational module marker.");
    }
    usedMarkers.add(block.marker);

    const sourcePaths = Array.isArray(block.parts) && block.parts.length > 0
      ? block.parts
      : [block.file];

    if (
      sourcePaths.some(
        (sourcePath) => typeof sourcePath !== "string" || sourcePath.length === 0,
      )
    ) {
      throw new Error("Missing operational module path.");
    }

    const resolvedPaths = sourcePaths.map((sourcePath) => {
      const normalizedPath = sourcePath.replace(/\\/g, "/");

      if (usedFiles.has(normalizedPath)) {
        throw new Error("Duplicate operational source file: " + normalizedPath);
      }
      usedFiles.add(normalizedPath);
      return resolveSourceFile(sourceDirectory, normalizedPath);
    });

    const occurrences = html.split(block.marker).length - 1;
    if (occurrences !== 1) {
      throw new Error("Expected exactly one occurrence of module marker: " + block.marker);
    }

    const content = resolvedPaths
      .map((filePath) => fs.readFileSync(filePath, "utf8"))
      .join("");

    html = html.replace(block.marker, block.openTag + content + block.closeTag);
  }

  const partials = Array.isArray(manifest.partials) ? manifest.partials : [];
  const usedPartialTokens = new Set();

  for (const partial of partials) {
    if (
      typeof partial.token !== "string" ||
      partial.token.length === 0 ||
      typeof partial.file !== "string" ||
      partial.file.length === 0 ||
      usedPartialTokens.has(partial.token)
    ) {
      throw new Error("Invalid or duplicate operational HTML partial.");
    }

    if (usedFiles.has(partial.file)) {
      throw new Error("HTML partial is already registered as a source module: " + partial.file);
    }

    usedPartialTokens.add(partial.token);
    usedFiles.add(partial.file);

    const marker = JSON.stringify(partial.token);
    const occurrences = html.split(marker).length - 1;
    if (occurrences !== 1) {
      throw new Error("Expected exactly one HTML partial marker: " + partial.token);
    }

    const partialPath = resolveSourceFile(sourceDirectory, partial.file);
    const content = fs.readFileSync(partialPath, "utf8");

    if (partial.encoding !== "json-string") {
      throw new Error("Unsupported HTML partial encoding: " + String(partial.encoding));
    }

    // Serializing the partial restores the original JavaScript string literal.
    html = html.replace(marker, JSON.stringify(content));
  }

  if (MODULE_MARKER.test(html)) {
    throw new Error("Unresolved operational module marker.");
  }

  for (const partial of partials) {
    if (html.includes(JSON.stringify(partial.token))) {
      throw new Error("Unresolved operational HTML partial marker: " + partial.token);
    }
  }

  return html;
}

export function readOperationalManifest(root = process.cwd()) {
  const sourceDirectory = path.resolve(root, SOURCE_DIRECTORY);
  return readJson(
    path.join(sourceDirectory, "blocks.json"),
    "operational source manifest",
  );
}
