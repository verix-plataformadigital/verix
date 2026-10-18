(function(){
'use strict';

const vxMobileViewport = (
  (window.matchMedia && window.matchMedia('(max-width:1199px)').matches) ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent||'')
);
if(!vxMobileViewport) return;

function esc(text){
  return String(text||'').replace(/\s+/g,' ').trim();
}

function labelOf(el){
  return esc(el && (el.getAttribute('aria-label') || el.title || el.innerText || el.textContent));
}

function isUsableNavItem(el){
  if(!el) return false;
  if(el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
  const t=labelOf(el).toLowerCase();
  if(!t || t.length>48) return false;
  if(/^(menu|mais|fechar|close|sair|logout|entrar|login|admin)$/i.test(t)) return false;
  return true;
}

function findNavigation(){
  const selectors=[
    'nav',
    'aside',
    '[role="navigation"]',
    '[class*="sidebar"]',
    '[class*="side-nav"]',
    '[class*="sidenav"]',
    '[id*="sidebar"]',
    '[id*="sideNav"]'
  ];
  const seen=new Set(), out=[];
  selectors.forEach(s=>{
    document.querySelectorAll(s).forEach(el=>{
      if(seen.has(el)) return;
      seen.add(el);
      const items=[...el.querySelectorAll('button,a,[role="button"]')].filter(isUsableNavItem);
      if(items.length) out.push({root:el,items});
    });
  });
  out.sort((a,b)=>b.items.length-a.items.length);
  return out[0] || null;
}

/* A viewport dinâmica é tratada por CSS com 100dvh e safe-area-inset.
   Não mantemos estado de viewport em JavaScript quando o CSS já o resolve. */

document.documentElement.classList.add('vx-mobile-ready');
document.body.classList.add('vx-mobile-mode');

/* Dismiss the mobile keyboard when a vehicle consultation starts.
   Broad matching is intentional: the consultation button markup varies by module. */
function dismissKeyboardOnConsult(event){
  const target=event.target;
  if(!target || typeof target.closest!=='function') return;
  const button=target.closest('button,input[type="submit"],input[type="button"],[role="button"],.consult');
  const label=labelOf(button).toLowerCase();
  const isConsultButton=!!button && (/consultar|consult|pesquisar|pesquisa/.test(label) ||
    button.matches('.command .searchbar .consult'));
  const form=event.type==='submit' && target.matches && target.matches('form')
    ? target
    : (isConsultButton ? (button.closest('form') || button.closest('.command') || button.closest('.searchbar') || document) : null);
  if(!form) return;

  const blurActive=()=>{
    try{
      const active=document.activeElement;
      if(active && /INPUT|TEXTAREA|SELECT/.test(active.tagName) && typeof active.blur==='function') active.blur();
      if(form.querySelectorAll) form.querySelectorAll('input,textarea,select').forEach(field=>{
        if(typeof field.blur==='function') field.blur();
      });
    }catch(_){}
  };
  blurActive();
  // Some Android keyboards reopen when the page's submit handler moves focus.
  [0,80,220,450].forEach(delay=>setTimeout(blurActive,delay));
}

document.addEventListener('pointerdown',dismissKeyboardOnConsult,true);
document.addEventListener('click',dismissKeyboardOnConsult,true);
document.addEventListener('submit',dismissKeyboardOnConsult,true);

document.querySelectorAll('input,textarea,select').forEach(el=>{
  const hint=(el.placeholder+' '+el.name+' '+el.id+' '+el.getAttribute('aria-label')).toLowerCase();
  if(/matr[ií]cula|placa|ve[ií]culo|license|registration/.test(hint)){
    el.setAttribute('inputmode','text');
    el.setAttribute('autocapitalize','characters');
    el.setAttribute('spellcheck','false');
  }
});

document.querySelectorAll('table').forEach(table=>{
  if(table.parentElement && table.parentElement.classList.contains('vx-scroll-x')) return;
  const wrap=document.createElement('div');
  wrap.className='vx-scroll-x';
  table.parentNode.insertBefore(wrap,table);
  wrap.appendChild(table);
});

/* Conteúdo dinâmico mobile: apenas semântica e scroll de tabelas.
   O layout é definido pelo CSS; não escrevemos estilos inline nem medimos
   repetidamente todos os elementos após cada mutação. */
function prepareMobileSubtree(root){
  if(!root || root.nodeType!==1) return;

  const fields=[];
  if(root.matches && root.matches('input,textarea,select')) fields.push(root);
  if(root.querySelectorAll) fields.push(...root.querySelectorAll('input,textarea,select'));
  fields.forEach(el=>{
    const hint=[el.placeholder,el.name,el.id,el.getAttribute('aria-label')].join(' ').toLowerCase();
    if(/matr[ií]cula|placa|ve[ií]culo|license|registration/.test(hint)){
      el.setAttribute('inputmode','text');
      el.setAttribute('autocapitalize','characters');
      el.setAttribute('spellcheck','false');
    }
  });

  const tables=[];
  if(root.matches && root.matches('table')) tables.push(root);
  if(root.querySelectorAll) tables.push(...root.querySelectorAll('table'));
  tables.forEach(table=>{
    if(!table.parentNode || (table.parentElement && table.parentElement.classList.contains('vx-scroll-x'))) return;
    const wrapper=document.createElement('div');
    wrapper.className='vx-scroll-x';
    table.parentNode.insertBefore(wrapper,table);
    wrapper.appendChild(table);
  });
}

/* Só analisamos nós adicionados. Não há MutationObserver a medir a página,
   a alterar largura/grelhas nem a disputar o layout com as regras CSS. */
function handleMobileContentAdded(records){
  const candidates=new Set();
  for(const record of records||[]){
    for(const node of record.addedNodes||[]){
      if(node && node.nodeType===1) candidates.add(node);
    }
  }
  if(!candidates.size) return;

  const roots=[...candidates].filter(node=>{
    let parent=node.parentElement;
    while(parent && parent!==document.body){
      if(candidates.has(parent)) return false;
      parent=parent.parentElement;
    }
    return true;
  });
  roots.forEach(prepareMobileSubtree);
}

const mobileContentObserver=new MutationObserver(handleMobileContentAdded);
mobileContentObserver.observe(document.body,{childList:true,subtree:true});

const nav=findNavigation();

const top=document.createElement('div');
top.id='vxMobileTop';
top.innerHTML='<div class="vx-brand"><span class="vx-brand-text">VÉRIX <b>///</b> MOBILE</span></div><button type="button" id="vxMobileBack" class="vx-mobile-back" aria-label="Voltar ao menu anterior" title="Voltar ao menu anterior"><span aria-hidden="true">←</span><span>Voltar</span></button><button type="button" id="vxMobileMenu" aria-label="Abrir menu">☰</button>';
document.body.appendChild(top);

function syncMobileBackState(){
  const button=document.getElementById('vxMobileBack');
  if(!button) return;
  const body=document.body;
  const home=document.getElementById('mainMenuScreen');
  const module=document.getElementById('moduleOverlay');
  const history=document.getElementById('historyOverlay');
  const moduleOpen=!!(module && module.classList.contains('show'));
  const historyOpen=!!(history && history.classList.contains('show'));
  const atHome=body.classList.contains('main-menu-active') || !!(home && home.classList.contains('show'));
  const canGoBack=historyOpen || moduleOpen ||
    body.classList.contains('consultation-screen-active') ||
    body.classList.contains('fixed-workspace-active') ||
    body.classList.contains('history-page-active') ||
    body.classList.contains('cinemometro-page-active');
  const enabled=canGoBack && !(atHome && !historyOpen && !moduleOpen);
  button.disabled=!enabled;
  button.setAttribute('aria-disabled',String(!enabled));
  button.title=enabled?'Voltar ao menu anterior':'Já está no menu principal';
}

function voltarMenuAnteriorMobile(){
  closeDrawer();
  const body=document.body;
  const module=document.getElementById('moduleOverlay');
  const history=document.getElementById('historyOverlay');
  if((body.classList.contains('history-page-active') || (history && history.classList.contains('show'))) &&
     typeof window.fecharHistorico==='function'){
    window.fecharHistorico();
  }else if(module && module.classList.contains('show') && typeof window.fecharModulo==='function'){
    window.fecharModulo();
  }else if(body.classList.contains('main-menu-active')){
    syncMobileBackState();
    return;
  }else if(typeof window.mostrarMenuPrincipal==='function'){
    window.mostrarMenuPrincipal();
  }else{
    const fallback=document.getElementById('consultationBackBtn');
    if(fallback) fallback.click();
  }
  syncMobileBackState();
  setTimeout(syncMobileBackState,80);
}

document.getElementById('vxMobileBack').addEventListener('click',voltarMenuAnteriorMobile);
const mobileBackStateObserver=new MutationObserver(syncMobileBackState);
[document.body,document.getElementById('mainMenuScreen'),document.getElementById('moduleOverlay'),document.getElementById('historyOverlay')]
  .filter(Boolean)
  .forEach(el=>mobileBackStateObserver.observe(el,{attributes:true,attributeFilter:['class']}));
syncMobileBackState();

const bar=document.createElement('div');
bar.id='vxMobileBar';
document.body.appendChild(bar);

const overlay=document.createElement('div');
overlay.id='vxMobileOverlay';
document.body.appendChild(overlay);

function closeDrawer(){
  if(nav && nav.root) nav.root.classList.remove('vx-mobile-drawer');
  overlay.classList.remove('is-open');
}

function openDrawer(){
  if(!nav || !nav.root) return;
  nav.root.classList.add('vx-mobile-drawer');
  overlay.classList.add('is-open');
}

document.getElementById('vxMobileMenu').addEventListener('click',()=>{
  const visible=overlay.classList.contains('is-open');
  if(visible) closeDrawer(); else openDrawer();
});
overlay.addEventListener('click',closeDrawer);

if(nav){
  const items=[];
  const used=new Set();
  nav.items.forEach(el=>{
    const t=labelOf(el);
    const k=t.toLowerCase();
    if(used.has(k)) return;
    used.add(k);
    items.push(el);
  });
  const preferred=items.filter(el=>/seguro|ve[ií]culo|cinem[oó]metro|legisla|[aá]lcool|hist[oó]rico|consulta|pesquisa/i.test(labelOf(el))).slice(0,4);
  const chosen=preferred.length>=2?preferred:items.slice(0,4);

  const menuBtn=document.createElement('button');
  menuBtn.type='button';
  menuBtn.innerHTML='<span class="vx-icon">☰</span>Menu';
  menuBtn.addEventListener('click',()=>{
    const visible=overlay.classList.contains('is-open');
    if(visible) closeDrawer(); else openDrawer();
  });
  bar.appendChild(menuBtn);

  chosen.slice(0,4).forEach((el,i)=>{
    const b=document.createElement('button');
    b.type='button';
    const txt=esc(labelOf(el));
    const icon=/seguro/i.test(txt)?'🛡':/cinem/i.test(txt)?'⏱':/legis/i.test(txt)?'⚖':/[aá]lcool/i.test(txt)?'◉':/ve[ií]culo|consulta|pesquisa/i.test(txt)?'⌕':(i===0?'⌂':'◆');
    b.innerHTML='<span class="vx-icon">'+icon+'</span>'+txt;
    b.addEventListener('click',()=>{
      closeDrawer();
      try{el.click();}catch(e){}
      setTimeout(()=>window.scrollTo({top:0,behavior:'smooth'}),60);
    });
    bar.appendChild(b);
  });
}else{
  const b=document.createElement('button');
  b.type='button';
  b.innerHTML='<span class="vx-icon">⌕</span>Matrícula';
  b.addEventListener('click',()=>{
    const input=document.getElementById('MatriculaVeiculo');
    if(input){
      input.scrollIntoView({block:'center',behavior:'smooth'});
      setTimeout(()=>input.focus({preventScroll:true}),180);
    }else{
      window.scrollTo({top:0,behavior:'smooth'});
    }
  });
  bar.appendChild(b);
}

document.addEventListener('focusin',e=>{
  const el=e.target;
  if(!el || !/INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
  setTimeout(()=>{
    try{el.scrollIntoView({block:'center',behavior:'smooth'});}catch(_){}
  },220);
},{passive:true});

window.VERIX_MOBILE_ADAPTER={version:'1.0',navigation:!!nav};
})();
