// Regression checks (22 Nov 2026 health pass):
//  1. awardBadges() never awards badges to Provisional / Design Proposal records,
//     matching NO_BADGE_STATUSES in sync_registry.py.
//  2. renderOpportunities() shows no cost on public surfaces (steward, enrolment);
//     only the designer surface carries cost bands.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const ctx = { console };
ctx.self = ctx;
vm.createContext(ctx);
for (const f of ['js/reg-score.js', 'js/badge-engine.js', 'js/reg-opportunities.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}

const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/registry.json'), 'utf8'));
const withBadges = registry.gardens.find(g => (g.badges || []).length >= 3 && !g.demo);
const record = JSON.parse(fs.readFileSync(path.join(ROOT, withBadges.data_file), 'utf8'));

// 1. Badge gate
const open = ctx.awardBadges(record);
assert.ok(open.all_badges.length >= 3, 'fixture garden should earn badges when not gated');
for (const status of ['Provisional', 'Design Proposal']) {
  const gated = ctx.awardBadges(Object.assign({}, record, { status }));
  for (const key of ['all_badges', 'score_badges', 'verification_badges', 'evidence_badges', 'all', 'vb']) {
    assert.deepStrictEqual(Array.from(gated[key]), [], status + ' must award no ' + key);
  }
}
const active = ctx.awardBadges(Object.assign({}, record, { status: 'Active / Establishing' }));
assert.deepStrictEqual(Array.from(active.all_badges), Array.from(open.all_badges), 'active status must not change badges');

// 2. No cost on public surfaces
let checked = 0;
for (const g of registry.gardens) {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, g.data_file), 'utf8'));
  const result = ctx.buildOpportunities(r);
  if (!result.opportunities.length) continue;
  for (const mode of ['steward', 'enrolment']) {
    const html = ctx.renderOpportunities(result, mode);
    assert.ok(!/\$/.test(html), g.garden_id + ': ' + mode + ' surface must not show cost');
  }
  checked++;
}
assert.ok(checked > 0, 'expected at least one garden with opportunities');
const anyDesigner = registry.gardens.map(g => JSON.parse(fs.readFileSync(path.join(ROOT, g.data_file), 'utf8')))
  .map(r => ctx.renderOpportunities(ctx.buildOpportunities(r), 'designer')).some(h => /\$/.test(h));
assert.ok(anyDesigner, 'designer surface should still carry cost bands');

console.log('PASS badge status gate (Provisional, Design Proposal) and no cost on public opportunity surfaces (' + checked + ' gardens)');
