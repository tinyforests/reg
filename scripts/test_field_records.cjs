const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const code=fs.readFileSync(path.join(__dirname,'appsscript/Code.gs'),'utf8');
const validator=code.slice(code.indexOf('function _validStewardSession('),code.indexOf('/* Load a stored record blob'));
const sheets={};function sheet(){const rows=[];return {rows,appendRow:r=>rows.push(r.slice()),setFrozenRows(){},getLastRow:()=>rows.length,getRange(r,c,n=1,w=1){return {getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,j)=>(rows[r-1+i]||[])[c-1+j]??'')),setValues(v){v.forEach((row,i)=>{rows[r-1+i]??=[];row.forEach((x,j)=>rows[r-1+i][c-1+j]=x);});},setValue(v){rows[r-1][c-1]=v;}};}};}
let uuid=0;const ss={getSheetByName:n=>sheets[n]||null,insertSheet:n=>sheets[n]=sheet()};
const ctx={SpreadsheetApp:{getActiveSpreadsheet:()=>ss},PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'secret'})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},Utilities:{formatDate:()=> '261020',getUuid:()=>String(++uuid).padStart(32,'0')},jsonResp:x=>JSON.parse(JSON.stringify(x)),STEWARD_SESSION_SHEET:'Steward Sessions',STEWARD_SESSION_DAYS:30};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'appsscript/Plants.gs'),'utf8')+'\n'+validator+'\n'+fs.readFileSync(path.join(__dirname,'appsscript/FieldRecords.gs'),'utf8'),ctx);
const [garden,other]=ctx.FR_GARDENS;const sessions=ss.insertSheet('Steward Sessions');sessions.appendRow(['garden','email','token','issued']);sessions.appendRow([garden,'private@example.com','owner',new Date().toISOString()]);sessions.appendRow([other,'other@example.com','other',new Date().toISOString()]);sessions.appendRow([garden,'old@example.com','expired',new Date(Date.now()-40*86400000).toISOString()]);
const call=p=>ctx.handleFieldRecord(p), admin=p=>call({...p,admin_token:'secret'}),id='a'.repeat(32);
const entry={source_id:id,title:'Private title',body:'Private note',garden_id:garden,project_ids:['b'.repeat(32)],assets:[{archive_path:'private/location.jpg'}]};
assert.equal(call({op:'import',entries:[entry]}).ok,false);
assert.equal(admin({op:'import',entries:[entry,entry]}).imported,1);
assert.equal(admin({op:'import',entries:[{...entry,body:'Replacement'}]}).skipped,1);
for(const session_token of ['', 'other','expired']) assert.equal(call({op:'list',garden_id:garden,session_token}).records.length,0);
assert.equal(call({op:'list',garden_id:garden,session_token:'owner'}).records[0].body,'Private note');
assert.equal(admin({op:'publish',garden_id:garden,source_id:id,public:true}).ok,false);
assert.equal(call({op:'publish',garden_id:garden,session_token:'other',source_id:id,public:true}).ok,false);
assert.equal(call({op:'publish',garden_id:garden,session_token:'owner',source_id:id,public:true}).ok,true);
const pub=call({op:'list',garden_id:garden}).records[0];assert.equal(pub.body,'Private note');assert(!JSON.stringify(pub).includes(id));assert(!('assets'in pub));assert(!('source_url'in pub));
assert.equal(call({op:'publish',garden_id:garden,session_token:'owner',source_id:id,public:false}).ok,true);
assert.equal(call({op:'list',garden_id:garden}).records.length,0);
assert.equal(admin({op:'import',entries:[{...entry,source_id:'c'.repeat(32),garden_id:''}]}).imported,1);
assert.equal(admin({op:'list'}).records.length,2);assert.equal(call({op:'list'}).ok,false);
assert.equal(admin({op:'import',entries:[{...entry,source_id:'d'.repeat(32),body:'x'.repeat(50000)}]}).ok,false);
assert.equal(admin({op:'import',entries:[{...entry,garden_id:'fake'}]}).ok,false);
// Explicit project matching links pending notes and revokes old publication.
ctx._plImport([{name:'Private project',source:'notion-design:'+'b'.repeat(32),internal_notes:'Private narrative'}]);
var project=ctx._plListProjects()[0];
assert.equal(ctx._plSaveProject({...project,garden_id:other}).ok,false);
assert.equal(admin({op:'link_project',project_id:'b'.repeat(32),garden_id:other}).linked,2);
assert.equal(call({op:'list',garden_id:garden,session_token:'owner'}).records.length,0);
assert.equal(call({op:'list',garden_id:other,session_token:'other'}).records.length,2);
assert.equal(call({op:'list',garden_id:other}).records.length,0);
assert.equal(admin({op:'link_project',project_id:'b'.repeat(32),garden_id:'fake'}).ok,false);
if(process.argv[2]){const bundle=JSON.parse(fs.readFileSync(process.argv[2]));bundle.entries.forEach(e=>ctx._frEntry(e));assert(bundle.projects.every(p=>!p.garden_id||ctx._frGarden(p.garden_id)));console.log('All migration records validated');}
console.log('field records: access, publication, revocation, idempotency and validation passed');
