#!/usr/bin/env node
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

// Load both engine files into a shared VM context so scoreEcologicalRegistry
// is in scope when reg-opportunities.js runs its IIFE.
var fakeModule = { exports: {} };
var ctx = vm.createContext({
  console: console,
  module:  fakeModule,
  exports: fakeModule.exports,
  self:    undefined
});

vm.runInContext(fs.readFileSync(path.join(__dirname, 'js/reg-score.js'),        'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'js/reg-opportunities.js'), 'utf8'), ctx);

var buildOpportunities = fakeModule.exports.buildOpportunities;
if (!buildOpportunities) throw new Error('buildOpportunities not exported');

// Four gardens: strong, mid-high, mid-low, weak
var gardens = [
  'arundel.json',
  'sirgarnet.json',
  'evelina.json',
  'canterburyg02.json'
].map(function (f) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));
});

var HR = '='.repeat(72);
var hr = '-'.repeat(72);

gardens.forEach(function (garden) {
  var result = buildOpportunities(garden);
  var s      = result.summary;
  var bp     = result.byPillar;

  console.log('\n' + HR);
  console.log('GARDEN : ' + garden.garden_name + '  (' + garden.garden_id + ')');
  console.log('SCORE  : ' + s.score + '/100   TIER: ' + s.tier);
  if (s.nextTier) {
    console.log('NEXT   : ' + s.nextTier.name + '  (gap: ' + s.nextTier.gap + ' pts)');
  } else {
    console.log('NEXT   : (at max tier)');
  }
  console.log('AVAIL  : ' + s.totalPointsAvailable + ' pts across all opportunities');

  console.log('\n' + hr);
  console.log('PILLAR SCORES (actual / max, headroom):');
  ['biodiversity','soil_water','habitat','connectivity','evidence'].forEach(function (p) {
    var pp   = bp[p];
    var bar  = '[' + Array(Math.round(pp.score / pp.max * 20) + 1).join('#') +
               Array(20 - Math.round(pp.score / pp.max * 20) + 1).join('.') + ']';
    console.log('  ' + pp.label.padEnd(26) + bar +
                '  ' + String(pp.score).padStart(2) + '/' + pp.max +
                '  headroom ' + pp.headroom);
  });

  console.log('\n' + hr);
  console.log('TOP 5 OPPORTUNITIES (ranked by priority):');
  result.opportunities.slice(0, 5).forEach(function (o, i) {
    console.log('  ' + (i + 1) + '. [' + o.pillar + '] ' + o.action);
    console.log('     +' + o.points + ' pts  effort:' + o.effort +
                '  cost:' + o.cost + '  delivery:' + o.delivery +
                '  priority:' + o.priority);
  });

  console.log('\n' + hr);
  console.log('FASTEST PATH TO NEXT TIER (greedy ROI, target: ' +
              (s.nextTier ? s.nextTier.name + ' @ ' + s.nextTier.target : 'n/a') + '):');
  if (result.path.length) {
    var acc = 0;
    result.path.forEach(function (o, i) {
      acc += o.points;
      console.log('  ' + (i + 1) + '. ' + o.action +
                  '  +' + o.points + ' pts  (running total: ' + acc + ')');
    });
  } else {
    console.log('  (no path needed — already at max tier)');
  }
});

console.log('\n' + HR);
console.log('done.');
