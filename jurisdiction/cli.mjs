/**
 * Sync-time bridge: resolve a property's ecological context and print it as JSON.
 *
 *   node jurisdiction/cli.mjs <lat> <lng>
 *
 * Called by scripts/sync_registry.py with the PRIVATE precise coordinates that
 * already live in data/private/coords.json, server-side, once per garden. The
 * coordinates are passed as arguments and never persisted; resolveEcologicalContext
 * returns classifications only, so nothing this prints contains a coordinate.
 *
 * This is the single JS entry point for the Python sync — there is no second,
 * Python copy of the schema or the adapters (NATIONAL-ARCHITECTURE.md, section 5).
 */

import { resolveEcologicalContext } from './index.js';

const [lat, lng] = process.argv.slice(2).map(Number);
if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
  process.stderr.write('usage: node jurisdiction/cli.mjs <lat> <lng>\n');
  process.exit(1);
}

try {
  // Enrolment posture: strict containment. A point the state layer does not
  // contain is nodata, and the national pre-clearing layer supplies the answer —
  // no nearest/majority guess baked into the ledger.
  const ctx = await resolveEcologicalContext(
    { lat, lng }, { fetchImpl: (u) => fetch(u), strictContainment: true });
  process.stdout.write(JSON.stringify(ctx));
} catch (err) {
  process.stderr.write(`resolve failed: ${err.message}\n`);
  process.exit(2);
}
