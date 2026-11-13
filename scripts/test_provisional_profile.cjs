const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/reg-provisional.js', 'utf8');
const ctx = vm.createContext({});
vm.runInContext(source, ctx);
const row = Array(41).fill('');
row[1] = 'SUB-fixture'; row[17] = '0'; row[18] = 'Starting';
row[19] = row[20] = 'TRUE'; row[30] = '<Garden>'; row[31] = 'Suburb';
row[3] = 'private@example.test'; row[4] = '12 Private Street';
const read = r => ctx.provisionalRecord([[], r], 'SUB-fixture');
assert.equal(read(row).score, 0);
assert.equal(read(row).name, '<Garden>');
assert.ok(!JSON.stringify(read(row)).includes('private@example.test'));
assert.ok(!JSON.stringify(read(row)).includes('Private Street'));
for (const status of ['hidden', 'deleted', 'rejected']) {
  const r = [...row]; r[23] = status; assert.equal(read(r), null);
}
for (const col of [19, 20]) {
  const r = [...row]; r[col] = 'FALSE'; assert.equal(read(r), null);
}
for (const value of ['', '101', '-1', 'bad']) {
  const r = [...row]; r[17] = value; assert.equal(read(r).score, null);
}
const verified = [...row]; verified[23] = 'verified';
assert.equal(read(verified).status, 'verified');
assert.equal(ctx.provisionalRecord([[], row], 'missing'), null);
assert.equal(ctx.parseCSV('id,name\r\n1,"A, ""garden"""\r\n')[1][1], 'A, "garden"');

// Exercise asynchronous rendering with a small DOM and mocked public responses.
const elements = Object.fromEntries(['record','published','retry','title','message','published-link','suburb','score','tier','review-status','submitted','reference'].map(id => [id, {hidden:false, textContent:''}]));
ctx.document = {getElementById:id => elements[id]};
ctx.window = {location:{search:'?id=SUB-fixture'}};
ctx.URLSearchParams = URLSearchParams;
let replies;
ctx.fetch = async () => replies.shift();
const csv = r => 'header\n' + r.map(x => '"' + x.replaceAll('"','""') + '"').join(',');
(async () => {
  replies = [{ok:true, text:async()=>csv(row)}];
  await ctx.loadProvisionalProfile();
  assert.equal(elements.record.hidden, false);
  assert.equal(elements.title.textContent, '<Garden>');
  assert.equal(elements.score.textContent, 0);
  replies = [{ok:false}];
  await ctx.loadProvisionalProfile();
  assert.equal(elements.record.hidden, true);
  assert.equal(elements.retry.hidden, false);
  replies = [{ok:true, text:async()=>'header\n'}];
  await ctx.loadProvisionalProfile();
  assert.match(elements.message.textContent, /48 hours/);
  const published = [...row]; published[25] = 'ER-fixture';
  replies = [{ok:true, text:async()=>csv(published)}, {ok:true, json:async()=>({gardens:[{garden_id:'ER-fixture',profile_url:'/gardens/g-fixture/index.html'}]})}];
  await ctx.loadProvisionalProfile();
  assert.equal(elements.published.hidden, false);
  assert.equal(elements['published-link'].href, '/gardens/g-fixture/index.html');
  assert.equal(elements.record.hidden, true);
  const html = fs.readFileSync('enrol/index.html','utf8');
  assert.doesNotMatch(html, /liveScore|liveTier|revealScore|buildMeter|updateScore/);
  assert.match(html, /provisional_score_total:\s+s/);
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  console.log('PASS provisional privacy, consent, zero score, CSV parsing, rendering, unavailable records, failures, registered links and enrolment syntax');
})().catch(e=>{console.error(e);process.exitCode=1;});
