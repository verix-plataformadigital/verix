import fs from "node:fs";
import path from "node:path";

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
const files = fs.readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const errors = [];
const byVersion = new Map();

// Historical exceptions already present in main. Do not delete or rename these
// automatically: the production migration ledger has known drift and timestamp
// changes can make Supabase attempt to replay old SQL.
const approvedLegacyDuplicateGroups = new Map([
  ["20261002", new Set([
    "20261002_fix_admin_client_coverage_metric.sql",
    "20261002_verix2_daily_cleanup_schedule.sql",
    "20261002_verix2_hardening_rls_retention.sql",
  ])],
  ["20261019093000", new Set([
    "20261019093000_admin_summary_live_presence.sql",
    "20261019093000_admin_summary_live_presence_metrics.sql",
  ])],
]);

const approvedShortVersions = new Set(["20261002", "20261007", "20261008"]);

for (const file of files) {
  const match = file.match(/^(\d{8}|\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$/);
  if (!match) {
    errors.push(`Invalid migration filename format: ${file}`);
    continue;
  }

  const [, version] = match;
  if (version.length === 8 && !approvedShortVersions.has(version)) {
    errors.push(`New short migration version is not approved: ${file}`);
  }
  if (!byVersion.has(version)) byVersion.set(version, []);
  byVersion.get(version).push(file);
}

for (const [version, group] of byVersion) {
  if (group.length < 2) continue;
  const expected = approvedLegacyDuplicateGroups.get(version);
  const actualSet = new Set(group);
  const exactApprovedGroup = expected
    && expected.size === actualSet.size
    && [...expected].every((file) => actualSet.has(file));

  if (!exactApprovedGroup) {
    errors.push(
      `Duplicate migration version ${version}: ${group.join(", ")}. `
      + "Create a unique timestamp; do not rename already-applied migrations without reconciliation.",
    );
  }
}

for (const [version, expected] of approvedLegacyDuplicateGroups) {
  const actual = byVersion.get(version) ?? [];
  const actualSet = new Set(actual);
  const stillExact = expected.size === actualSet.size
    && [...expected].every((file) => actualSet.has(file));
  if (!stillExact) {
    console.log(`Historical duplicate group ${version} has changed; review the allowlist.`);
  }
}

if (errors.length) {
  console.error("Migration filename integrity: FAILED");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Migration filename integrity: OK (${files.length} files; known historical collisions explicitly allowlisted).`);
}
