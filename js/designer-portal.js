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
    var scored = gardens.filter(function (g) { return typeof g.score === 'number' && !['Provisional','Design Proposal'].includes(g.status) && ['gardener_and_son_verified','site_visit','photo_verified'].includes(g.verification_level); });
    $('#averageScore').textContent = scored.length ? Math.round(scored.reduce(function (n,g) { return n+g.score; },0)/scored.length) : '—';
    var cards = $('#portfolioCards'); cards.replaceChildren();
    gardens.forEach(function (g) {
      var quarantined = ['Provisional','Design Proposal'].includes(g.status);
      var card = node('article',null,'garden-card' + (quarantined ? ' provisional' : '')); card.append(node('span',g.garden_id,'label'),node('h3',g.garden_name),node('p',g.suburb+', '+g.state,'small'));
      card.append(node('strong',quarantined ? '—' : g.score),node('p',quarantined ? 'Unverified · awaiting review' : (g.verification_label || 'Verification not recorded'),'small'));
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
  function routingApi(action,data){var payload=Object.assign({},data||{},{submission_type:'upgrade_routing',action:action});if(adminToken)payload.admin_token=adminToken;else payload.designer_token=token;return fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)}).then(function(r){if(!r.ok)throw Error('Routing service unavailable');return r.json();}).then(function(r){if(!r.ok)throw Error(r.error);return r;});}
  function loadRouting(){var host=adminToken?$('#adminRoutingQueue'):$('#routingQueue');return routingApi('get_queue').then(function(data){host.replaceChildren();data.requests.slice().reverse().forEach(function(r){var card=node('article',null,'garden-card');card.append(node('span',r.request_id,'label'),node('h3',r.opportunity_label),node('p',r.garden_id,'small'),node('p',r.status+' · '+new Date(r.created).toLocaleDateString('en-AU'),'small'));if(r.status==='offered')card.append(node('p','Respond by '+new Date(r.response_deadline).toLocaleDateString('en-AU'),'small'));if(r.steward_email){var contact=node('a','Contact consenting steward');contact.href='mailto:'+encodeURIComponent(r.steward_email);card.append(contact);}if(r.status==='offered'||r.status==='released'){['accepted'].concat(r.status==='offered'?['declined']:[]).forEach(function(response){var b=node('button',response==='accepted'?'Accept request':'Decline request','secondary');b.type='button';b.onclick=function(){busy(b,routingApi('respond',{request_id:r.request_id,response:response}).then(loadRouting).catch(function(e){message(e.message);}));};card.append(b);});}if(adminToken&&r.status==='accepted'){var done=node('button','Confirm completed','secondary');done.type='button';done.onclick=function(){busy(done,routingApi('complete',{request_id:r.request_id}).then(loadRouting).catch(function(e){message(e.message);}));};card.append(done);}host.append(card);});if(!data.requests.length)host.append(node('p','No upgrade requests recorded.','empty'));}).catch(function(e){host.replaceChildren(node('p',e.message,'small'));});}
  function loadDemand(){var host=$('#designerDemand');if(adminToken)return Promise.resolve();return fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({submission_type:'designer_demand',action:'get',designer_token:token})}).then(function(r){return r.json();}).then(function(r){host.replaceChildren();if(!r.ok)throw Error(r.error);if(!r.available||!r.aggregate.available){host.append(node('p',r.message||'Private garden locations are not available for this practice.','empty'));return;}var a=r.aggregate;host.append(node('p',a.location_coverage.with_private_locations+' of '+a.location_coverage.attributed_gardens+' attributed gardens have private locations available for this calculation.','small'));[['Distance from nearest garden',a.bands],['Month',a.months],['Original vegetation community',a.evcs]].forEach(function(group){host.append(node('h3',group[0]));var list=node('dl');Object.entries(group[1]).forEach(function(pair){var row=node('div',null,'row');row.append(node('dt',pair[0]),node('dd',String(pair[1])));list.append(row);});host.append(list);});host.append(node('p','Aggregate updated '+new Date(r.updated_at).toLocaleDateString('en-AU'),'small'));}).catch(function(e){host.replaceChildren(node('p',e.message,'small'));});}
  function load() {
    message('Opening your portal…');
    return api(adminToken ? 'admin_overview' : 'get_portfolio').then(function (data) {
      $('#accessPanel').hidden=true; $('#adminView').hidden=!adminToken; $('#designerView').hidden=!!adminToken; $('#signOut').hidden=false;
      if (adminToken) renderAdmin(data); else renderPortfolio(data); message('');return Promise.all([loadRouting(),loadDemand()]);
    }).catch(function (error) { $('#designerView').hidden=true;$('#adminView').hidden=true;$('#accessPanel').hidden=false;$('#signOut').hidden=true;token='';adminToken='';sessionStorage.removeItem('reg_designer_access');sessionStorage.removeItem('reg_designer_admin');message(error.message); throw error; });
  }
  function publicData(path){return fetch(path).then(function(r){if(!r.ok)throw Error('Public records unavailable.');return r.json();});}
  Promise.all([publicData('/data/designers.json'),publicData('/data/designers-derived.json'),publicData('/data/registry.json')]).then(function(data){
    var select=$('#publicPractice');data[0].designers.forEach(function(d){var option=node('option',d.practice_name);option.value=d.designer_id;select.append(option);});
    var requested=new URLSearchParams(location.search).get('designer');if(data[0].designers.some(function(d){return d.designer_id===requested;}))select.value=requested;
    var generation=0;
    function renderPublic(){var selected=select.value,version=++generation,summary=data[1].designers[selected] || {};$('#publicCount').textContent=summary.garden_count ?? '—';$('#publicVerified').textContent=summary.verified_count ?? '—';$('#publicMean').textContent=summary.mean_verified_score ?? '—';$('#publicDesignerLink').href='/designers/'+selected+'/';$('#publicCards').replaceChildren();
      Promise.all(data[2].gardens.filter(function(g){return g.designer_id===selected;}).map(function(g){return publicData('/'+g.data_file.replace(/^\//,'')).then(function(r){return {garden:g,record:r};});})).then(function(rows){if(version!==generation)return;var cards=$('#publicCards');rows.forEach(function(row){var g=row.garden,q=['Provisional','Design Proposal'].includes(g.status)||['Provisional','Design Proposal'].includes(row.record.status);var card=node('article',null,'garden-card'+(q?' provisional':''));card.append(node('h3',g.garden_name),node('p',g.suburb,'small'),node('strong',q?'—':g.score),node('p',q?'Unverified · '+(row.record.status||g.status):g.status,'small'));var a=node('a','View garden record →');a.href=g.profile_url;card.append(a);cards.append(card);});if(!rows.length)cards.append(node('p','No attributed gardens recorded.','empty'));}).catch(function(e){message(e.message);});
    }
    select.addEventListener('change',renderPublic);renderPublic();
  }).catch(function(e){message(e.message);});
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
  $('#accessForm').addEventListener('submit',function (event) { event.preventDefault();busy(event.target.querySelector('button'),api('request_designer_access',{email:$('#accessLink').value.trim()}).then(function(r){message(r.message);$('#accessLink').value='';}).catch(function(e){message(e.message);})); });
  $('#adminLogin').addEventListener('submit',function (event) { event.preventDefault();adminToken=$('#adminToken').value.trim();token='';load().then(function(){sessionStorage.setItem('reg_designer_admin',adminToken);$('#adminToken').value='';}).catch(function(){}); });
  $('#practiceForm').addEventListener('submit',function (event) { event.preventDefault();var f=new FormData(event.target);busy(event.target.querySelector('button'),api('create_practice',Object.fromEntries(f)).then(function(r){showLink(r.access_link);event.target.reset();return load();}).catch(function(e){message(e.message);})); });
  $('#copyLink').addEventListener('click',function(){navigator.clipboard.writeText($('#privateLink').value).then(function(){message('Private access link copied. Share it only with the practice.');}).catch(function(){message('Select and copy the private link above.');});});
  $('#signOut').addEventListener('click',function(){token='';adminToken='';sessionStorage.removeItem('reg_designer_access');sessionStorage.removeItem('reg_designer_admin');$('#accessPanel').hidden=false;$('#designerView').hidden=true;$('#adminView').hidden=true;$('#signOut').hidden=true;$('#portfolioCards').replaceChildren();$('#submissionList').replaceChildren();$('#practiceList').replaceChildren();$('#reviewList').replaceChildren();$('#routingQueue').replaceChildren();$('#adminRoutingQueue').replaceChildren();$('#designerDemand').replaceChildren();$('#privateLink').value='';$('#createdLink').hidden=true;clearGarden();message('Portal locked.');});
  document.querySelectorAll('.refresh').forEach(function(b){b.addEventListener('click',function(){busy(b,load().catch(function(){}));});});
  function theme(mode){document.documentElement.classList.toggle('dark',mode==='dark');$('#themeToggle').textContent=mode==='dark'?'Canopy':'Understory';try{localStorage.setItem('reg_mode',mode);}catch(e){}}
  var mode='dark';try{mode=localStorage.getItem('reg_mode') || localStorage.getItem('reg-theme') || 'dark';}catch(e){}theme(mode);$('#themeToggle').addEventListener('click',function(){theme(document.documentElement.classList.contains('dark')?'light':'dark');});
  var claim=new URLSearchParams(location.hash.slice(1)).get('designer_claim');
  if(claim){history.replaceState(null,'',location.pathname+location.search);token='';adminToken='';api('verify_designer_access',{token:claim}).then(function(r){token=r.session_token;sessionStorage.setItem('reg_designer_access',token);sessionStorage.removeItem('reg_designer_admin');return load();}).catch(function(e){token='';message(e.message);});}
  var incoming=new URLSearchParams(location.hash.slice(1)).get('access');
  if(incoming){history.replaceState(null,'',location.pathname+location.search);token=incoming;adminToken='';load().then(function(){sessionStorage.setItem('reg_designer_access',token);}).catch(function(){});}
  else if(!claim) {try{token=sessionStorage.getItem('reg_designer_access') || '';adminToken=token?'':sessionStorage.getItem('reg_designer_admin') || '';}catch(e){}if(token || adminToken)load().catch(function(){});}
})();
