#!/usr/bin/env python3
"""
Adds species autocomplete typeahead to all garden profile pages.
Inserts helper functions before _erRenderSpecies and updates the
species input element to wire up the new event handlers.
"""

import os
import re

GARDENS_DIR = os.path.join(os.path.dirname(__file__), '..', 'gardens')
SKIP = {'foresthillk'}

# ── new autocomplete functions to insert before _erRenderSpecies ──────────────
AUTOCOMPLETE_BLOCK = """\
var _erSpeciesDB = null;
var _erSpeciesResults = [];
var _erSpeciesActiveIdx = -1;

function _erLoadSpeciesDB(cb) {
  if (_erSpeciesDB) { cb(_erSpeciesDB); return; }
  fetch('/data/species.json')
    .then(function(r) { return r.json(); })
    .then(function(d) { _erSpeciesDB = Array.isArray(d) ? d : (d.species || []); cb(_erSpeciesDB); })
    .catch(function() { _erSpeciesDB = []; cb([]); });
}

function _erGetOrCreateDropdown(inp) {
  var dd = document.getElementById('er-species-dd');
  if (!dd) {
    dd = document.createElement('div');
    dd.id = 'er-species-dd';
    dd.style.cssText = 'position:absolute;left:0;right:0;top:100%;z-index:300;max-height:260px;overflow-y:auto;box-shadow:0 6px 20px rgba(0,0,0,.18);display:none;font-family:"IBM Plex Sans",sans-serif';
    var wrap = inp.parentElement;
    if (wrap) { wrap.style.position = 'relative'; wrap.appendChild(dd); }
  }
  var isDk = document.documentElement.classList.contains('dark');
  dd.style.background = isDk ? '#3d4535' : '#fff';
  dd.style.color      = isDk ? '#fff0dc' : '#3d4535';
  dd.style.border     = '1px solid ' + (isDk ? 'rgba(255,240,220,.12)' : '#d7ccb9');
  dd.style.borderTop  = 'none';
  return dd;
}

function _erEscH(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _erHlMatch(text, q) {
  if (!q) return _erEscH(text);
  var i = text.toLowerCase().indexOf(q);
  if (i === -1) return _erEscH(text);
  return _erEscH(text.slice(0, i)) +
    '<mark style="background:#7a9e5f;color:#fff0dc;padding:0 1px">' +
    _erEscH(text.slice(i, i + q.length)) + '</mark>' +
    _erEscH(text.slice(i + q.length));
}

function _erSpeciesInput(inp) {
  var q = inp.value.trim().toLowerCase();
  var dd = _erGetOrCreateDropdown(inp);
  if (!q) { dd.style.display = 'none'; return; }
  _erLoadSpeciesDB(function(db) {
    var existing = (G && G.biodiversity && G.biodiversity.species_list) || [];
    _erSpeciesResults = db.filter(function(s) {
      return s.botanical_name.toLowerCase().indexOf(q) !== -1 ||
        (s.common_name && s.common_name.toLowerCase().indexOf(q) !== -1);
    }).slice(0, 10);
    if (!_erSpeciesResults.length) { dd.style.display = 'none'; return; }
    var isDk = document.documentElement.classList.contains('dark');
    var bdr = 'border-bottom:1px solid ' + (isDk ? 'rgba(255,240,220,.07)' : 'rgba(0,0,0,.06)') + ';';
    var hml = '';
    for (var i = 0; i < _erSpeciesResults.length; i++) {
      var s = _erSpeciesResults[i];
      var already = existing.indexOf(s.botanical_name) !== -1;
      hml += '<div class="er-sp-item" data-idx="' + i + '"' +
        ' onmousedown="event.preventDefault();_erSpeciesSelect(' + i + ')"' +
        ' onmouseenter="_erSpeciesSetActive(' + i + ')"' +
        ' style="padding:.45rem .8rem;cursor:' + (already ? 'default' : 'pointer') + ';' +
        'display:flex;justify-content:space-between;align-items:center;gap:.6rem;' + bdr +
        (already ? 'opacity:.38;' : '') + '">' +
        '<div style="min-width:0;flex:1">' +
          '<div style="font-size:.78rem;font-style:italic;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _erHlMatch(s.botanical_name, q) + '</div>' +
          (s.common_name ? '<div style="font-size:.68rem;opacity:.55;margin-top:1px">' + _erHlMatch(s.common_name, q) + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:.3rem;flex-shrink:0">' +
          (s.layer ? '<span style="font-size:.58rem;padding:.15rem .4rem;font-family:\\'IBM Plex Mono\\',monospace;text-transform:uppercase;letter-spacing:.05em;background:' + (isDk ? 'rgba(255,240,220,.1)' : 'rgba(0,0,0,.07)') + '">' + _erEscH(s.layer) + '</span>' : '') +
          (already ? '<span style="font-size:.7rem;color:#7a9e5f">&#10003;</span>' : '') +
        '</div></div>';
    }
    dd.innerHTML = hml;
    dd.style.display = 'block';
    _erSpeciesActiveIdx = -1;
  });
}

function _erSpeciesSetActive(idx) {
  _erSpeciesActiveIdx = idx;
  var isDk = document.documentElement.classList.contains('dark');
  var hi   = isDk ? 'rgba(122,158,95,.22)' : 'rgba(122,158,95,.12)';
  var items = document.querySelectorAll('.er-sp-item');
  for (var i = 0; i < items.length; i++) {
    items[i].style.background = i === idx ? hi : '';
  }
}

function _erSpeciesSelect(idx) {
  var s = _erSpeciesResults[idx];
  if (!s) return;
  var existing = (G && G.biodiversity && G.biodiversity.species_list) || [];
  if (existing.indexOf(s.botanical_name) !== -1) return;
  var inp = document.getElementById('er-species-input');
  if (inp) inp.value = s.botanical_name;
  var dd = document.getElementById('er-species-dd');
  if (dd) dd.style.display = 'none';
  _erSpeciesActiveIdx = -1;
  erAddSpecies();
}

function _erSpeciesKeydown(e) {
  var dd = document.getElementById('er-species-dd');
  if (!dd || dd.style.display === 'none') {
    if (e.key === 'Enter') erAddSpecies();
    return;
  }
  var items = dd.querySelectorAll('.er-sp-item');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _erSpeciesSetActive(Math.min(_erSpeciesActiveIdx + 1, items.length - 1));
    if (items[_erSpeciesActiveIdx]) items[_erSpeciesActiveIdx].scrollIntoView({block:'nearest'});
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _erSpeciesSetActive(Math.max(_erSpeciesActiveIdx - 1, 0));
    if (items[_erSpeciesActiveIdx]) items[_erSpeciesActiveIdx].scrollIntoView({block:'nearest'});
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (_erSpeciesActiveIdx >= 0) {
      _erSpeciesSelect(_erSpeciesActiveIdx);
    } else {
      erAddSpecies();
    }
  } else if (e.key === 'Escape') {
    dd.style.display = 'none';
    _erSpeciesActiveIdx = -1;
  }
}

function _erSpeciesBlur() {
  setTimeout(function() {
    var dd = document.getElementById('er-species-dd');
    if (dd) dd.style.display = 'none';
  }, 180);
}

"""

# Marker to insert before
INSERT_BEFORE = 'function _erRenderSpecies(sl, isSt) {'

# Old input attribute (the onkeydown-only version); present in both the
# empty-list branch and the populated branch.
OLD_INPUT_ATTR = "onkeydown=\"if(event.key==='Enter')erAddSpecies()\">"

# New input attributes
NEW_INPUT_ATTR = 'oninput="_erSpeciesInput(this)" onkeydown="_erSpeciesKeydown(event)" onblur="_erSpeciesBlur()">'


def process(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    if INSERT_BEFORE not in content:
        return False, 'no _erRenderSpecies found'

    if '_erSpeciesDB' in content:
        return False, 'already updated'

    # 1. Insert autocomplete block before _erRenderSpecies
    content = content.replace(INSERT_BEFORE, AUTOCOMPLETE_BLOCK + INSERT_BEFORE, 1)

    # 2. Replace old input attribute in both empty-list and populated branches
    # In the actual file the single-quotes inside the JS string are escaped: \'
    # Both variants below appear; replace all occurrences.
    count = content.count(OLD_INPUT_ATTR)
    if count == 0:
        # Try with escaped single quotes as they appear in the raw JS strings
        old_esc = r"onkeydown=\"if(event.key===\'Enter\')erAddSpecies()\">"
        count = content.count(old_esc)
        if count:
            content = content.replace(old_esc, NEW_INPUT_ATTR)
    else:
        content = content.replace(OLD_INPUT_ATTR, NEW_INPUT_ATTR)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

    return True, f'done ({count} input(s) updated)'


updated = []
skipped = []
errored = []

for garden in sorted(os.listdir(GARDENS_DIR)):
    if garden in SKIP:
        continue
    idx = os.path.join(GARDENS_DIR, garden, 'index.html')
    if not os.path.isfile(idx):
        continue
    ok, msg = process(idx)
    (updated if ok else skipped).append(f'{garden}: {msg}')

print(f'\nUpdated ({len(updated)}):')
for s in updated:
    print(' ', s)
print(f'\nSkipped ({len(skipped)}):')
for s in skipped:
    print(' ', s)
