(function(){
 'use strict';
 const KEY='VÉRIX_PREFS_V1';
 const DEFAULTS={theme:'dark',density:'compact',scale:'auto',hud:true,transitions:true,history:true,cinRadarCollapsed:true,profile:'escudo'};
 const PROFILES={
  escudo:{label:'ESCUDO',title:'ESCUDO',subtitle:'EQUILÍBRIO OPERACIONAL',density:'compact',scale:'auto',hud:true,transitions:true,hint:'Compacto · Auto · HUD ativo · Transições ativas'},
  fiscalizacao:{label:'FISCALIZAÇÃO',title:'FISCALIZAÇÃO',subtitle:'MÁXIMO CONTEÚDO',density:'compact',scale:'90',hud:true,transitions:false,hint:'Compacto · 90% · HUD ativo · Transições reduzidas'},
  leitura:{label:'LEITURA',title:'LEITURA',subtitle:'MAIOR CONFORTO',density:'comfortable',scale:'100',hud:false,transitions:true,hint:'Conforto · 100% · HUD reduzido · Transições ativas'},
  posto:{label:'POSTO',title:'POSTO',subtitle:'ECRÃ PEQUENO',density:'compact',scale:'80',hud:false,transitions:false,hint:'Compacto · 80% · HUD reduzido · Transições reduzidas'}
 };
 const SCALE_VALUES=['auto','80','90','100','110','120'];
 let prefs=load();
 function load(){
  try{
   const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
   const p=Object.assign({},DEFAULTS,saved&&typeof saved==='object'?saved:{});
   p.theme=p.theme==='light'?'light':'dark';
   p.density=['compact','normal','comfortable'].includes(p.density)?p.density:'compact';
   p.scale=SCALE_VALUES.includes(String(p.scale))?String(p.scale):'auto';
   ['hud','transitions','history','cinRadarCollapsed'].forEach(k=>p[k]=p[k]!==false);
   p.profile=PROFILES[p.profile]?p.profile:inferProfile(p);
   return p;
  }catch(_){return Object.assign({},DEFAULTS);}
 }
 function save(){try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch(_){}}
 function inferProfile(p){
  if(p.density==='comfortable')return 'leitura';
  if(String(p.scale)==='80')return 'posto';
  if(String(p.scale)==='90')return 'fiscalizacao';
  return 'escudo';
 }
 function applyScale(){
  try{
   if(prefs.scale==='auto'){
    const w=Math.max(document.documentElement.clientWidth||0,window.innerWidth||0);
    const h=Math.max(document.documentElement.clientHeight||0,window.innerHeight||0);
    const z=Math.max(.82,Math.min(1.08,Math.min(w/1600,h/900)));
    document.body.style.zoom=z.toFixed(3);
   }else if(['80','90','100','110','120'].includes(prefs.scale)){
    document.body.style.zoom=(parseInt(prefs.scale,10)/100).toFixed(2);
   }else document.body.style.zoom='';
  }catch(_){document.body.style.zoom='';}
 }
 function apply(){
  if(!document.body)return;
  document.body.classList.toggle('theme-light',prefs.theme==='light');
  document.body.classList.toggle('ui-compact',prefs.density==='compact');
  document.body.classList.toggle('ui-comfortable',prefs.density==='comfortable');
  document.body.classList.toggle('ui-normal',prefs.density==='normal');
  ['80','90','100','110','120'].forEach(v=>document.body.classList.toggle('ui-scale-'+v,prefs.scale===v));
  document.body.classList.toggle('ui-scale-auto',prefs.scale==='auto');
  document.body.classList.toggle('no-hud',!prefs.hud);
  document.body.classList.toggle('no-transitions',!prefs.transitions);
  document.body.classList.toggle('history-disabled',!prefs.history);
  try{localStorage.setItem('VÉRIX_CIN_RADAR_COLLAPSED_PREF',prefs.cinRadarCollapsed?'1':'0');}catch(_){}
  applyScale();
 }
 function syncUI(){
  const setValue=(id,value)=>{const el=document.getElementById(id);if(el)el.value=value;};
  setValue('settingTheme',prefs.theme);
  setValue('settingDensity',prefs.density);
  setValue('settingScale',prefs.scale);
  setValue('settingProfile',prefs.profile);
  const sc=document.getElementById('settingsScaleStatus');if(sc)sc.textContent=prefs.scale==='auto'?'AUTO':prefs.scale+'%';
  const live=document.getElementById('settingsLiveMode');if(live)live.textContent=PROFILES[prefs.profile].label;
  const hint=document.getElementById('settingProfileHint');if(hint)hint.textContent=PROFILES[prefs.profile].hint;
  const title=document.getElementById('settingsProfileStatus');if(title)title.textContent=PROFILES[prefs.profile].title;
  const subtitle=document.getElementById('settingsProfileStatusSub');if(subtitle)subtitle.textContent=PROFILES[prefs.profile].subtitle;
  [['settingHud','hud'],['settingTransitions','transitions'],['settingHistory','history'],['settingCinRadarCollapsed','cinRadarCollapsed']].forEach(([id,key])=>{
   const el=document.getElementById(id);if(!el)return;
   el.classList.toggle('on',!!prefs[key]);
   const label=el.querySelector('span');if(label)label.textContent=prefs[key]?'ATIVO':'DESATIVADO';
  });
 }
 function renderDiagnostic(){
  const el=document.getElementById('settingsDiagnostic');if(!el)return;
  let hist=0,storageStatus='LOCALSTORAGE BLOQUEADO';
  try{
   const data=JSON.parse(localStorage.getItem('VÉRIX_CONSULTAS_HISTORICO_V1')||'[]');
   hist=Array.isArray(data)?data.length:0;
  }catch(_){}
  try{
   const probe='__verix_settings_probe__';
   localStorage.setItem(probe,'1');localStorage.removeItem(probe);
   storageStatus='LOCALSTORAGE OK';
  }catch(_){}
  const w=window.innerWidth||document.documentElement.clientWidth||0;
  const h=window.innerHeight||document.documentElement.clientHeight||0;
  el.textContent='POSTO '+w+'×'+h+' px · HISTÓRICO '+hist+' / 100 registos · DADOS LOCAIS '+storageStatus;
 }
 function notify(message){if(typeof window.mostrarToast==='function')window.mostrarToast(message);}
 function refresh(){syncUI();renderDiagnostic();notify('Diagnóstico local atualizado.');}
 function setProfile(value){
  const key=PROFILES[value]?value:'escudo',profile=PROFILES[key];
  prefs=Object.assign({},prefs,{profile:key,density:profile.density,scale:profile.scale,hud:profile.hud,transitions:profile.transitions});
  save();apply();syncUI();renderDiagnostic();
 }
 function setTheme(value){prefs.theme=value==='light'?'light':'dark';save();apply();syncUI();}
 function setDensity(value){prefs.density=['compact','normal','comfortable'].includes(value)?value:'normal';prefs.profile=inferProfile(prefs);save();apply();syncUI();}
 function setScale(value){prefs.scale=SCALE_VALUES.includes(String(value))?String(value):'auto';prefs.profile=inferProfile(prefs);save();apply();syncUI();}
 function toggle(key){
  if(!['hud','transitions','history','cinRadarCollapsed'].includes(key))return;
  prefs[key]=!prefs[key];save();apply();syncUI();
 }
 function reset(){
  prefs=Object.assign({},DEFAULTS);save();apply();syncUI();renderDiagnostic();notify('Preferências repostas.');
 }
 function factoryReset(){window.VÉRIXFactoryResetModal?.open();}
 window.VÉRIXSettings=window.VERIXSettings={setTheme,setDensity,setScale,toggle,setProfile,reset,factoryReset,refreshDiagnostic:refresh};
 if(typeof window.abrirHistorico==='function'&&!window.__verixHistoryPreferenceGuard){
  const openHistory=window.abrirHistorico;
  window.__verixHistoryPreferenceGuard=true;
  window.abrirHistorico=function(){
   if(load().history===false){notify('Histórico desativado nas definições.');return;}
   return openHistory.apply(this,arguments);
  };
 }
 function initialize(){prefs=load();apply();syncUI();renderDiagnostic();}
 initialize();
 window.addEventListener('resize',function(){if(prefs.scale==='auto')applyScale();renderDiagnostic();});
 document.addEventListener('DOMContentLoaded',initialize,{once:true});
 // The settings screen is injected into the module overlay on demand.
 document.addEventListener('click',function(){
  setTimeout(function(){if(document.getElementById('settingTheme')){syncUI();renderDiagnostic();}},100);
 },true);
})();