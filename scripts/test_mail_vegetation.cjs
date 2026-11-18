const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let aliases=['hello@ecologicalregistry.org'],sent=[],drafts=[],attrs={'Pixel Value':9,'Raster.MVS_NAME':'Synthetic vegetation'};
const source=fs.readFileSync('scripts/appsscript/Code.gs','utf8');
const c=vm.createContext({GmailApp:{getAliases:()=>aliases,sendEmail:(...a)=>sent.push(a),createDraft:(...a)=>drafts.push(a)},PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})},UrlFetchApp:{fetch:()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({results:[{attributes:attrs}]})})}});
vm.runInContext(source,c);
for(const [score,tier] of [[0,'Foundation Garden'],[20,'Foundation Garden'],[21,'Habitat Garden'],[40,'Habitat Garden'],[41,'Ecological Garden'],[60,'Ecological Garden'],[61,'Rich Habitat Garden'],[65,'Rich Habitat Garden'],[80,'Rich Habitat Garden'],[81,'Ecosystem Garden'],[90,'Ecosystem Garden'],[91,'Urban Biodiversity Node'],[100,'Urban Biodiversity Node']])assert.equal(c.registryTierFromScore_(score),tier);
c.sendRegistryEmail_({to:'reader@example.invalid',subject:'Test',body:'Test',htmlBody:'<p>Test</p>',from:'ignored'});assert.equal(sent[0][3].from,'hello@ecologicalregistry.org');assert.equal(sent[0][3].htmlBody,'<p>Test</p>');
c.sendRegistryEmail_('reader@example.invalid','Test','Test');assert.equal(sent.length,2);
aliases=['hello@gardenerandson.com'];assert.throws(()=>c.sendRegistryEmail_('reader@example.invalid','Test','Test'),/refusing/);assert.throws(()=>c.createPlantOfferDraft_({},'reader@example.invalid','Test'),/refusing/);assert.equal(sent.length,2);aliases=['hello@ecologicalregistry.org'];
for(const region of ['SA','ACT']){const v=c.resolveEnrolmentContext_({garden_region:region,garden_lat:'-35',garden_lng:'149'}).original_vegetation;assert.equal(v.system,'MVS');assert.equal(v.code,'9');assert.equal(v.name,'Synthetic vegetation');}
assert.equal(c.resolveEnrolmentContext_({garden_region:'VIC',evc_code:'55',evc_name:'Plains Grassy Woodland'}).original_vegetation.system,'EVC');
attrs={'Pixel Value':'NoData'};assert.equal(c.resolveEnrolmentContext_({garden_region:'SA',garden_lat:'-35',garden_lng:'138'}),null);
c.createPlantOfferDraft_({steward_name:'Reader',garden_region:'SA'},'reader@example.invalid','Test garden');assert.equal(drafts.length,1);assert.match(drafts[0][2],/Test garden/);assert.match(drafts[0][2],/another way/);assert.match(drafts[0][2],/Talk soon, Tyson & Natasha/);assert.doesNotMatch(drafts[0][2],/postage/i);assert.equal(drafts[0][3].from,'hello@ecologicalregistry.org');
assert(!source.includes('MailApp.sendEmail'));
console.log('PASS tier boundaries, exact sender, refusal, MVS fallback, NoData and draft-only follow-up');
