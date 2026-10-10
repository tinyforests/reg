(function () {
  'use strict';
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbwGIau58khBRKYgq5SYwu0QjCWPa5h2dKyz4nPoeU9YMKlPN5BRXUz0LmzF7jZrqrRC/exec';
  var token = '', adminToken = '', requestId = newRequestId(), editingId = '';
  var $ = function (s) { return document.querySelector(s); };
  function newRequestId() { return crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(20))).map(function (b) { return ('0'+b.toString(16)).slice(-2); }).join(''); }
  function node(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function message(text) { $('#notice').textContent = text; }
  function statusLabel(s) { return {pending:'Awaiting review',needs_changes:'Changes requested',ready:'Ready for publication',published:'Published'}[s] || s; }
  function busy(button, promise) { button.disabled = true; return promise.finally(function () { button.disabled = false; }); }
  function api(action, data) {
    var payload = Object.assign({}, data || {}, {submission_type:'designer_portal', action:action});
    if (adminToken) payload.admin_token = adminToken; else payload.designer_token = token;
    return fetch(ENDPOINT, {method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)})
      .then(function (r) { if (!r.ok) throw new Error('The Registry service is unavailable. Please try again.'); return r.json(); })
      .then(function (r) { if (!r.ok) throw new Error(r.error || 'Unable to complete this request'); return r; });
  }
  function showLink(link) { $('#createdLink').hidden = false; $('#privateLink').value = link; $('#createdLink').scrollIntoView({block:'center'}); }
  function renderPortfolio(data) {
    $('#practiceName').textContent = data.practice.name;
    var gardens = data.gardens || [], submissions = data.submissions || [];
    $('#portfolioCount').textContent = gardens.length;
    $('#pendingCount').textContent = submissions.filter(function (s) { return s.review_status !== 'published'; }).length;
    var scored = gardens.filter(function (g) { return typeof g.score === 'number' && g.status !== 'Design Proposal'; });
    $('#averageScore').textContent = scored.length ? Math.round(scored.reduce(function (n,g) { return n+g.score; },0)/scored.length) : '—';
    var cards = $('#portfolioCards'); cards.replaceChildren();
    gardens.forEach(function (g) {
      var card = node('article',null,'garden-card'); card.append(node('span',g.garden_id,'label'),node('h3',g.garden_name),node('p',g.suburb+', '+g.state,'small'));
      card.append(node('strong',g.status === 'Design Proposal' ? '—' : g.score),node('p',g.verification_label || 'Verification not recorded','small'));
      var tier = typeof g.rating === 'object' && g.rating ? g.rating.current : g.rating;
      card.append(node('p',tier || g.status,'small'));
      if (/^\/gardens\/g-[a-f0-9]{12}\//.test(g.profile_url || '')) { var link = node('a','View garden record →'); link.href = g.profile_url; card.append(link); }
      cards.append(card);
    });
    if (!gardens.length) cards.append(node('p','Your published, attributed gardens will appear here after Registry review.','empty'));
    var list = $('#submissionList'); list.replaceChildren();
    submissions.slice().reverse().forEach(function (s) {
      var row = node('article',null,'row'), detail = node('div'); detail.append(node('h3',s.garden_name),node('p',s.suburb+' · '+new Date(s.created_at).toLocaleDateString('en-AU'), 'small'),node('span',statusLabel(s.review_status),'state'));
      if (s.review_note) detail.append(node('p',s.review_note)); row.append(detail);
      if (s.review_status === 'pending' || s.review_status === 'needs_changes') {
        var edit = node('button','Revise submission','secondary'); edit.type='button';
        edit.addEventListener('click',function () { busy(edit,api('get_submission',{submission_id:s.submission_id}).then(function (r) { fillGarden(r.submission.payload); editingId=s.submission_id; $('#submitGarden').textContent='Resubmit for review'; $('#addGarden').scrollIntoView({block:'start'}); }).catch(function (e) { message(e.message); })); });
        row.append(edit);
      }
      list.append(row);
    });
    if (!submissions.length) list.append(node('p','No gardens submitted yet. Start with one garden whose steward has agreed to take part.','empty'));
  }
  function renderAdmin(data) {
    var practices = data.practices || [], list = $('#practiceList'); list.replaceChildren();
    practices.forEach(function (p) {
      var row = node('article',null,'row'), description = node('div'); description.append(node('h3',p.name),node('p',p.contact_email,'small'),node('p',p.designer_id,'label'),node('span',p.status,'state'));
      var actions = node('div',null,'actions');
      var issue = node('button','Issue new access link','secondary'); issue.type='button';
      issue.addEventListener('click',function () { if (!confirm('Issue a new link? The previous link will stop working.')) return; busy(issue,api('rotate_practice_token',{designer_id:p.designer_id}).then(function (r) { showLink(r.access_link); return load(); }).catch(function (e) { message(e.message); })); });
      var revoke = node('button','Revoke access','secondary'); revoke.type='button'; revoke.disabled = p.status !== 'active';
      revoke.addEventListener('click',function () { if (!confirm('Revoke this practice’s portal access?')) return; busy(revoke,api('revoke_practice',{designer_id:p.designer_id}).then(load).catch(function (e) { message(e.message); })); });
      actions.append(issue,revoke);row.append(description,actions);list.append(row);
    });
    if (!practices.length) list.append(node('p','No practices invited yet. Create the first private access link above.','empty'));
    var queue = $('#reviewList'); queue.replaceChildren();
    (data.submissions || []).slice().reverse().forEach(function (s) {
      var card = node('article',null,'review-card'), payload = s.payload || {}, c=payload.candidate || {};
      card.append(node('span',s.submission_id,'label'),node('h3',s.garden_name),node('span',statusLabel(s.review_status),'state'));
      var facts=node('dl');
      [['Practice',s.designer_id],['Suburb',c.suburb+', '+c.state],['Private address',payload.garden_address],['Steward email',payload.steward_email],['Steward permission',payload.consent_record ? 'Confirmed by designer' : 'Missing'],['Public profile consent',payload.consent_public_profile ? 'Confirmed by designer' : 'Missing']].forEach(function (v) { facts.append(node('dt',v[0]),node('dd',v[1] || '—')); });card.append(facts);
      if (payload.evidence_url && /^https:\/\//i.test(payload.evidence_url)) { var evidence=node('a','Open submitted evidence →'); evidence.href=payload.evidence_url;evidence.target='_blank';evidence.rel='noopener noreferrer';card.append(evidence); }
      if (payload.private_notes) card.append(node('p',payload.private_notes,'small'));
      var details=node('details'), summary=node('summary','Review ecological inputs');details.append(summary,node('pre',JSON.stringify(c,null,2)));card.append(details);
      if (s.review_status !== 'published') {
        var form=node('form'), label=node('label','Review status'), select=document.createElement('select');
        ['pending','needs_changes','ready'].forEach(function (v) { var o=node('option',statusLabel(v));o.value=v;select.append(o); });select.value=s.review_status;label.append(select);
        var noteLabel=node('label','Review note · visible to the practice'), note=document.createElement('textarea');note.maxLength=2000;note.value=s.review_note || '';note.rows=2;noteLabel.append(note);
        var save=node('button','Save review','secondary');form.append(label,noteLabel,save);form.addEventListener('submit',function (e) { e.preventDefault();busy(save,api('review_submission',{submission_id:s.submission_id,review_status:select.value,review_note:note.value}).then(load).catch(function (err) { message(err.message); })); });card.append(form);
        if (s.review_status === 'ready') card.append(node('p','Publish after checking the record: python3 scripts/promote_designer_submission.py '+s.submission_id+' --check. Publish the resulting source files, then run the same command with --confirm-live. Verification requires an explicit reviewer and verification method.','small'));
      }
      queue.append(card);
    });
    if (!(data.submissions || []).length) queue.append(node('p','No designer submissions awaiting review.','empty'));
  }
  function load() {
    message('Opening your portal…');
    return api(adminToken ? 'admin_overview' : 'get_portfolio').then(function (data) {
      $('#accessPanel').hidden=true; $('#adminView').hidden=!adminToken; $('#designerView').hidden=!!adminToken; $('#signOut').hidden=false;
      if (adminToken) renderAdmin(data); else renderPortfolio(data); message('');
    }).catch(function (error) { message(error.message); throw error; });
  }
  var form=$('#gardenForm');
  function readGarden() {
    var values={};Array.from(form.elements).forEach(function (e) { if (!e.name) return;values[e.name]=e.type==='checkbox'?e.checked:e.value; });return values;
  }
  function preview(g) {
    var number=function (v) { return v === '' || v == null ? null : Number(v); };
    return {biodiversity:{indigenous_species_current:number(g.indigenous_species_current),indigenous_dominant:g.indigenous_dominant,structural_layers_current:number(g.structural_layers_current),canopy_cover_pct_current:number(g.canopy_cover_pct_current)},soil_water:{soil_health_score:number(g.soil_health_score),water_function_score:number(g.water_function_score),has_moisture_basin:g.has_moisture_basin,has_swale:g.has_swale,has_mulch:g.has_mulch},habitat:{habitat_nodes:number(g.habitat_nodes),has_embedded_logs:g.has_embedded_logs,has_rock_refuges:g.has_rock_refuges,has_water_feature:g.has_water_feature,has_nest_boxes:g.has_nest_boxes,fauna_sightings:[]},connectivity:{park_distance_m:number(g.park_distance_m),adjacent_registered_gardens:[]},evidence:{verification_level:'self_reported',has_species_list:!!String(g.species_list || '').trim()}};
  }
  function updatePreview() { var g=readGarden();$('#draftScore').textContent=['indigenous_species_current','structural_layers_current','canopy_cover_pct_current','habitat_nodes'].every(function (k) { return g[k]!==''; }) ? scoreEcologicalRegistry(preview(g)).total : '—'; }
  function fillGarden(payload) {
    var c=payload.candidate || {},g=Object.assign({},c,c.biodiversity || {},c.soil_water || {},c.habitat || {},c.connectivity || {},{garden_address:payload.garden_address,steward_email:payload.steward_email,private_notes:payload.private_notes,evidence_url:payload.evidence_url,public_steward_name:c.stewards,evc_name:(c.evc || {}).name,evc_code:(c.evc || {}).code,species_list:((c.biodiversity || {}).species_list || []).join('\n'),consent_record:payload.consent_record,consent_public_profile:payload.consent_public_profile});
    form.reset();Array.from(form.elements).forEach(function (e) { if (!e.name || g[e.name]==null) return;if(e.type==='checkbox') e.checked=g[e.name]===true;else e.value=g[e.name]; });updatePreview();
  }
  function clearGarden() { form.reset();editingId='';requestId=newRequestId();$('#submitGarden').textContent='Submit for review';updatePreview(); }
  form.addEventListener('input',updatePreview);
  form.addEventListener('submit',function (event) {
    event.preventDefault();if(!token || adminToken) { $('#formStatus').textContent='Open a practice portal before submitting.';return; }
    var action=editingId?'update_submission':'submit_garden';$('#formStatus').textContent='Saving your private submission…';
    busy($('#submitGarden'),api(action,{request_id:requestId,submission_id:editingId,garden:readGarden()}).then(function (r) { $('#formStatus').textContent='Submission '+r.submission_id+' saved for Registry review.';clearGarden();return load(); }).catch(function (e) { $('#formStatus').textContent=e.message; }));
  });
  $('#clearDraft').addEventListener('click',clearGarden);
  $('#accessForm').addEventListener('submit',function (event) { event.preventDefault();var raw=$('#accessLink').value.trim();try{token=new URL(raw).hash.slice(1);token=new URLSearchParams(token).get('access') || '';}catch(e){token=raw;}adminToken='';if(!token){message('Paste your practice’s access link or token.');return;}load().then(function(){sessionStorage.setItem('reg_designer_access',token);$('#accessLink').value='';}).catch(function(){}); });
  $('#adminLogin').addEventListener('submit',function (event) { event.preventDefault();adminToken=$('#adminToken').value.trim();token='';load().then(function(){sessionStorage.setItem('reg_designer_admin',adminToken);$('#adminToken').value='';}).catch(function(){}); });
  $('#practiceForm').addEventListener('submit',function (event) { event.preventDefault();var f=new FormData(event.target);busy(event.target.querySelector('button'),api('create_practice',Object.fromEntries(f)).then(function(r){showLink(r.access_link);event.target.reset();return load();}).catch(function(e){message(e.message);})); });
  $('#copyLink').addEventListener('click',function(){navigator.clipboard.writeText($('#privateLink').value).then(function(){message('Private access link copied. Share it only with the practice.');}).catch(function(){message('Select and copy the private link above.');});});
  $('#signOut').addEventListener('click',function(){token='';adminToken='';sessionStorage.removeItem('reg_designer_access');sessionStorage.removeItem('reg_designer_admin');$('#accessPanel').hidden=false;$('#designerView').hidden=true;$('#adminView').hidden=true;$('#signOut').hidden=true;$('#portfolioCards').replaceChildren();$('#submissionList').replaceChildren();$('#practiceList').replaceChildren();$('#reviewList').replaceChildren();$('#privateLink').value='';$('#createdLink').hidden=true;clearGarden();message('Portal locked.');});
  document.querySelectorAll('.refresh').forEach(function(b){b.addEventListener('click',function(){busy(b,load().catch(function(){}));});});
  function theme(mode){document.documentElement.classList.toggle('dark',mode==='dark');$('#themeToggle').textContent=mode==='dark'?'Canopy':'Understory';try{localStorage.setItem('reg_mode',mode);}catch(e){}}
  var mode='dark';try{mode=localStorage.getItem('reg_mode') || localStorage.getItem('reg-theme') || 'dark';}catch(e){}theme(mode);$('#themeToggle').addEventListener('click',function(){theme(document.documentElement.classList.contains('dark')?'light':'dark');});
  var incoming=new URLSearchParams(location.hash.slice(1)).get('access');
  if(incoming){history.replaceState(null,'',location.pathname+location.search);token=incoming;adminToken='';load().then(function(){sessionStorage.setItem('reg_designer_access',token);}).catch(function(){});}
  else {try{token=sessionStorage.getItem('reg_designer_access') || '';adminToken=token?'':sessionStorage.getItem('reg_designer_admin') || '';}catch(e){}if(token || adminToken)load().catch(function(){});}
})();
