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
let tick=0, time=Date.UTC(2026,8,24), calls=0, rows=[], fail=false, pending;
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
  fetch:async (_,opts)=>{calls++;assert.equal(opts.cache,'no-store');if(pending)await pending;
    if(fail)throw new Error('offline');return {ok:true,json:async()=>({values:[['header'],...rows]})};}
});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  rows=[['9/23/2026 12:00:00','City of Whitehorse','-37.7','145.2','55','Plains Grassy Woodland','']];
  vm.runInContext(script,context);await settle();
  assert.equal(node('[data-t="total"]').textContent,'1');
  const stamp=node('m-refreshed').textContent;
  assert.ok([...timers.values()].some(t=>t.ms===60000));
  time+=60000;vm.runInContext('render()',context);
  assert.equal(node('m-refreshed').textContent,stamp,'filter renders must not advance freshness');
  rows.push(['9/24/2026 12:00:00','referral findmyevc','','','175','Grassy Woodland','']);
  await [...timers.values()].find(t=>t.ms===60000).fn();
  assert.equal(node('[data-t="total"]').textContent,'2','next poll picks up new data');
  assert.equal(node('[data-c="lr"]').textContent,'1');
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
  console.log('PASS: updated counts, scheduled polling, freshness, failure recovery, visibility, reconnect and overlap prevention');
})().catch(err=>{console.error(err);process.exitCode=1;});
