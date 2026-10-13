(function () {
  'use strict';
  var root=document.documentElement, toggle=document.getElementById('brandTheme');
  function theme(mode) {root.classList.toggle('dark',mode==='dark');toggle.textContent=mode==='dark'?'Canopy':'Understory';try{localStorage.setItem('reg_mode',mode);}catch(e){}}
  var mode='dark';try{mode=localStorage.getItem('reg_mode')||localStorage.getItem('reg-theme')||'dark';}catch(e){}theme(mode);
  toggle.addEventListener('click',function(){theme(root.classList.contains('dark')?'light':'dark');});
  var form=document.getElementById('brandEnquiry'),draft=document.getElementById('brandDraftText'),link=document.getElementById('brandMail'),status=document.getElementById('brandStatus');
  form.addEventListener('submit',function(event){
    event.preventDefault();
    var project=document.getElementById('brandName').value.trim(),locality=document.getElementById('brandLocality').value.trim(),stage=document.getElementById('brandPathway').value;
    if(!project||!locality){status.textContent='Enter a brand name and locality before preparing the enquiry.';return;}
    var objectives=document.getElementById('brandIntent').value.trim();
    var body='Hello Ecological Registry,\n\nI would like to discuss a founding Yield sponsorship partnership.\n\nBrand or organisation: '+project+'\nLocality or region: '+locality+'\nSupport pathway: '+stage+'\nObjectives: '+(objectives||'To discuss')+'\n\nCould we explore participating gardens, a costed care programme, evidence and follow-up, and agreed sponsor acknowledgement?\n\nI understand Yield payments are not yet active and that scope and terms would be agreed before a partnership begins.\n\nRegards,\n';
    draft.value=body;link.href='mailto:hello@gardenerandson.com?subject='+encodeURIComponent('Yield brand sponsorship — '+project)+'&body='+encodeURIComponent(body);
    document.getElementById('brandDraft').hidden=false;status.textContent='Draft prepared. Review it below, then open your email app or copy the text.';
  });
  form.addEventListener('input',function(){document.getElementById('brandDraft').hidden=true;draft.value='';status.textContent='';link.href='mailto:hello@gardenerandson.com';});
  document.getElementById('brandCopy').addEventListener('click',function(){navigator.clipboard.writeText(draft.value).then(function(){status.textContent='Draft copied. Paste it into your email app and review before sending.';}).catch(function(){status.textContent='Select and copy the draft text above.';});});
})();
