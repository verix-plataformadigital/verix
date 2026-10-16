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

function setMobileViewport(){
  const vv=window.visualViewport;
  const h=Math.round((vv&&vv.height)||window.innerHeight||0);
  if(h>0) document.documentElement.style.setProperty('--vx-vh',h+'px');
}
setMobileViewport();
window.addEventListener('resize',setMobileViewport,{passive:true});
if(window.visualViewport){
  window.visualViewport.addEventListener('resize',setMobileViewport,{passive:true});
}

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

function normalizeMobileLayout(root=document.body){
  const vw=Math.max(document.documentElement.clientWidth||0,window.innerWidth||0);
  if(vw>1199) return;
  if(!root || root.nodeType!==1) root=document.body;

  // Work only within the changed layout region where possible. The previous
  // observer re-scanned every node in the document for each DOM mutation.
  const all=root===document.body
    ? [...root.querySelectorAll('*')]
    : [root,...root.querySelectorAll('*')];
  const patches=new Map();
  const patch=(el,prop,value)=>{
    if(el.style[prop]===value) return;
    let styles=patches.get(el);
    if(!styles){styles={};patches.set(el,styles);}
    styles[prop]=value;
  };

  // Read the layout first and apply style writes afterwards. This avoids
  // interleaving getBoundingClientRect() reads with inline-style writes,
  // which can force repeated synchronous layout recalculations.
  for(const el of all){
    const cs=getComputedStyle(el);
    const r=el.getBoundingClientRect();

    if(r.width>vw+2){
      patch(el,'maxWidth','100%');
      patch(el,'width','100%');
    }

    if(cs.display==='grid'){
      const cols=cs.gridTemplateColumns;
      const children=[...el.children].filter(c=>getComputedStyle(c).display!=='none');
      if(children.length>=2 && children.length<=6 && r.width>=vw*.72){
        const rects=children.map(c=>c.getBoundingClientRect());
        const firstRow=rects.filter(x=>x.top<(rects[0]?.bottom||0)&&x.bottom>(rects[0]?.top||0));
        const wide=firstRow.length>=2&&firstRow.reduce((n,x)=>n+x.width,0)>vw*.72;
        if(wide||/repeat\(|minmax|\b1fr\b/.test(cols)){
          patch(el,'gridTemplateColumns','minmax(0,1fr)');
          patch(el,'gridTemplateRows','none');
        }
      }
    }

    if(cs.display==='flex'&&cs.flexDirection==='row'){
      const children=[...el.children].filter(c=>getComputedStyle(c).display!=='none');
      if(children.length===2&&r.width>=vw*.72){
        const rects=children.map(c=>c.getBoundingClientRect());
        if(rects.every(x=>x.width>vw*.22)&&Math.abs(rects[0].top-rects[1].top)<80){
          patch(el,'flexDirection','column');
          patch(el,'alignItems','stretch');
        }
      }
    }
  }

  patches.forEach((styles,el)=>{
    Object.entries(styles).forEach(([prop,value])=>{el.style[prop]=value;});
  });
}

const pendingLayoutRoots=new Set();
function queueLayoutNormalization(records){
  for(const record of records||[]){
    let node=record.target;
    if(!node||node.nodeType!==1) node=node?.parentElement;
    if(!node) node=document.body;
    for(let depth=0;node&&depth<3;depth++,node=node.parentElement){
      pendingLayoutRoots.add(node);
      if(node===document.body) break;
    }
  }

  clearTimeout(window.__vxMobileLayoutTimer);
  window.__vxMobileLayoutTimer=setTimeout(()=>{
    const roots=[...pendingLayoutRoots];
    pendingLayoutRoots.clear();
    const targets=roots.filter(root=>!roots.some(other=>other!==root&&other.contains(root)));
    targets.forEach(root=>normalizeMobileLayout(root));
  },60);
}

requestAnimationFrame(()=>normalizeMobileLayout());
setTimeout(normalizeMobileLayout,800);

const observer=new MutationObserver(queueLayoutNormalization);
observer.observe(document.body,{childList:true,subtree:true});

window.addEventListener('resize',()=>{
  clearTimeout(window.__vxMobileResizeTimer);
  window.__vxMobileResizeTimer=setTimeout(()=>normalizeMobileLayout(),100);
},{passive:true});

const nav=findNavigation();

const top=document.createElement('div');
top.id='vxMobileTop';
top.innerHTML=`<div class="vx-brand"><span class="verix-pt-flag" role="img" aria-label="Bandeira de Portugal"><svg viewBox="0 0 78 52" aria-hidden="true" focusable="false">
  <defs>
    <filter id="verix-flag-fabric-mobile" x="-16%" y="-20%" width="132%" height="140%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.018 0.11" numOctaves="2" seed="7" result="fabricNoise">
        <animate attributeName="baseFrequency" values="0.018 0.11;0.032 0.17;0.014 0.09;0.018 0.11" dur="5.2s" repeatCount="indefinite"/>
      </feTurbulence>
      <feDisplacementMap in="SourceGraphic" in2="fabricNoise" scale="5" xChannelSelector="R" yChannelSelector="G">
        <animate attributeName="scale" values="3;9;5;11;3" dur="4.6s" repeatCount="indefinite"/>
      </feDisplacementMap>
    </filter>
    <clipPath id="verix-flag-fabric-mobile-shape">
      <path d="M0 7 C7 1 13 5 20 4 S33 2 39 5 S53 2 60 4 S72 2 78 5 L78 44 C70 49 63 43 55 46 S40 47 32 45 S16 49 8 45 L0 44 Z"/>
    </clipPath>
    <linearGradient id="verix-flag-fabric-mobile-metal" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".30"/>
      <stop offset=".25" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".58" stop-color="#06130d" stop-opacity=".22"/>
      <stop offset=".78" stop-color="#fff" stop-opacity=".19"/>
      <stop offset="1" stop-color="#000" stop-opacity=".25"/>
      <animate attributeName="x1" values="0;1;0" dur="4.8s" repeatCount="indefinite"/>
      <animate attributeName="x2" values="1;0;1" dur="4.8s" repeatCount="indefinite"/>
    </linearGradient>
  </defs>
  <g filter="url(#verix-flag-fabric-mobile)">
    <g clip-path="url(#verix-flag-fabric-mobile-shape)">
      <rect width="78" height="52" fill="#ff0000"/>
      <rect width="31.2" height="52" fill="#006600"/>
      <g stroke="#f5d24d" stroke-width="1.05" fill="none" opacity=".98">
        <circle cx="31.2" cy="26" r="13.1"/>
        <ellipse cx="31.2" cy="26" rx="5.1" ry="13.1"/>
        <ellipse cx="31.2" cy="26" rx="13.1" ry="5.0"/>
        <path d="M19.4 19.9 Q31.2 26 43 19.9 M19.4 32.1 Q31.2 26 43 32.1 M31.2 12.9 V39.1"/>
      </g>
      <path d="M23.3 17.2 L39.1 17.2 L38.2 28.2 C37.6 33.1 33.9 36.2 31.2 37.6 C28.5 36.2 24.8 33.1 24.2 28.2 Z" fill="#fff8e7" stroke="#b11b2b" stroke-width="1.1"/>
      <g fill="#0648a0" stroke="#fff" stroke-width=".45">
        <path d="M30 20.1 h2.4 v3.2 l-1.2 .7 -1.2-.7z"/>
        <path d="M26.3 23.1 h2.4 v3.2 l-1.2 .7 -1.2-.7z"/>
        <path d="M34 23.1 h2.4 v3.2 l-1.2 .7 -1.2-.7z"/>
        <path d="M30 25.3 h2.4 v3.2 l-1.2 .7 -1.2-.7z"/>
        <path d="M30 29.1 h2.4 v3.2 l-1.2 .7 -1.2-.7z"/>
      </g>
      <g fill="#d9a326" stroke="#643d0e" stroke-width=".45">
        <path d="M23.4 13.4 l2.2 2.1 -1.1 1.1 -2.2-2.1z"/>
        <path d="M39.1 14 l-2.1 2.2 -1.2-1.1 2.1-2.2z"/>
        <path d="M23 34.5 l2.3-2.1 1 1.2-2.1 2z"/>
        <path d="M39.2 34.5 l-2.2-2 -1 1.2 2.1 2z"/>
      </g>
      <path d="M0 7 C7 1 13 5 20 4 S33 2 39 5 S53 2 60 4 S72 2 78 5 L78 44 C70 49 63 43 55 46 S40 47 32 45 S16 49 8 45 L0 44 Z" fill="url(#verix-flag-fabric-mobile-metal)"/>
    </g>
  </g>
</svg></span><span class="vx-brand-text">VÉRIX <b>///</b> MOBILE</span></div><button type="button" id="vxMobileBack" class="vx-mobile-back" aria-label="Voltar ao menu anterior" title="Voltar ao menu anterior"><span aria-hidden="true">←</span><span>Voltar</span></button><button type="button" id="vxMobileMenu" aria-label="Abrir menu">☰</button>`;
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
