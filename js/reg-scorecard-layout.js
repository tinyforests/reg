/* Presentation adapter: retain existing IDs and engine-rendered values. */
(function () {
  'use strict';
  var profile = document.getElementById('ecoCard');
  var host = profile || document.querySelector('.home-eco-card');
  if (!host || host.classList.contains('reg-scorecard')) return;
  var card = host.querySelector('.card');
  var ids = profile ? { score:'ecScore', tier:'ecTier', hero:'ecHero', count:'ecBadgeCount', next:'ecNext', track:'ecTrack', badges:'ecBadges', name:'heroName', identity:'heroId' } : { score:'heroScore', tier:'heroTier', hero:'homeScoreHero', count:'homeBadgeCount', next:'homeNextLevel', track:'homeLevelTrack', badges:'homeBadges', name:'heroIdentity', identity:'heroGardenId' };
  var get = function (key) { return document.getElementById(ids[key]); };
  var score = get('score'), tier = get('tier'), hero = get('hero');
  if (!card || !score || !tier || !hero) return;
  function node(tag, cls, text) { var n=document.createElement(tag); n.className=cls; if(text)n.textContent=text; return n; }
  host.classList.add('reg-scorecard');
  var of = hero.querySelector('.of') || node('span','of'); of.textContent='/ 100';
  var scoreBox=node('div','reg-total reg-score-total');
  var scoreRow=node('div','reg-total-value'); scoreRow.appendChild(score);scoreRow.appendChild(of);scoreBox.appendChild(scoreRow);scoreBox.appendChild(node('div','reg-total-label','Score'));
  var badgeBox=node('div','reg-total reg-badge-total');var badgeRow=node('div','reg-total-value');var badgeNumber=node('span','reg-badge-number','—'),badgeOf=node('span','of');badgeRow.appendChild(badgeNumber);badgeRow.appendChild(badgeOf);badgeBox.appendChild(badgeRow);badgeBox.appendChild(node('div','reg-total-label','Badges earned'));
  card.insertBefore(tier,hero.nextSibling);tier.classList.add('reg-rating');
  hero.replaceChildren(scoreBox,badgeBox);

  var next=get('next'),track=get('track');
  var progress=node('div','reg-assessed-progress');progress.setAttribute('role','img');var fill=node('span','');progress.appendChild(fill);
  var notes=node('div','reg-progress-notes');var now=node('span','');notes.appendChild(now);if(next)notes.appendChild(next);
  var progression=node('div','reg-assessed-wrap');progression.appendChild(progress);progression.appendChild(notes);tier.insertAdjacentElement('afterend',progression);
  var footer=node('footer','reg-card-footer');var name=node('p','reg-card-name');var verification=node('p','reg-card-verification');var identity=node('p','reg-card-identity');footer.appendChild(name);footer.appendChild(verification);
  // Keep homepage's existing identity node; profiles use a display copy of public identity.
  if (!profile && get('identity')) footer.appendChild(get('identity')); else footer.appendChild(identity);
  if (!profile) card.appendChild(footer);

  function sync() {
    var count=get('count');var raw=count?count.textContent.trim():'';var match=raw.match(/^(\d+)\s*(?:of|\/)\s*(\d+)$/i);
    badgeNumber.textContent=match?match[1]:(/withheld/i.test(raw)?'—':'—');badgeOf.textContent=match?'/ '+match[2]:'';
    badgeBox.setAttribute('aria-label',/withheld/i.test(raw)?'Badges withheld pending verification':match?match[1]+' of '+match[2]+' badges earned':'Badge count not available');
    badgeBox.classList.toggle('is-withheld',/withheld/i.test(raw));
    var value=Number(score.textContent);var known=score.textContent.trim()!=='' && /^\d+(?:\.\d+)?$/.test(score.textContent.trim());
    fill.style.width=known?Math.max(0,Math.min(100,value))+'%':'0%';now.textContent=known?'Now '+score.textContent:'Score unavailable';progress.setAttribute('aria-label',known?'Assessed score '+score.textContent+' of 100':'Assessed score unavailable');
    var nameSource=get('name');name.textContent=nameSource?nameSource.textContent:'';
    if(profile){var idSource=get('identity');identity.textContent=idSource?idSource.textContent:'';var tags=document.getElementById('heroTags');verification.textContent=tags&&tags.lastElementChild?tags.lastElementChild.textContent:'';}
    else {var source=document.querySelector('.home-card-verification');verification.textContent=source?source.textContent:'';}
    if(track)track.querySelectorAll('[data-tier],[title]').forEach(function(dot){dot.tabIndex=0;dot.setAttribute('aria-label',dot.getAttribute('data-tier')||dot.title);});
    var grid=get('badges');if(grid)grid.querySelectorAll('.badge').forEach(function(badge){
      var defs=window.BADGE_DEFINITIONS||{};var text=badge.textContent.trim().toLowerCase();var key=Object.keys(defs).find(function(k){return (defs[k].name||'').toLowerCase()===text;});
      if(key){badge.dataset.description=defs[key].description||'';badge.tabIndex=0;badge.setAttribute('aria-label',badge.textContent+': '+badge.dataset.description);}
    });
  }
  sync();
  // Observe only upstream render targets; never write back to scoring data.
  ['score','count','name','next','track','badges'].forEach(function(key){var target=get(key);if(target)new MutationObserver(function(records){if(records.some(function(r){return r.type==='childList'||r.type==='characterData';}))sync();}).observe(target,{childList:true,characterData:true,subtree:true});});
  ['heroTags','heroId','heroVerification','heroVerifiedDate'].forEach(function(id){var target=document.getElementById(id);if(target)new MutationObserver(sync).observe(target,{childList:true,characterData:true,subtree:true});});
})();
