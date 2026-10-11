(function () {
  'use strict';
  var root=document.documentElement, toggle=document.getElementById('developerTheme');
  function theme(mode) {root.classList.toggle('dark',mode==='dark');toggle.textContent=mode==='dark'?'Canopy':'Understory';try{localStorage.setItem('reg_mode',mode);}catch(e){}}
  var mode='dark';try{mode=localStorage.getItem('reg_mode')||localStorage.getItem('reg-theme')||'dark';}catch(e){}theme(mode);
  toggle.addEventListener('click',function(){theme(root.classList.contains('dark')?'light':'dark');});
  var form=document.getElementById('developerEnquiry'),draft=document.getElementById('draftText'),link=document.getElementById('enquiryMail'),status=document.getElementById('enquiryStatus');
  form.addEventListener('submit',function(event){
    event.preventDefault();
    var project=document.getElementById('projectName').value.trim(),locality=document.getElementById('projectLocality').value.trim(),stage=document.getElementById('projectStage').value;
    if(!project||!locality){status.textContent='Enter a project name and locality before preparing the enquiry.';return;}
    var body='Hello Ecological Registry,\n\nI would like to discuss a development pilot.\n\nProject or organisation: '+project+'\nSuburb or municipality: '+locality+'\nCurrent stage: '+stage+'\n\nCould we discuss a pre-works ecological baseline, independent assessment, delivery checks and establishment follow-up?\n\nI understand this is a proposed pilot, with scope, costs and responsibilities to be agreed.\n\nRegards,\n';
    draft.value=body;link.href='mailto:hello@gardenerandson.com?subject='+encodeURIComponent('Ecological Registry development pilot — '+project)+'&body='+encodeURIComponent(body);
    document.getElementById('enquiryDraft').hidden=false;status.textContent='Draft prepared. Review it below, then open your email app or copy the text.';
  });
  form.addEventListener('input',function(){document.getElementById('enquiryDraft').hidden=true;draft.value='';status.textContent='';link.href='mailto:hello@gardenerandson.com';});
  document.getElementById('copyEnquiry').addEventListener('click',function(){navigator.clipboard.writeText(draft.value).then(function(){status.textContent='Draft copied. Paste it into your email app and review before sending.';}).catch(function(){status.textContent='Select and copy the draft text above.';});});
})();
