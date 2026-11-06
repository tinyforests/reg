const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('enrol/index.html', 'utf8');
const pending = [];
const elements = Object.fromEntries(['geo-val-evc','geo-val-park','geo-val-garden','geo-results'].map(id=>[id,{style:{},textContent:''}]));
let source = html.slice(html.indexOf('let ecologicalContext'), html.indexOf('/* Fallback:'));
source = source.replace("await import('/jurisdiction/enrolment.js')", 'await moduleStub');
const context = vm.createContext({document:{getElementById:id=>elements[id]},
  moduleStub:{resolveEnrolmentVegetation:()=>new Promise(resolve=>pending.push(resolve))},
  resolveNearestPark:()=>{}, console});
vm.runInContext(`let gardenLat='',gardenLng='',gardenSuburb='',gardenRegion='NSW',gardenCountry='',evcCode='',evcName='',parkName='',parkLat='',parkLng='',parkDistM=null,tickedSpecies=[]; const speciesList=[]; ${source}
resolveNearestGarden = () => {};`, context);
const record = (system,name)=>({original_vegetation:{system,name,code:'123',status:'ok',source:'Fixture',resolution:'state'}});
(async()=>{
  const first=vm.runInContext('_resolveFromCoords(-33,151)',context);
  await Promise.resolve();
  vm.runInContext('resetLocation(); gardenRegion="QLD"',context);
  const second=vm.runInContext('_resolveFromCoords(-27,153)',context);
  await Promise.resolve();
  pending[1](record('Regional Ecosystem','New address')); await second;
  pending[0](record('PCT','Old address')); await first;
  assert.match(elements['geo-val-evc'].textContent,/New address/);
  assert.equal(vm.runInContext('evcCode',context),'');
  assert.equal(vm.runInContext('ecologicalContext.original_vegetation.name',context),'New address');
  vm.runInContext('resetLocation()',context);
  assert.equal(vm.runInContext('ecologicalContext',context),null);
  const backend=fs.readFileSync('scripts/appsscript/Code.gs','utf8');
  const sanitiser=backend.slice(backend.indexOf('function enrolmentContextJson_'));
  const ctx=vm.createContext({safeStr:(s,n)=>s.slice(0,n)});
  vm.runInContext(sanitiser,ctx);
  const clean=JSON.parse(ctx.enrolmentContextJson_({original_vegetation:{...record('PCT','Fixture').original_vegetation,lat:-33,provenance:{lat:-33,source:'x',jurisdiction:'NSW'}},lat:-33}));
  assert.equal(clean.original_vegetation.system,'PCT');
  assert.ok(!JSON.stringify(clean).includes('lat'));
  console.log('PASS signup stale-response rejection, interstate EVC isolation, address reset and submission privacy');
})().catch(e=>{console.error(e);process.exitCode=1;});
