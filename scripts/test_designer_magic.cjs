const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
class Sheet{constructor(){this.rows=[]}appendRow(r){this.rows.push([...r])}setFrozenRows(){}getLastRow(){return this.rows.length}getRange(r,c,n=1,w=1){return{getValues:()=>this.rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w)),setValue:v=>{this.rows[r-1][c-1]=v}}}}
const sheets={},ss={getSheetByName:n=>sheets[n]||null,insertSheet:n=>sheets[n]=new Sheet()},cache=new Map(),emails=[];
let context={console,TOKEN_EXPIRY_MS:1800000,STEWARD_SESSION_DAYS:180,SpreadsheetApp:{getActiveSpreadsheet:()=>ss},PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'fixture-admin'})},Utilities:{DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1},computeDigest:(a,t)=>[...crypto.createHash('sha256').update(t).digest()],getUuid:()=>crypto.randomUUID()},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v)})},MailApp:{sendEmail:e=>emails.push(e)},UrlFetchApp:{fetch:u=>({getContentText:()=>JSON.stringify({gardens:[]})})},safeStr:(v,n)=>String(v||'').trim().slice(0,n),jsonResp:v=>v};
vm.createContext(context);let source=fs.readFileSync(__dirname+'/appsscript/Code.gs','utf8');vm.runInContext(source.slice(source.indexOf('/* Invited designer pilot.')),context);
let call=(action,data={})=>context.handleDesignerPortal({action,...data});
call('create_practice',{admin_token:'fixture-admin',designer_id:'fixture-practice',name:'Fixture',contact_email:'fixture@example.invalid'});
let safe=call('request_designer_access',{email:'unknown@example.invalid'});assert.equal(emails.length,0);
assert.equal(call('request_designer_access',{email:'fixture@example.invalid'}).message,safe.message);
let raw=emails[0].body.split('#designer_claim=')[1].split('\n')[0];assert.equal(raw.length,64);assert.ok(!JSON.stringify(sheets).includes(raw));
assert.equal(call('verify_designer_access',{token:'0'.repeat(64)}).ok,false);
let result=call('verify_designer_access',{token:raw});assert.equal(result.ok,true);assert.ok(result.session_token);assert.equal(call('verify_designer_access',{token:raw}).ok,false);
assert.equal(call('get_portfolio',{designer_token:result.session_token}).ok,true);
sheets['Designer Sessions'].rows[1][3]='2000-01-01T00:00:00Z';assert.equal(call('get_portfolio',{designer_token:result.session_token}).ok,false);
call('request_designer_access',{email:'fixture@example.invalid'});let expired=emails[1].body.split('#designer_claim=')[1].split('\n')[0];sheets['Designer Access Tokens'].rows[2][3]='2000-01-01T00:00:00Z';assert.equal(call('verify_designer_access',{token:expired}).ok,false);
call('request_designer_access',{email:'fixture@example.invalid'});let revoked=emails[2].body.split('#designer_claim=')[1].split('\n')[0];call('revoke_practice',{admin_token:'fixture-admin',designer_id:'fixture-practice'});assert.equal(call('verify_designer_access',{token:revoked}).ok,false);
call('request_designer_access',{email:'fixture@example.invalid'});assert.equal(emails.length,3);
console.log('Designer magic links: non-enumeration, hashing, one-use, expiry, practice revocation and rate limits passed.');
