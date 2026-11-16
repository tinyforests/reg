const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('enrol/index.html', 'utf8');
const elements = Object.fromEntries(['evc', 'park', 'garden'].map(row => ['geo-val-' + row, {
  style: {}, attrs: {}, loading: false,
  classList: {toggle(name, value) { elements['geo-val-' + row].loading = value; }},
  setAttribute(name, value) { this.attrs[name] = value; }
}]));
let fetchImpl, timeoutCallback, calls = 0;
const ctx = vm.createContext({
  document: {getElementById: id => elements[id]}, AbortController,
  fetch: (...args) => { calls++; return fetchImpl(...args); },
  setTimeout: (fn, ms) => { assert.equal(ms, 8000); timeoutCallback = fn; return 1; },
  clearTimeout() {},
});
vm.runInContext(`let parkRequest = null; let selectedAddress = ''; ${html.slice(html.indexOf('function _setGeoResult'), html.indexOf('let _gardenLocs'))}
${html.slice(html.indexOf('const _OVERPASS_MIRRORS'), html.indexOf('async function resolveNearestPark'))}`, ctx);
(async () => {
  for (const row of ['evc', 'park', 'garden']) {
    ctx._setGeoResult(row, 'Loading…', false, true);
    assert.equal(elements['geo-val-' + row].loading, true);
    assert.equal(elements['geo-val-' + row].attrs['aria-busy'], 'true');
    ctx._setGeoResult(row, 'Result', true);
    assert.equal(elements['geo-val-' + row].loading, false);
  }
  // A server timeout response must not beat a valid response from the other mirror.
  fetchImpl = async url => ({ok: true, json: async () => url.includes('kumi') ? {elements: []} : {remark: 'timeout', elements: []}});
  assert.deepEqual(await ctx._overpassFetch('fixture'), {elements: []});
  assert.equal(calls, 2);
  // Hanging requests are aborted at the deadline, rather than retried indefinitely.
  fetchImpl = (url, {signal}) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), {once: true});
  });
  const hanging = ctx._overpassFetch('fixture');
  timeoutCallback();
  await assert.rejects(hanging);
  assert.equal(vm.runInContext('parkRequest', ctx), null);
  console.log('PASS location loading states, mirror validation and bounded timeout');
})().catch(error => { console.error(error); process.exitCode = 1; });
