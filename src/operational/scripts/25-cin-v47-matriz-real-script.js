
(function(){
 
 

 function prepararSelectors(){
 const v=document.getElementById('cinVeiculo');
 const r=document.getElementById('cinRegime');
 if(v && !v.dataset.v47){
 v.innerHTML=`
 <optgroup label="AUTOMÓVEIS LIGEIROS"> <option value="ligeiro_passageiros_sem">Ligeiro passageiros / misto — sem reboque</option> <option value="ligeiro_passageiros_com">Ligeiro passageiros / misto — com reboque</option> <option value="ligeiro_mercadorias_sem">Ligeiro mercadorias — sem reboque</option> <option value="ligeiro_mercadorias_com">Ligeiro mercadorias — com reboque</option> </optgroup> <optgroup label="MOTOCICLOS / TRICICLOS"> <option value="motociclo_mais50_sem">Motociclo > 50 cm³ — sem carro lateral / reboque</option> <option value="motociclo_mais50_com">Motociclo > 50 cm³ — com carro lateral / reboque</option> <option value="motociclo_ate50">Motociclo ≤ 50 cm³</option> <option value="triciclo">Triciclo</option> </optgroup> <optgroup label="CICLOMOTORES / QUADRICICLOS"> <option value="ciclomotor">Ciclomotor / quadriciclo</option> </optgroup> <optgroup label="AUTOMÓVEIS PESADOS"> <option value="pesado_passageiros_sem">Pesado passageiros — sem reboque</option> <option value="pesado_passageiros_com">Pesado passageiros — com reboque</option> <option value="pesado_mercadorias_sem">Pesado mercadorias — sem reboque / semirreboque</option> <option value="pesado_mercadorias_com">Pesado mercadorias — com reboque</option> </optgroup> <optgroup label="AGRÍCOLAS / MÁQUINAS"> <option value="trator">Trator agrícola ou florestal</option> <option value="maquina_agricola">Máquina agrícola / motocultivador / tratocarro</option> <option value="maquina_industrial">Máquina industrial</option> </optgroup>`;
 v.dataset.v47='1';
 if(!v.value)v.value='ligeiro_passageiros_sem';
 }
 if(r && !r.dataset.v47){
 r.innerHTML=`
 <optgroup label="LIMITES GERAIS — ART. 27.º"> <option value="coexistencia">Zona De Coexistência</option> <option value="local_geral">Dentro Da Localidade — Outras Zonas</option> <option value="autoestrada">Autoestrada — Limite Geral</option> <option value="reservada">Via Reservada A Automóveis E Motociclos — Limite Geral</option> <option value="restante">Restantes Vias Públicas — Limite Geral</option> </optgroup> <optgroup label="LIMITES ESPECIAIS / ENTRE PLACAS — ART. 28.º"> <option value="local_placas">Dentro Da Localidade — Entre Placas / Limite Sinalizado</option> <option value="fora_placas">Fora Da Localidade — Entre Placas / Limite Sinalizado</option> <option value="auto_placas">Autoestrada — Entre Placas / Limite Sinalizado</option> <option value="especial">Limite Especial — Local / Veículo / Condutor</option> </optgroup> <optgroup label="MANUAL"> <option value="personalizado">Velocidade Personalizada</option> </optgroup>`;
 r.dataset.v47='1';
 if(!r.value)r.value='autoestrada';
 }
 }

 function ajuda(){
 const r=document.getElementById('cinRegime');
 if(!r)return;
 let h=document.getElementById('cinV47Help');
 if(!h){h=document.createElement('em');h.id='cinV47Help';h.className='cin-v47-help';r.parentElement.appendChild(h)}
 const lim=document.getElementById('cinLimite');
 const wrap=lim?.closest('.cin-limit-wrap');
 const lab=r.closest('label');
 const special=['local_placas','fora_placas','auto_placas','especial','personalizado'].includes(r.value);
 lab?.classList.toggle('cin-v47-special',special);
 wrap?.classList.toggle('cin-v47-special',special);
 if(r.value==='auto_placas')h.textContent='Exemplo operacional: 100 km/h. Confirme sempre o limite efetivamente sinalizado no troço.';
 else if(['local_placas','fora_placas'].includes(r.value))h.textContent='Introduza o limite indicado pela sinalização existente no local.';
 else if(r.value==='especial')h.textContent='Use quando o limite é especialmente imposto ao local, ao veículo ou ao condutor.';
 else if(r.value==='personalizado')h.textContent='Introduza manualmente o limite aplicável a esta ocorrência.';
 else h.textContent='';
 }

 

 

 window.cinAtualizarRegime=function(){
 prepararSelectors();
 const l=document.getElementById('cinLimite');
 if(l)l.dataset.manual='0';
 window.cinAtualizarLimite();
 try{cinGuardarSessaoOperador()}catch(e){}
 };

 /* Só substituímos o texto do operador. A classificação e os códigos existentes mantêm a lógica documental já presente. */
 /* O operador é um dado de sessão; torna claro que POSTO significa o posto hierárquico (ex.: Cabo). */
 const postoInput=document.getElementById('cinSessaoOperadorPosto');
 if(postoInput)postoInput.placeholder='Ex.: Cabo';

 const originalAbrir=window.abrirModulo;
 if(typeof originalAbrir==='function'){
 window.abrirModulo=function(nome,el){
 originalAbrir(nome,el);
 if(nome==='cinemometro')setTimeout(()=>{prepararSelectors();ajuda();window.cinAtualizarLimite?.();},0);
 };
 }

 document.addEventListener('change',function(e){
 if(e.target?.id==='cinVeiculo'||e.target?.id==='cinRegime')setTimeout(()=>{prepararSelectors();ajuda()},0);
 });
 setTimeout(()=>{prepararSelectors();ajuda()},50);
})();
