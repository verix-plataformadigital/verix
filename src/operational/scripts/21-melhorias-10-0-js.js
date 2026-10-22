
(function(){
 const FAVORITOS_KEY='VÉRIX_LEGISLACAO_FAVORITOS_V1';
 const favSet=()=>{try{return new Set(JSON.parse(localStorage.getItem(FAVORITOS_KEY)||'[]'));}catch(e){return new Set();}};
 const saveFav=s=>{try{localStorage.setItem(FAVORITOS_KEY,JSON.stringify([...s]));}catch(e){}};
 const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const getSearch=()=>document.getElementById('legSearch');
 const cardKey=card=>{
 const code=card.querySelector('.leg-code-box strong')?.textContent.trim()||'';
 const title=card.querySelector('h3')?.textContent.trim()||'';
 const desc=card.querySelector('.leg-description-new')?.textContent.trim()||'';
 return norm(code+'|'+title+'|'+desc).slice(0,500);
 };
 // Pesquisa operacional: ignora acentos, maiúsculas/minúsculas e pontuação.
 // Também aceita expressões com espaços, hífenes e palavras parciais.
 const searchNorm=v=>norm(v).replace(/\s+/g,' ').trim();
 const searchTokens=v=>searchNorm(v).split(' ').filter(Boolean);
 window.VÉRIX10={favSet,saveFav,norm,cardKey,searchNorm,searchTokens};

 function decorateCards(){
 const favs=favSet();
 document.querySelectorAll('.leg-card-new').forEach(card=>{
 if(card.dataset.decorated==='1'){card.classList.toggle('is-favorite',favs.has(cardKey(card))); return;}
 card.dataset.decorated='1';
 const key=cardKey(card); card.dataset.favKey=key;
 const desc=card.querySelector('.leg-description-new');
 const code=card.querySelector('.leg-code-box strong')?.textContent.trim()||'';
 const meta=card.querySelector('.leg-meta');
 if(meta && !card.querySelector('.leg-meta-grid')){
 const text=meta.textContent.replace(/\s+/g,' ').trim();
 const grid=document.createElement('div'); grid.className='leg-meta-grid';
 const chip=document.createElement('div'); chip.className='leg-chip';
 chip.innerHTML='<strong>'+escapeHtml10(text.replace(/^COIMA \/ LIMITE:\s*/i,''))+'</strong>';
 grid.appendChild(chip); meta.replaceWith(grid);
 }
 const toolbar=document.createElement('div'); toolbar.className='leg-card-toolbar';
 const star=document.createElement('button'); star.className='leg-star'; star.type='button'; star.title='Adicionar aos favoritos'; star.textContent='★';
 star.addEventListener('click',e=>{e.stopPropagation();const set=favSet();const k=card.dataset.favKey;if(set.has(k)){set.delete(k);star.classList.remove('active');card.classList.remove('is-favorite');}else{set.add(k);star.classList.add('active');card.classList.add('is-favorite');}saveFav(set);updateFavButton();});
 const all=document.createElement('button'); all.className='copy-all-new'; all.type='button'; all.textContent='COPIAR TUDO';
 all.addEventListener('click',e=>{e.stopPropagation();let parts=[];const title=card.querySelector('h3')?.textContent.trim();if(title)parts.push(title);if(code)parts.push('Código: '+code);if(meta){const mt=meta.textContent.trim();if(mt)parts.push(mt);}if(desc)parts.push('Descrição: '+desc.textContent.trim());copyText10(parts.join('\n\n'),all);});
 toolbar.append(star,all); card.appendChild(toolbar);
 if(favs.has(key)) star.classList.add('active'),card.classList.add('is-favorite');
 });
 }
 function escapeHtml10(v){return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
 async function copyText10(text,btn){try{await navigator.clipboard.writeText(text);}catch(e){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}const old=btn.textContent;btn.textContent='✓ COPIADO';setTimeout(()=>btn.textContent=old,1200);}
 function updateFavButton(){const b=document.querySelector('.leg-search-fav');if(!b)return;const active=b.dataset.onlyFav==='1';b.classList.toggle('active',active);b.textContent=active?'TODAS':'FAVORITOS';}
 function ensureLegUI(){
 const body=document.getElementById('moduleBody'); if(!body||body.dataset.unt10==='1')return; body.dataset.unt10='1';
 const search=document.getElementById('legSearch'); if(!search)return;
 const fav=document.createElement('button'); fav.type='button'; fav.className='leg-search-fav'; fav.textContent='FAVORITOS'; fav.dataset.onlyFav='0'; fav.onclick=()=>{fav.dataset.onlyFav=fav.dataset.onlyFav==='1'?'0':'1';updateFavButton();filtrarLegislacao(search.value,true);};
 search.parentElement.insertBefore(fav,document.querySelector('.leg-search-hint'));
 const info=document.createElement('div');info.className='leg-result-info';info.innerHTML='<span><strong id="legResultCount">—</strong> resultados</span><span id="legResultMode">TODAS AS INFRAÇÕES</span>';
 search.parentElement.insertAdjacentElement('afterend',info);
 const bc=document.createElement('div');bc.className='leg-breadcrumb';bc.id='legBreadcrumb';bc.innerHTML='<span id="legBreadcrumbText"></span><button type="button" onclick="voltarCategoriasLeg10()">← VOLTAR</button>';
 info.insertAdjacentElement('afterend',bc);
 decorateCards();
 const version=document.createElement('div');version.className='leg-version';version.textContent='BASE LEGISLATIVA • CÓDIGO DA ESTRADA 2026 • RCE / RST / LEGISLAÇÃO COMPLEMENTAR • 3.ª ATUALIZAÇÃO'; body.appendChild(version);
 }
 window.voltarCategoriasLeg10=function(){
 document.querySelectorAll('.leg-category-panel').forEach(p=>p.classList.remove('open'));
 document.querySelectorAll('.leg-category').forEach(b=>{b.classList.remove('active');b.style.display='';});
 const g=document.querySelector('.leg-category-grid'); if(g)g.style.display='';
 const bc=document.getElementById('legBreadcrumb');if(bc)bc.classList.remove('show');
 const s=getSearch();if(s){s.value='';filtrarLegislacao('');s.focus();}
 window.scrollTo({top:0,behavior:'smooth'});
 };

 const originalOpen=window.abrirModulo;
 window.abrirModulo=function(nome,el){originalOpen.call(this,nome,el);if(nome==='legislacao'){setTimeout(ensureLegUI,0);}};

 
 const originalToggle=window.alternarCategoriaLeg;
 window.alternarCategoriaLeg=function(id,botao){
 const panel=document.getElementById(id); if(!panel)return;
 const was=panel.classList.contains('open'); originalToggle.call(this,id,botao);
 if(!was && panel.classList.contains('open')){
 const title=panel.querySelector('.leg-category-title strong')?.textContent.trim()||'MATÉRIA';
 const bc=document.getElementById('legBreadcrumb'); const txt=document.getElementById('legBreadcrumbText'); if(bc&&txt){txt.textContent=title;bc.classList.add('show');}
 decorateCards();
 setTimeout(()=>panel.scrollIntoView({behavior:'smooth',block:'start'}),60);
 }
 };

 // Atalhos F1–F4 removidos: evitam conflitos entre módulos e com o sistema.

  const oldSubmit=window.submitConjunto;
 window.submitConjunto=function(ev){
 const v=document.getElementById('MatriculaVeiculo'); if(v&&v.value.trim())v.value=v.value.trim().toUpperCase();
 const r=document.getElementById('MatriculaReboque'); if(r&&r.value.trim())r.value=r.value.trim().toUpperCase();
 return oldSubmit.call(this,ev);
 };
})();
