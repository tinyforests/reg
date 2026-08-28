const fs=require('fs'),path=require('path');
const {scoreV2}=require('/home/claude/v2/reg-score-v2.js');
const L=JSON.parse(fs.readFileSync('/home/claude/v2/locales/AU-VIC.json'));
const recs=JSON.parse(fs.readFileSync('/home/claude/v2/fixtures/examples.json'));
const pad=(s,n)=>String(s).padEnd(n), padL=(s,n)=>String(s).padStart(n);
console.log('\nH-010a — CURRENCY COMPARISON (shadow run 002)\n');
console.log(pad('site',30)+padL('EP',4)+padL('EC vol',9)+padL('EC leaf',9)+padL('LO vol',9)+padL('LO leaf',9)+padL('att%',7));
console.log('-'.repeat(78));
const rows=recs.map(r=>{
  const v=scoreV2(r,L,{currency:'volume'});
  const l=scoreV2(r,L,{currency:'leaf_area'});
  console.log(pad((r.label||'').slice(0,29),30)+padL(l.ecological_performance,4)
    +padL(v.ecological_contribution,9)+padL(l.ecological_contribution,9)
    +padL(v.latent_opportunity,9)+padL(l.latent_opportunity,9)
    +padL(Math.round(100*l.ecological_contribution/l.ecological_potential)+'%',7));
  return {r,v,l};
});
console.log('-'.repeat(78));
const ga=recs.map(r=>r.site_envelope.growing_area_m2);
const f=(k)=>rows.map(x=>x.l[k]);
const ratio=(arr)=>Math.round(arr[2]/arr[0]);
console.log(`\ngrowing-area ratio balcony->suburban : ${Math.round(ga[2]/ga[0])}x`);
console.log(`EC ratio  (volume)                   : ${ratio(rows.map(x=>x.v.ecological_contribution))}x`);
console.log(`EC ratio  (leaf_area)                : ${ratio(f('ecological_contribution'))}x`);
console.log('\nattainment% vs EP divergence (H-070):');
rows.forEach(x=>{
  const att=Math.round(100*x.l.ecological_contribution/x.l.ecological_potential);
  console.log(`  ${pad((x.r.label||'').slice(0,29),30)} EP ${padL(x.l.ecological_performance,3)}  att ${padL(att+'%',5)}  gap ${padL(x.l.ecological_performance-att,4)}`);
});
console.log('');
