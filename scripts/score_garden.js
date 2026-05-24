/**
 * score_garden.js
 * Node bridge for the parity test harness.
 * Loads js/reg-score.js, scores a single garden JSON, prints result to stdout.
 *
 * Usage: node score_garden.js <garden.json>
 */

/* global scoreEcologicalRegistry */

var fs   = require('fs');
var path = require('path');

// Load canonical scoring engine into this context
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'reg-score.js'), 'utf8')); // eslint-disable-line no-eval

var jsonPath = process.argv[2];
if (!jsonPath) {
  process.stderr.write('Usage: node score_garden.js <garden.json>\n');
  process.exit(1);
}

var record = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
var result = scoreEcologicalRegistry(record);

var out = {
  total:        result.total,
  biodiversity: result.scores.biodiversity.score,
  soil_water:   result.scores.soil_water.score,
  habitat:      result.scores.habitat.score,
  connectivity: result.scores.connectivity.score,
  evidence:     result.scores.evidence.score
};

process.stdout.write(JSON.stringify(out) + '\n');
