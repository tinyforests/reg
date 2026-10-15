/* Upgrade enquiries require server-verified stewardship and consent per request. */
(function(root){
  'use strict';
  var ENDPOINT='https://script.google.com/macros/s/AKfycbwGIau58khBRKYgq5SYwu0QjCWPa5h2dKyz4nPoeU9YMKlPN5BRXUz0LmzF7jZrqrRC/exec';
  function routeable(id){return /^(water_feature|rocks|logs|nest_boxes|moisture_basin|rainwater|swale|indigenous_dominant|soil_health_up|water_function_up|species_to_(6|12|20|30)|layers_to_(2|3|4|5)|canopy_to_(5|15|30|50)|nodes_to_(1|3|5))$/.test(id);}
  root.attachUpgradeRouting=function(record){
    var host=document.getElementById('opportunityList');if(!host)return;
    host.querySelectorAll('[data-opp-id]').forEach(function(card){
      var id=card.dataset.oppId;if(!routeable(id))return;
      var button=document.createElement('button');button.type='button';button.className='text-xs underline mt-3 block';button.textContent='Get help with this upgrade';card.append(button);
      button.onclick=function(){
        var session=typeof getStewardSession==='function'?getStewardSession(record.garden_id):null;
        if(!session){var notice=document.createElement('p');notice.className='text-xs mt-2';notice.textContent='Unlock this garden using your steward email link before requesting help.';card.append(notice);return;}
        button.disabled=true;
        var form=document.createElement('form');form.className='border-t border-current mt-3 pt-3 text-xs';
        var label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.required=true;
        label.append(check,document.createTextNode(' I agree to this request going first to the garden’s original designer, with 14 days to respond, then to Gardener & Son if declined or unanswered. My email will be shared with the practice that accepts, or with Gardener & Son when released. This consent applies to this request only.'));
        var submit=document.createElement('button');submit.type='submit';submit.textContent='Send upgrade enquiry';submit.className='underline block mt-3';
        var cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.className='underline block mt-2';
        var status=document.createElement('p');status.setAttribute('role','status');form.append(label,submit,cancel,status);card.append(form);
        cancel.onclick=function(){form.remove();button.disabled=false;};
        form.onsubmit=function(e){e.preventDefault();if(!check.checked)return;submit.disabled=true;status.textContent='Recording your request…';
          fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({submission_type:'upgrade_routing',action:'create_request',garden_id:record.garden_id,opportunity_id:id,session_token:session,steward_consent:true})}).then(function(r){if(!r.ok)throw Error('Service unavailable');return r.json();}).then(function(r){if(!r.ok)throw Error(r.error);status.textContent=(r.duplicate?'Existing request: ':'Request recorded: ')+r.request.request_id+' · '+r.request.status+'. No score or payment has changed.';submit.hidden=true;cancel.textContent='Close';}).catch(function(e){submit.disabled=false;status.textContent=e.message || 'Unable to send. Please try again.';});
        };
      };
    });
  };
})(typeof self!=='undefined'?self:this);
