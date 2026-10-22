















function cinAplicarEstadoLimiteV42(){
 const r=document.getElementById('cinRegime')?.value||'';
 const w=document.querySelector('.cin-limit-wrap');
 if(w){w.classList.toggle('manual-limit',r==='especial'||r==='personalizado');}
}

/* Lista de radares: pesquisa + recolher/expandir */
const CIN_RADAR_COLLAPSE_KEY='VÉRIX_CINEMETROS_LISTA_RECOLHIDA_V1';
function cinAlternarListaCinemometros(force){
 const section=document.getElementById('cinOtherRadarsSection');
 const btn=document.getElementById('cinCollapseRadarListBtn');
 const mainBtn=document.getElementById('cinRadarToggleMain');
 const screen=section?.closest('.cin-one-screen');
 const body=section?.closest('.module-body');
 if(!section)return;
 const collapsed=force===undefined?!section.classList.contains('collapsed'):!!force;
 section.classList.toggle('collapsed',collapsed);
 if(screen)screen.classList.toggle('cin-radar-expanded',!collapsed);
 if(body)body.classList.toggle('cin-radar-expanded',!collapsed);
 const label=collapsed?'▾ MOSTRAR CINEMÓMETROS':'▴ RECOLHER CINEMÓMETROS';
 if(btn)btn.textContent=label;
 if(mainBtn)mainBtn.textContent=label;
 try{localStorage.setItem(CIN_RADAR_COLLAPSE_KEY,collapsed?'1':'0')}catch(e){}
 if(!collapsed){
 setTimeout(()=>document.getElementById('cinRadarSearch')?.focus(),50);
 }
}
function cinFiltrarListaCinemometros(){
 const input=document.getElementById('cinRadarSearch');
 const q=(input?.value||'').trim().toLocaleLowerCase('pt-PT');
 const rows=document.querySelectorAll('#cinProfileList .cin-profile-item-clean');
 let visiveis=0;
 rows.forEach(row=>{
 const texto=row.textContent.toLocaleLowerCase('pt-PT');
 const match=!q || texto.includes(q);
 row.classList.toggle('cin-search-hidden', !match);
 if(match) visiveis++;
 });
 const empty=document.getElementById('cinProfileEmpty');
 if(empty){
 if(q && rows.length && visiveis===0){
 empty.textContent='Nenhum cinemómetro encontrado.';
 empty.style.display='block';
 }else if(!rows.length){
 empty.textContent='Não existem cinemómetros guardados.';
 empty.style.display='none';
 }else{
 empty.style.display='none';
 }
 }
}

const _cinListaV41=cinAtualizarListaPerfis;
cinAtualizarListaPerfis=function(){
 _cinListaV41();
 const perfis=cinLerPerfis();
 const count=document.getElementById('cinProfileCount');
 if(count)count.textContent=`${perfis.length} ${perfis.length===1?'APARELHO':'APARELHOS'}`;
 cinFiltrarListaCinemometros();
 const section=document.getElementById('cinOtherRadarsSection');
 if(section){
 let saved='0';try{saved=localStorage.getItem(CIN_RADAR_COLLAPSE_KEY)||'0'}catch(e){}
 cinAlternarListaCinemometros(saved==='1');
 }
};

/* Corrige a aplicação de perfil para manter o novo tipo de veículo sem misturar dados do aparelho. */
const _cinAplicarPerfilV41=cinAplicarPerfil;
cinAplicarPerfil=function(p){_cinAplicarPerfilV41(p);cinAplicarEstadoLimiteV42();};

/* Velocidade Personalizada: aviso explícito e nunca silencioso. */
document.addEventListener('change',e=>{
 if(e.target?.id==='cinVeiculo'||e.target?.id==='cinRegime'){
 cinAplicarEstadoLimiteV42();
 cinFiltrarListaCinemometros();
 }
});

setTimeout(()=>{try{cinAplicarEstadoLimiteV42();}catch(e){}},0);
