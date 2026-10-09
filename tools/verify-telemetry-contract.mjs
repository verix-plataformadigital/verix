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

const ingestMigrationPath = path.join(
  root,
  "supabase/migrations/20261008235800_atomic_telemetry_ingest.sql"
);
const ingestMigrationSource = fs.readFileSync(ingestMigrationPath, "utf8");

const ingestionRpcMatch = endpointSource.match(
  /db\.rpc\(\s*["']verix2_ingest_telemetry["']\s*,\s*\{/
);
const ingestionRpc = ingestionRpcMatch?.index ?? -1;
const eventsArgument = endpointSource.indexOf("p_events: events", ingestionRpc);
const installationsArgument = endpointSource.indexOf("p_installations: [...installations.values()]", ingestionRpc);
const sessionsArgument = endpointSource.indexOf("p_sessions: [...sessions.values()]", ingestionRpc);
const directTableWrites = [
  'db.from("verix2_events").upsert(events',
  'db.from("verix2_installations").upsert([...installations.values()]',
  'db.from("verix2_sessions").upsert([...sessions.values()]'
];
const directWriteRemains = directTableWrites.some((marker) => endpointSource.includes(marker));

const installationInsert = ingestMigrationSource.indexOf(
  "INSERT INTO public.verix2_installations AS current_installation"
);
const sessionInsert = ingestMigrationSource.indexOf(
  "INSERT INTO public.verix2_sessions AS current_session"
);
const eventInsert = ingestMigrationSource.indexOf(
  "INSERT INTO public.verix2_events ("
);
const executableGrant = ingestMigrationSource.includes(
  "GRANT EXECUTE ON FUNCTION public.verix2_ingest_telemetry(jsonb, jsonb, jsonb)\\n  TO service_role;"
);
const invokerOnly = ingestMigrationSource.includes("SECURITY INVOKER");
const conflictSafe = ingestMigrationSource.includes("ON CONFLICT DO NOTHING");

if (
  ingestionRpc < 0 ||
  eventsArgument < ingestionRpc ||
  installationsArgument < ingestionRpc ||
  sessionsArgument < ingestionRpc ||
  directWriteRemains
) {
  console.error(
    "Telemetry ingestion contract failed: the endpoint must use one verix2_ingest_telemetry RPC for all three arrays."
  );
  process.exitCode = 1;
}

if (
  installationInsert < 0 ||
  sessionInsert < installationInsert ||
  eventInsert < sessionInsert ||
  !executableGrant ||
  !invokerOnly ||
  !conflictSafe
) {
  console.error(
    "Telemetry ingestion migration failed: it must write FK parents before events in one invoker-rights RPC and grant execution to service_role only."
  );
  process.exitCode = 1;
} else {
  console.log(
    "Telemetry ingestion transaction passed: installations and sessions precede events inside one invoker-rights RPC."
  );
}
