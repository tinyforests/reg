import assert from 'node:assert/strict';
import {resolveEnrolmentVegetation} from '../enrolment.js';
const national = {results:[{attributes:{'Pixel Value':'9','MVS_NAME':'Fixture woodland'}}]};
async function check(state, payload, expected, fail = false) {
  const calls = [];
  const result = await resolveEnrolmentVegetation({lat:-30,lng:140,state}, async url => {
    calls.push(url);
    if (url.includes('NVIS_pre_mvs')) return {ok:true,json:async()=>national};
    if (fail) throw new Error('offline');
    return {ok:true,json:async()=>payload};
  });
  assert.equal(result.original_vegetation.system, expected);
  assert.ok(!JSON.stringify(result).includes('"lat"'));
  assert.ok(calls.every(u => !/extant|nv2005|TASVEG/.test(u)));
  return {result,calls};
}
await check('New South Wales',{results:[{attributes:{PCTID:123,PCTName:'Fixture community'}}]},'PCT');
await check('Queensland',{features:[{attributes:{re:'12.3.11'}}]},'Regional Ecosystem');
await check('Western Australia',{features:[{attributes:{veg_assoc:4,flor_desc:'Fixture association'}}]},'Beard association');
const polygon = {type:'Polygon',coordinates:[[[139,-31],[141,-31],[141,-29],[139,-29],[139,-31]]]};
await check('Victoria',{features:[{geometry:polygon,properties:{evc:55,x_evcname:'Fixture EVC'}}]},'EVC');
for (const state of ['South Australia','Tasmania','Northern Territory','Australian Capital Territory']) {
  const {calls} = await check(state,{},'NVIS MVS'); assert.equal(calls.length,1);
}
for (const state of ['VIC','NSW','QLD','WA']) {
  await check(state,{},'NVIS MVS');
  const {result} = await check(state,{},'NVIS MVS',true);
  assert.match(result.note,/temporarily unavailable/);
}
const gap = await resolveEnrolmentVegetation({lat:-30,lng:140,state:'SA'},async()=>({ok:true,json:async()=>({results:[{attributes:{'Pixel Value':'NoData'}}]})}));
assert.equal(gap.original_vegetation.status,'nodata');
await assert.rejects(()=>resolveEnrolmentVegetation({lat:-30,lng:140,state:'SA'},async()=>({ok:false})));
console.log('PASS national signup: eight jurisdictions, state gaps/outages, nodata, failure and privacy');
