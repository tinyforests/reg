#!/usr/bin/env node
/**
 * run_shadow.js — runs the v2 shadow engine over fixtures or a live data dir.
 * Publishes nothing. Writes a comparison report to stdout (and --json for a file).
 *
 *   node v2/run_shadow.js                       # fixtures
 *   node v2/run_shadow.js --data data/gardens   # live records (needs site_envelope)
 *   node v2/run_shadow.js --json out.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { scoreV2 } = require('./reg-score-v2.js');

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

const localeAU = JSON.parse(fs.readFileSync(path.join(__dirname, 'locales/AU-VIC.json')));
// SG pack not written yet — Phase 4. Fall back to AU-VIC with an explicit flag.
const localeFor = (id) => {
  if (id.startsWith('ER-SG')) {
    return { ...localeAU, locale: 'SG', locale_version: 'AU-VIC-BORROWED — INVALID FOR SG' };
  }
  return localeAU;
};

let records;
const dataDir = arg('--data');
if (dataDir) {
  records = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dataDir, f))))
    .filter(r => r.site_envelope && r.observation);
  if (!records.length) {
    console.error('No records with a site_envelope block. Phase 1 backfill incomplete.');
    process.exit(1);
  }
} else {
  records = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/examples.json')));
}

const out = records.map(r => {
  const s = scoreV2(r, localeFor(r.registry_id));
  s.label = r.label || r.name || r.registry_id;
  s.score_v1 = r.score ?? null;
  return s;
});

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

console.log('\nMETHOD v2 SHADOW RUN — NOT PUBLISHED');
console.log(`method ${localeAU.method_version} · locale ${localeAU.locale_version}`);
console.log('All values below are hypotheses. See v2/HYPOTHESES.md.\n');
console.log(pad('site', 34) + pad('class', 22) + padL('v1', 5) + padL('EP', 5) + padL('EC', 8) + padL('pot', 8) + padL('LO', 8));
console.log('-'.repeat(90));
for (const s of out) {
  console.log(
    pad(s.label.slice(0, 33), 34) +
    pad(s.envelope_class, 22) +
    padL(s.score_v1 ?? '—', 5) +
    padL(s.ecological_performance, 5) +
    padL(s.ecological_contribution, 8) +
    padL(s.ecological_potential, 8) +
    padL(s.latent_opportunity, 8)
  );
}
console.log('-'.repeat(90));

for (const s of out) {
  const n = [...s.detail.performance.notes];
  if (n.length) console.log(`\n${s.label}:\n  - ` + n.join('\n  - '));
}

const jsonOut = arg('--json');
if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(out, null, 2));
  console.log(`\nwrote ${jsonOut}`);
}
console.log('');
