/** Imported journals: server verifies access and publication permission. */
(function(root) {
  'use strict';
  var endpoint='https://script.google.com/macros/s/AKfycbwGIau58khBRKYgq5SYwu0QjCWPa5h2dKyz4nPoeU9YMKlPN5BRXUz0LmzF7jZrqrRC/exec';
  root.renderImportedFieldRecords = function(gardenId) {
    var anchor=document.getElementById('activityLog');
    if (!anchor) return;
    var previous=document.getElementById('importedFieldRecords'); if(previous) previous.remove();
    var box=document.createElement('div');box.id='importedFieldRecords';anchor.append(box);
    var admin='';try{admin=localStorage.getItem('er_admin_token')||'';}catch(e){}
    var session=typeof root.getStewardSession==='function'?root.getStewardSession(gardenId):'';
    function post(op,extra){return fetch(endpoint,{method:'POST',body:JSON.stringify(Object.assign({submission_type:'field_record',op:op,garden_id:gardenId,admin_token:admin,session_token:session},extra||{}))}).then(function(r){return r.json();});}
    function load(){post('list').then(function(data){
      if(!data.ok) throw new Error(data.error);
      box.replaceChildren();
      data.records.sort(function(a,b){return String(b.created_at).localeCompare(String(a.created_at));}).forEach(function(note){
        var article=document.createElement('article');article.className='border p-4 mb-4';
        var heading=document.createElement('h3');heading.textContent=note.title;heading.className='font-serif text-xl';
        var status=document.createElement('p');status.className='text-xs opacity-60';status.textContent=(note.visibility==='public'?'Public field note':'Private · studio and garden steward')+(note.assets&&note.assets.length?' · Photos retained for later':'');
        var body=document.createElement('p');body.style.whiteSpace='pre-wrap';body.textContent=note.body;
        article.append(heading,status,body);
        if(data.can_publish){var button=document.createElement('button');button.className='border px-3 py-2 mt-4';button.textContent=note.visibility==='public'?'Make private':'Make public';button.onclick=function(){
          if(note.visibility!=='public'&&!confirm('Publish this entire note on the public garden profile? Review it for personal details first. Photos are not included.'))return;
          button.disabled=true;post('publish',{source_id:note.source_id,public:note.visibility!=='public'}).then(function(r){if(!r.ok)throw new Error(r.error);load();}).catch(function(e){button.disabled=false;alert(e.message);});
        };article.append(button);}
        box.append(article);
      });
    }).catch(function(){if(admin||session)box.textContent='Private field records could not be loaded. Please try again.';});}
    load();
  };
})(window);
