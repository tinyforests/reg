var FR_GARDENS = ["ER-AU-VIC-BAL-001", "ER-AU-VIC-BAL-PRD-001", "ER-AU-VIC-BAL-WNM-001", "ER-AU-VIC-BLA-DEW-001", "ER-AU-VIC-BOR-WIN-001", "ER-AU-VIC-BOR-WIN-002", "ER-AU-VIC-CAN-FLI-001", "ER-AU-VIC-CAN-MON-001", "ER-AU-VIC-HW-AUB-0001", "ER-AU-VIC-MAN-EVE-001", "ER-AU-VIC-NIL-BEL-001", "ER-AU-VIC-NTH-RUP-001", "ER-AU-VIC-SH-ARU-0001", "ER-AU-VIC-SH-CAN-0001", "ER-AU-VIC-SH-GTR-0001", "ER-AU-VIC-SH-MID-001", "ER-AU-VIC-SH-SIR-0001", "ER-AU-VIC-SH-WEL-0001", "ER-AU-VIC-SY-NIC-0002", "ER-AU-VIC-THO-HAR-001", "ER-AU-VIC-WHI-KTE-001", "ER-AU-VIC-WHI-LEO-0001", "ER-AU-VIC-WHI-VIC-001", "ER-AU-VIC-WHI-YRK-001", "ER-AU-VIC-WHI-YRK-002"];
/** Private Notion archive. Nothing enters public exports; publication requires a
 * live session belonging to this garden's steward, including for administrators. */
var FR_HEADERS = ['source_id', 'record_json'];
function _frRows() {
  return _plRows(_plSheet('Private Field Records', FR_HEADERS), 2);
}
function _frGarden(id) {
  return FR_GARDENS.indexOf(String(id || '')) !== -1;
}
function _frEntry(e) {
  if (!e || !/^[a-f0-9]{32}$/.test(e.source_id)) throw new Error('Invalid source ID');
  if (e.garden_id && !_frGarden(e.garden_id)) throw new Error('Unknown garden');
  var record = {source_id:e.source_id, public_id:_plToken(), source_url:'https://www.notion.so/' + e.source_id,
    title:String(e.title || ''), created_at:String(e.created_at || ''),
    project_ids:e.project_ids || [], garden_id:e.garden_id || '',
    body:String(e.body || ''), assets:e.assets || [], visibility:'private',
    imported_at:new Date().toISOString()};
  if (JSON.stringify(record).length > 45000) throw new Error('Record exceeds safe cell size');
  return record;
}
function handleFieldRecord(p) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return jsonResp({ok:false,error:'Busy; try again'});
  try {
    var admin = _plAdmin(p.admin_token), garden = String(p.garden_id || '');
    var steward = garden && _validStewardSession(garden, p.session_token, SpreadsheetApp.getActiveSpreadsheet());
    if (p.op === 'import') {
      if (!admin) return jsonResp({ok:false,error:'Unauthorised'});
      if (!Array.isArray(p.entries) || p.entries.length > 20) throw new Error('Import at most 20 records');
      // Validate the whole batch before any writes.
      var incoming = p.entries.map(_frEntry), have = {}, rows = _frRows();
      rows.forEach(function(r) { have[r[0]] = true; });
      var add = [], skipped = 0;
      incoming.forEach(function(e) {
        if (have[e.source_id]) { skipped++; return; }
        have[e.source_id] = true; add.push([e.source_id, JSON.stringify(e)]);
      });
      if (add.length) {
        var sh = _plSheet('Private Field Records', FR_HEADERS);
        sh.getRange(sh.getLastRow()+1,1,add.length,2).setValues(add);
      }
      return jsonResp({ok:true,imported:add.length,skipped:skipped});
    }
    if (p.op === 'link_project') {
      if (!admin) return jsonResp({ok:false,error:'Unauthorised'});
      if (!/^[a-f0-9]{32}$/.test(String(p.project_id || '')) || !_frGarden(garden)) throw new Error('Choose a known Registry garden');
      var projectRows = _plRows(_plSheet(PL_PROJECTS, PL_PROJECT_HEADERS), PL_PROJECT_HEADERS.length), found = false;
      for (var pr=0;pr<projectRows.length;pr++) {
        if (projectRows[pr][7] === 'notion-design:' + p.project_id) {
          _plSheet(PL_PROJECTS, PL_PROJECT_HEADERS).getRange(pr+2,7).setValue(garden); found=true;
        }
      }
      if (!found) throw new Error('Project not found');
      var journalRows=_frRows(), linked=0;
      for (var jr=0;jr<journalRows.length;jr++) {
        var note=JSON.parse(journalRows[jr][1]);
        if (note.project_ids.length===1 && note.project_ids[0]===p.project_id) {
          if(note.garden_id !== garden) { note.garden_id=garden; note.visibility='private';
            _plSheet('Private Field Records',FR_HEADERS).getRange(jr+2,2).setValue(JSON.stringify(note)); }
          linked++;
        }
      }
      return jsonResp({ok:true,linked:linked});
    }
    if (p.op === 'list') {
      if (!garden && !admin) return jsonResp({ok:false,error:'Not found'});
      var records = _frRows().map(function(r) { return JSON.parse(r[1]); }).filter(function(e) {
        return (!garden || e.garden_id === garden) && (admin || steward || e.visibility === 'public');
      }).map(function(e) {
        if (admin || steward) return e;
        return {id:e.public_id,title:e.title,created_at:e.created_at,body:e.body,visibility:'public'};
      });
      return jsonResp({ok:true,can_publish:!!steward,gardens:admin ? FR_GARDENS : undefined,records:records});
    }
    if (p.op === 'publish') {
      if (!steward) return jsonResp({ok:false,error:'Verified garden steward required'});
      if (typeof p.public !== 'boolean') throw new Error('Publication choice required');
      var all = _frRows();
      for (var i=0;i<all.length;i++) {
        if (all[i][0] !== p.source_id) continue;
        var entry = JSON.parse(all[i][1]);
        if (entry.garden_id !== garden) return jsonResp({ok:false,error:'Not found'});
        entry.visibility = p.public ? 'public' : 'private';
        entry.publication_updated_at = new Date().toISOString();
        _plSheet('Private Field Records',FR_HEADERS).getRange(i+2,2).setValue(JSON.stringify(entry));
        return jsonResp({ok:true});
      }
      return jsonResp({ok:false,error:'Not found'});
    }
    return jsonResp({ok:false,error:'Unknown operation'});
  } catch (e) { return jsonResp({ok:false,error:String(e.message || e)}); }
  finally { lock.releaseLock(); }
}
