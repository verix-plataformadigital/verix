
(function(){

const alias={
 'pneu':'pneumatico','pneus':'pneumaticos','pneumatico':'pneumatico','pneumaticos':'pneumaticos',
 'sem seguro':'seguro','seguro auto':'seguro','seguro automovel':'seguro','seguro automóvel':'seguro',
 'telefone':'telemovel','telemovel':'telemovel','telemóvel':'telemovel','passadeira':'passagem peoes','auto estrada':'autoestrada','autostrada':'autoestrada',
 'carta caducada':'carta','documento caducado':'documento','ficha caducada':'ficha', 'dua':'documentos',
 'inspecao':'inspeção','inspeçao':'inspeção','ipo':'inspecao','tipo 2':'tipo dois','tipo 3':'tipo tres'
};
const normalize10=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function expandedQuery10(v){let q=normalize10(v);Object.keys(alias).forEach(k=>{if(q.includes(normalize10(k)))q+=' '+normalize10(alias[k]);});return q;}

// Improve the search matcher without changing the visible wording.

window.filtrarLegislacao=function(valor){
 const raw=String(valor??'');
 const q=expandedQuery10(raw);
 const terms=q.split(/\s+/).filter(Boolean);
 const favBtn=document.querySelector('.leg-search-fav');
 const onlyFav=favBtn?.dataset.onlyFav==='1';
 const favs=window.VÉRIX10?.favSet?window.VÉRIX10.favSet():new Set();
 const panels=[...document.querySelectorAll('.leg-category-panel')];
 const buttons=[...document.querySelectorAll('.leg-category-grid .leg-category')];
 let total=0,firstCard=null;

 const cardText=c=>normalize10([
 c.querySelector('h3')?.textContent||'',
 c.querySelector('.leg-code-box')?.textContent||'',
 c.querySelector('.leg-meta-grid')?.textContent||c.querySelector('.leg-meta')?.textContent||'',
 c.querySelector('.leg-description-new')?.textContent||''
 ].join(' '));

 // Cada palavra pesquisada tem de existir, mas a ordem, acentos, maiúsculas,
 // hífenes, barras e restantes sinais deixam de importar.
 const textMatches=(text)=>!terms.length || terms.every(t=>text.includes(t));

 panels.forEach(p=>{
 let found=0;
 p.querySelectorAll('.leg-card-new').forEach(c=>{
 const match=textMatches(cardText(c));
 const favOk=!onlyFav||favs.has(window.VÉRIX10?.cardKey(c));
 const show=match&&favOk;
 c.style.display=show?'':'none';
 if(show){found++;total++;if(!firstCard)firstCard=c;}
 });
 p.classList.toggle('open',!!(q||onlyFav)&&found>0);
 });

 buttons.forEach(b=>{
 const m=(b.getAttribute('onclick')||'').match(/alternarCategoriaLeg\('([^']+)'/);
 const target=m?document.getElementById(m[1]):null;
 const has=!!(target&&target.querySelector('.leg-card-new:not([style*="display: none"])'));
 b.style.display=(q||onlyFav)?(has?'':'none'):'';
 b.classList.toggle('active',(q||onlyFav)&&has);
 });

 const grid=document.querySelector('.leg-category-grid');
 if(grid)grid.style.display=(q||onlyFav)?(buttons.some(b=>b.style.display!=='none')?'':'none'):'';
 const intro=document.querySelector('.leg-intro-new');
 if(intro)intro.style.display=(q||onlyFav)?'none':'';
 const rc=document.getElementById('legResultCount');
 if(rc)rc.textContent=String(total);
 const rm=document.getElementById('legResultMode');
 if(rm)rm.textContent=onlyFav?'APENAS FAVORITOS':(q?'RESULTADOS DA PESQUISA':'TODAS AS INFRAÇÕES');
 const bc=document.getElementById('legBreadcrumb');
 if(bc){
 const txt=document.getElementById('legBreadcrumbText');
 if(q||onlyFav){txt.textContent=q?'PESQUISA: '+raw:'FAVORITOS';bc.classList.add('show');}
 else bc.classList.remove('show');
 }
 if(firstCard)setTimeout(()=>firstCard.scrollIntoView({behavior:'smooth',block:'nearest'}),50);
 return total;
};

// A pesquisa por "/" fica limitada ao módulo Legislação para não roubar atalhos do browser.
document.addEventListener('keydown',e=>{
 if(e.key!=='/'||e.ctrlKey||e.altKey||e.metaKey||/input|textarea|select/i.test(e.target?.tagName||'')||e.target?.isContentEditable)return;
 const overlay=document.getElementById('moduleOverlay');
 const title=document.getElementById('moduleTitle')?.textContent||'';
 const s=document.getElementById('legSearch');
 if(overlay?.classList.contains('show')&&/LEGISLAÇÃO/i.test(title)&&s&&s.offsetParent!==null){e.preventDefault();s.focus();}
});
})();
