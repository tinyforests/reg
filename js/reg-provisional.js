/* Public self-enrolment profiles. Never render contact details or street addresses. */
var PROV_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS-v90MASzlma0rqxLApLTlMqi1NVHXgfg8AmKy80yXOlogICKA-JGSDxrS_EqnWSCb_QziixcPJHlW/pub?gid=0&single=true&output=csv';

function parseCSV(text) {
  var rows = [];
  var raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  var i = 0, n = raw.length;
  while (i <= n) {
    var fields = [];
    var reachedEnd = false;
    while (true) {
      var f = '';
      if (i < n && raw[i] === '"') {
        i++;
        while (i < n) {
          if (raw[i] === '"') {
            i++;
            if (i < n && raw[i] === '"') { f += '"'; i++; }
            else { break; }
          } else { f += raw[i++]; }
        }
      } else {
        while (i < n && raw[i] !== ',' && raw[i] !== '\n') { f += raw[i++]; }
      }
      fields.push(f);
      if (i >= n) { reachedEnd = true; break; }
      if (raw[i] === '\n') { i++; break; }
      i++;
    }
    if (fields.length > 1 || (fields.length === 1 && fields[0] !== '')) {
      rows.push(fields);
    }
    if (reachedEnd) break;
  }
  return rows;
}

// Column positions match Code.gs; only these public fields leave this adapter.
function provisionalRecord(rows, id) {
  var row = rows.slice(1).find(function(r) { return r[1] === id; });
  if (!row) return null;
  var status = (row[23] || '').trim().toLowerCase();
  if (['deleted', 'hidden', 'rejected'].indexOf(status) !== -1) return null;
  if ([19, 20].some(function(i) { return String(row[i]).trim().toLowerCase() !== 'true'; })) return null;
  var rawScore = String(row[17] || '').trim();
  var score = /^\d+$/.test(rawScore) ? Number(rawScore) : null;
  return {
    id: id, name: row[30] || 'Garden record', suburb: row[31] || '',
    score: score !== null && score <= 100 ? score : null,
    tier: row[18] || '', submitted: row[0] || '', status: status,
    publishedId: (row[25] || '').trim()
  };
}

async function loadProvisionalProfile() {
  var el = function(id) { return document.getElementById(id); };
  var id = new URLSearchParams(window.location.search).get('id');
  el('record').hidden = true;
  el('published').hidden = true;
  el('retry').hidden = true;
  el('title').textContent = 'Your provisional profile';
  if (!id) {
    el('message').textContent = 'Open the profile link in your registration email to view your garden’s record.';
    return;
  }
  el('message').textContent = 'Loading your garden’s record…';
  try {
    var response = await fetch(PROV_CSV, {cache: 'no-store'});
    if (!response.ok) throw new Error('Profile unavailable');
    var record = provisionalRecord(parseCSV(await response.text()), id);
    if (!record) {
      el('message').textContent = 'This profile is not available yet, or has been withdrawn. New records may take up to 48 hours to appear. If you registered recently, please try again later.';
      el('retry').hidden = false;
      return;
    }
    if (record.publishedId) {
      var ledgerResponse = await fetch('/data/registry.json', {cache: 'no-store'});
      if (!ledgerResponse.ok) throw new Error('Registry unavailable');
      var ledger = await ledgerResponse.json();
      var garden = ledger.gardens.find(function(g) { return g.garden_id === record.publishedId && !g.demo; });
      if (garden && /^\/gardens\/[a-zA-Z0-9_-]+\/(?:index\.html)?$/.test(garden.profile_url)) {
        el('message').textContent = 'Your garden now has a registered profile. Follow the link for its current record.';
        el('published-link').href = garden.profile_url;
        el('published').hidden = false;
        return;
      }
    }
    el('title').textContent = record.name;
    el('message').textContent = 'A record of what is there today, with room to grow.';
    el('suburb').textContent = record.suburb;
    el('score').textContent = record.score === null ? '—' : record.score;
    el('tier').textContent = record.score === null ? 'Score unavailable' : record.tier;
    el('review-status').textContent = record.status === 'verified'
      ? 'Review complete — awaiting registration. The score above remains the original self-reported score.'
      : record.status === 'verifying' ? 'A verification review is in progress.' : 'Awaiting review.';
    var date = new Date(record.submitted);
    el('submitted').textContent = isNaN(date.getTime()) ? '' : 'Submitted ' + date.toLocaleDateString('en-AU', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Melbourne'});
    el('reference').textContent = record.id;
    el('record').hidden = false;
  } catch (err) {
    el('message').textContent = 'We couldn’t load your profile. Please try again shortly.';
    el('retry').hidden = false;
  }
}

if (typeof document !== 'undefined') {
  document.getElementById('retry').addEventListener('click', loadProvisionalProfile);
  loadProvisionalProfile();
}
