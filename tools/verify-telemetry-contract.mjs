import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contractPath = path.join(root, "src/services/telemetry/telemetry-contract.ts");
const endpointPath = path.join(root, "supabase/functions/telemetry-v2/index.ts");

function extractEventList(source, marker, terminator, description) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error("Missing " + description + " marker: " + marker);
  }

  // The backend marker already includes the opening bracket; the client
  // marker does not. Searching from markerIndex handles both layouts.
  const open = source.indexOf("[", markerIndex);
  const close = source.indexOf(terminator, open + 1);
  if (open < 0 || close < 0) {
    throw new Error("Could not parse " + description + " list");
  }

  const values = [...source.slice(open + 1, close).matchAll(/["']([a-z][a-z0-9_]*)["']/g)]
    .map((match) => match[1]);

  if (!values.length) {
    throw new Error("No event names found in " + description + " list");
  }

  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length) {
    throw new Error("Duplicate event names in " + description + ": " + [...new Set(duplicates)].join(", "));
  }

  return values;
}

const contractSource = fs.readFileSync(contractPath, "utf8");
const endpointSource = fs.readFileSync(endpointPath, "utf8");

const clientEvents = extractEventList(
  contractSource,
  "export const TELEMETRY_EVENTS",
  "] as const;",
  "client contract"
);
const acceptedEvents = extractEventList(
  endpointSource,
  "const allowedEvents = new Set([",
  "]);",
  "telemetry-v2 backend allowlist"
);

const accepted = new Set(acceptedEvents);
const rejectedByBackend = clientEvents.filter((event) => !accepted.has(event));

if (rejectedByBackend.length) {
  console.error("Telemetry contract mismatch: client events not accepted by telemetry-v2:");
  for (const event of rejectedByBackend) console.error("- " + event);
  process.exitCode = 1;
} else {
  console.log(
    "Telemetry event contract passed: all " + clientEvents.length +
    " client events are accepted by telemetry-v2 (" + acceptedEvents.length +
    " backend allowlist entries)."
  );
}
