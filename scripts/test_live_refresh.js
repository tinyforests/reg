// Exercise the actual dashboard script with controlled responses and a clock.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../live.html'), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
const nodes = new Map();
function element() {
  return {textContent:'',innerHTML:'',checked:true,style:{},content:{cloneNode:element},
    appendChild(){},addEventListener(){},querySelector:element};
}
const node = id => {if(!nodes.has(id)) nodes.set(id,element());return nodes.get(id);};
const events = {}, timers = new Map();
let tick=0, time=Date.UTC(2026,8,24), calls=0, rows=[], fail=false, pending,boundaryFail=false;
class Clock extends Date {constructor(...args){super(...(args.length?args:[time]));}}
const layer = {addTo(){return this;},bindPopup(){return this;}};
const context = vm.createContext({
  CONFIG:{API_KEY:'test',SHEET_ID:'test',RANGE:'A:G'}, Date:Clock, AbortController,
  document:{hidden:false,getElementById:node,querySelector:node,createElement:element,
    addEventListener:(event,fn)=>events[event]=fn},
  window:{addEventListener:(event,fn)=>events[event]=fn},
  setTimeout:(fn,ms)=>{timers.set(++tick,{fn,ms});return tick;},clearTimeout:id=>timers.delete(id),
  requestAnimationFrame:fn=>fn(),
  L:{map:()=>({setView(){return this;},removeLayer(){}}),tileLayer:()=>layer,layerGroup:()=>layer,circleMarker:()=>layer},
  fetch:async (url,opts)=>{if(url.includes('.geojson')){if(boundaryFail)throw new Error('boundary offline');return {ok:true,json:async()=>({type:'FeatureCollection',features:[{properties:{name:'Fixture council'},geometry:{type:'Polygon',coordinates:[[[144,-39],[146,-39],[146,-36],[144,-36],[144,-39]]]}}]})};}calls++;assert.equal(opts.cache,'no-store');if(pending)await pending;
    if(fail)throw new Error('offline');return {ok:true,json:async()=>({values:[['header'],...rows]})};}
});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  rows=[['9/23/2026 12:00:00','City of Whitehorse','-37.7','145.2','55','Plains Grassy Woodland','']];
  vm.runInContext(script,context);await settle();
  assert.equal(node('[data-t="total"]').textContent,'1');
  assert.equal(node('[data-t="lgas"]').textContent,'1','coordinates identify a council even without an address label');
  assert.match(node('[data-t="lgasub"]').textContent,/1 assigned/);
  const stamp=node('m-refreshed').textContent;
  assert.ok([...timers.values()].some(t=>t.ms===60000));
  time+=60000;vm.runInContext('render()',context);
  assert.equal(node('m-refreshed').textContent,stamp,'filter renders must not advance freshness');
  rows.push(['9/24/2026 12:00:00','referral findmyevc','','','175','Grassy Woodland','']);
  await [...timers.values()].find(t=>t.ms===60000).fn();
  assert.equal(node('[data-t="total"]').textContent,'2','next poll picks up new data');
  assert.equal(node('[data-c="lr"]').textContent,'1');
  assert.match(node('[data-c="foot"]').textContent,/2 timestamped source rows/);
  assert.match(node('[data-t="lgasub"]').textContent,/1 assigned · 1 unassigned/);
  assert.ok(node('[data-c="mapnote"]').textContent.startsWith('1 located'));
  assert.equal(node('refresh-now').disabled,false);
  assert.notEqual(node('m-refreshed').textContent,stamp);
  const fresh=node('m-refreshed').textContent;
  fail=true;await vm.runInContext('load()',context);
  assert.match(node('m-status').textContent,/failed/);
  assert.equal(node('[data-t="total"]').textContent,'2');
  assert.equal(node('m-refreshed').textContent,fresh);
  fail=false;await events.online();assert.match(node('m-status').textContent,/Live/);
  context.document.hidden=true;const before=calls;await vm.runInContext('load()',context);assert.equal(calls,before);
  context.document.hidden=false;events.visibilitychange();await settle();assert.equal(calls,before+1);
  let release;pending=new Promise(r=>release=r);const first=vm.runInContext('load()',context);
  const inFlight=calls;await vm.runInContext('load()',context);assert.equal(calls,inFlight,'no overlapping requests');
  release();await first;pending=null;
  vm.runInContext('lastSuccess=null',context);fail=true;await vm.runInContext('load()',context);
  assert.equal(node('load-error').textContent,'offline');
  fail=false;await vm.runInContext('load()',context);assert.match(node('m-status').textContent,/Live/);
  assert.equal(vm.runInContext("parseDate('2/30/2026 12:00:00')",context),null);
  assert.equal(vm.runInContext("parseDate('2026-10-12T04:33:48Z').toISOString()",context),'2026-10-12T04:33:48.000Z');
  assert.equal(vm.runInContext("parseDate('10/12/2026 15:33:48').toISOString()",context),'2026-10-12T04:33:48.000Z');
  assert.equal(vm.runInContext("monthKey(parseDate('1/1/2026 00:15:00'))",context),'2026-01');
  assert.equal(vm.runInContext('inRing(0.5,0.5,[[0,0],[1,0],[1,1],[0,1],[0,0]])',context),true);
  assert.equal(vm.runInContext('inRing(2,2,[[0,0],[1,0],[1,1],[0,1],[0,0]])',context),false);
  vm.runInContext("COUNCIL_CACHE.clear();COUNCILS=prepareCouncils({type:'FeatureCollection',features:[{properties:{name:'With hole'},geometry:{type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[3,1],[3,3],[1,3],[1,1]]]}}]})",context);
  assert.equal(vm.runInContext('locatedCouncil(0.5,0.5)',context),'With hole');
  assert.equal(vm.runInContext('locatedCouncil(2,2)',context),null,'polygon holes remain unassigned');
  assert.equal(vm.runInContext('locatedCouncil(9,9)',context),null,'outside coverage remains unassigned');
  vm.runInContext('COUNCILS=null;COUNCIL_CACHE.clear()',context);boundaryFail=true;await vm.runInContext('load()',context);
  assert.match(node('m-status').textContent,/Live/);
  assert.match(node('[data-c="foot"]').textContent,/Council boundaries unavailable/);
  boundaryFail=false;await vm.runInContext('load()',context);
  assert.ok(!node('[data-c="foot"]').textContent.includes('Council boundaries unavailable'));
  assert.equal(vm.runInContext("escapeHTML('<img onerror=alert(1)>')",context),'&lt;img onerror=alert(1)&gt;');
  console.log('PASS: updated counts, scheduled polling, freshness, failure recovery, visibility, reconnect and overlap prevention');
})().catch(err=>{console.error(err);process.exitCode=1;});
