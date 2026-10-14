/* Attribution is display-only; it never enters the scoring engine. */
function renderDesignerAttribution(record) {
  var facts = document.getElementById('gardenFacts');
  if (!facts) return;
  var label = Array.from(facts.querySelectorAll('dt')).find(function (dt) { return dt.textContent === 'Designed by'; });
  if (!label) return;
  var value = label.parentElement.querySelector('dd');
  value.textContent = record.designer || 'Not recorded';
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(record.designer_id || '')) return;
  fetch('/data/designers.json').then(function (r) { if (!r.ok) throw Error('Unavailable'); return r.json(); }).then(function (data) {
    var practice = data.designers.find(function (d) { return d.designer_id === record.designer_id; });
    if (!practice) return;
    var link = document.createElement('a');
    link.href = '/designers/' + practice.designer_id + '/';
    link.textContent = practice.practice_name;
    value.replaceChildren(link);
  }).catch(function () { /* Keep recorded attribution when the directory is unavailable. */ });
}
