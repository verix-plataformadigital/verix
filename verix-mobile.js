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

/* Ajuste responsivo de recurso para conteúdo dinâmico.
   A normalização é limitada ao módulo/área afetada, em vez de percorrer todo o body. */
const mobileStyleOverrides=new WeakMap();

function stylePropertyName(prop){
  return prop.replace(/[A-Z]/g,char=>'-'+char.toLowerCase());
}

function restoreMobileOverrides(root){
  if(!root || root.nodeType!==1) return;
  const elements=[root,...root.querySelectorAll('*')];
  elements.forEach(el=>{
    const state=mobileStyleOverrides.get(el);
    if(!state) return;
    state.forEach((saved,prop)=>{
      const cssName=stylePropertyName(prop);
      if(el.style[prop]!==saved.applied) return;
      if(saved.originalValue){
        el.style.setProperty(cssName,saved.originalValue,saved.originalPriority);
      }else{
        el.style.removeProperty(cssName);
      }
    });
    mobileStyleOverrides.delete(el);
  });
}

function normalizeMobileLayout(root,resetPatches=false){
  if(!root || root.nodeType!==1) return;
  const vw=Math.max(document.documentElement.clientWidth||0,window.innerWidth||0);

  // Restore inline values owned by this normalizer so they cannot leak across
  // device rotation or a switch from mobile/tablet to desktop width.
  if(resetPatches || vw>1199) restoreMobileOverrides(root);
  if(vw>1199) return;

  const protectedFromNormalization=el=>!!(el && el.nodeType===1 &&
    (el.id==='mainMenuScreen' ||
     (el.closest && el.closest('#mainMenuScreen,#vxMobileTop,#vxMobileBar,#vxMobileOverlay'))));
  if(protectedFromNormalization(root)) return;

  const all=[root,...root.querySelectorAll('*')].filter(el=>!protectedFromNormalization(el));
  const patches=new Map();
  const patch=(el,prop,value)=>{
    const current=el.style[prop];
    const saved=mobileStyleOverrides.get(el);
    if(current===value){
      if(saved && saved.has(prop) && saved.get(prop).applied!==value){
        saved.delete(prop);
        if(!saved.size) mobileStyleOverrides.delete(el);
      }
      return;
    }
    let styles=patches.get(el);
    if(!styles){styles={};patches.set(el,styles);}
    styles[prop]=value;
  };

  // Read the affected region first, then write styles once per element.
  for(const el of all){
    const cs=getComputedStyle(el);
    const rect=el.getBoundingClientRect();

    if(rect.width>vw+2){
      patch(el,'maxWidth','100%');
      patch(el,'width','100%');
    }

    if(cs.display==='grid'){
      const cols=cs.gridTemplateColumns;
      const children=[...el.children].filter(child=>getComputedStyle(child).display!=='none');
      if(children.length>=2 && children.length<=6 && rect.width>=vw*.72){
        const rects=children.map(child=>child.getBoundingClientRect());
        const top=rects[0]?.top||0;
        const bottom=rects[0]?.bottom||0;
        const firstRow=rects.filter(item=>item.top<bottom && item.bottom>top);
        const wide=firstRow.length>=2 && firstRow.reduce((sum,item)=>sum+item.width,0)>vw*.72;
        if(wide || /repeat\(|minmax|\b1fr\b/.test(cols)){
          patch(el,'gridTemplateColumns','minmax(0,1fr)');
          patch(el,'gridTemplateRows','none');
        }
      }
    }

    if(cs.display==='flex' && cs.flexDirection==='row'){
      const children=[...el.children].filter(child=>getComputedStyle(child).display!=='none');
      if(children.length===2 && rect.width>=vw*.72){
        const rects=children.map(child=>child.getBoundingClientRect());
        if(rects.every(item=>item.width>vw*.22) && Math.abs(rects[0].top-rects[1].top)<80){
          patch(el,'flexDirection','column');
          patch(el,'alignItems','stretch');
        }
      }
    }
  }

  patches.forEach((styles,el)=>{
    let saved=mobileStyleOverrides.get(el);
    if(!saved){saved=new Map();mobileStyleOverrides.set(el,saved);}
    Object.entries(styles).forEach(([prop,value])=>{
      const cssName=stylePropertyName(prop);
      if(!saved.has(prop)){
        saved.set(prop,{
          originalValue:el.style.getPropertyValue(cssName),
          originalPriority:el.style.getPropertyPriority(cssName),
          applied:value
        });
      }else{
        const prior=saved.get(prop);
        if(el.style[prop]!==prior.applied){
          prior.originalValue=el.style.getPropertyValue(cssName);
          prior.originalPriority=el.style.getPropertyPriority(cssName);
        }
        prior.applied=value;
        saved.set(prop,prior);
      }
      el.style[prop]=value;
    });
  });
}

function normalizationRegions(){
  const candidates=[
    document.querySelector('.command'),
    document.querySelector('.main'),
    document.getElementById('moduleBody'),
    document.querySelector('.history-body')
  ].filter(Boolean);
  return [...new Set(candidates)].filter(root=>
    !candidates.some(other=>other!==root && other.contains(root))
  );
}

function normalizeKnownRegions(resetPatches=false){
  normalizationRegions().forEach(root=>normalizeMobileLayout(root,resetPatches));
}

const pendingLayoutRoots=new Set();

function layoutRegionFor(target){
  let node=target;
  if(!node || node.nodeType!==1) node=node?.parentElement;
  if(!node || node===document.body || node===document.documentElement) return null;
  if(node.closest && node.closest('#mainMenuScreen,#vxMobileTop,#vxMobileBar,#vxMobileOverlay')) return null;
  return (node.closest && node.closest('#moduleBody,.module-body,.history-body,.main,.command')) || node;
}

function queueLayoutNormalization(records){
  for(const record of records||[]){
    const region=layoutRegionFor(record.target);
    if(region) pendingLayoutRoots.add(region);
  }
  if(!pendingLayoutRoots.size) return;

  clearTimeout(window.__vxMobileLayoutTimer);
  window.__vxMobileLayoutTimer=setTimeout(()=>{
    const roots=[...pendingLayoutRoots];
    pendingLayoutRoots.clear();
    const targets=roots.filter(root=>!roots.some(other=>other!==root && other.contains(root)));
    targets.forEach(root=>normalizeMobileLayout(root));
  },60);
}

requestAnimationFrame(()=>normalizeKnownRegions());

const observer=new MutationObserver(queueLayoutNormalization);
observer.observe(document.body,{childList:true,subtree:true});

window.addEventListener('resize',()=>{
  clearTimeout(window.__vxMobileResizeTimer);
  window.__vxMobileResizeTimer=setTimeout(()=>normalizeKnownRegions(true),120);
},{passive:true});

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
overlay.style.cssText='display:none;position:fixed;inset:0;z-index:2147482998;background:rgba(0,0,0,.48);';
document.body.appendChild(overlay);

function closeDrawer(){
  if(nav && nav.root){
    nav.root.classList.remove('vx-mobile-drawer');
    nav.root.style.removeProperty('display');
    nav.root.style.removeProperty('position');
    nav.root.style.removeProperty('inset');
    nav.root.style.removeProperty('z-index');
    nav.root.style.removeProperty('width');
    nav.root.style.removeProperty('max-width');
    nav.root.style.removeProperty('overflow');
    nav.root.style.removeProperty('background');
    nav.root.style.removeProperty('box-shadow');
  }
  overlay.style.display='none';
}

function openDrawer(){
  if(!nav || !nav.root) return;
  nav.root.classList.add('vx-mobile-drawer');
  nav.root.style.display='block';
  nav.root.style.position='fixed';
  nav.root.style.top='56px';
  nav.root.style.left='8px';
  nav.root.style.bottom='calc(72px + env(safe-area-inset-bottom,0px))';
  nav.root.style.width='min(86vw,340px)';
  nav.root.style.maxWidth='340px';
  nav.root.style.overflow='auto';
  nav.root.style.zIndex='2147482999';
  nav.root.style.background='var(--bg,#0d151a)';
  nav.root.style.boxShadow='0 20px 50px rgba(0,0,0,.45)';
  overlay.style.display='block';
}

document.getElementById('vxMobileMenu').addEventListener('click',()=>{
  const visible=overlay.style.display==='block';
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
    const visible=overlay.style.display==='block';
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
