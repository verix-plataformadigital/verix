
(function(){
 /*
 * v61:
 * - O EMA operacional usado neste módulo fica limitado a 3% (1.ª verificação)
 * ou 5% (verificação periódica), sem ser alterado pelo campo MODO.
 * - A classificação/código passam a respeitar a categoria real do veículo.
 * - "Entre placas" usa família de códigos diferente de "Geral".
 * - Limites especiais/personalizados não recebem código automaticamente sem
 * um contexto local/fora de localidade que o formulário atual não recolhe.
 */

 const V61_LIGHT = new Set([
 'ligeiro_passageiros_sem','ligeiro_passageiros_com',
 'ligeiro_mercadorias_sem','ligeiro_mercadorias_com',
 'motociclo_mais50_sem','motociclo_mais50_com','motociclo_ate50','triciclo'
 ]);

 const V61_LIMITES = {
 ligeiro_passageiros_sem:{coexistencia:20,local_geral:50,autoestrada:120,reservada:100,restante:90},
 ligeiro_passageiros_com:{coexistencia:20,local_geral:50,autoestrada:100,reservada:80,restante:70},
 ligeiro_mercadorias_sem:{coexistencia:20,local_geral:50,autoestrada:110,reservada:90,restante:80},
 ligeiro_mercadorias_com:{coexistencia:20,local_geral:50,autoestrada:90,reservada:80,restante:70},
 motociclo_mais50_sem:{coexistencia:20,local_geral:50,autoestrada:120,reservada:100,restante:90},
 motociclo_mais50_com:{coexistencia:20,local_geral:50,autoestrada:100,reservada:80,restante:70},
 motociclo_ate50:{coexistencia:20,local_geral:40,autoestrada:null,reservada:null,restante:60},
 triciclo:{coexistencia:20,local_geral:50,autoestrada:100,reservada:90,restante:80},
 ciclomotor:{coexistencia:20,local_geral:40,autoestrada:null,reservada:null,restante:45},
 pesado_passageiros_sem:{coexistencia:20,local_geral:50,autoestrada:100,reservada:90,restante:80},
 pesado_passageiros_com:{coexistencia:20,local_geral:50,autoestrada:90,reservada:90,restante:70},
 pesado_mercadorias_sem:{coexistencia:20,local_geral:50,autoestrada:90,reservada:80,restante:80},
 pesado_mercadorias_com:{coexistencia:20,local_geral:40,autoestrada:80,reservada:70,restante:70},
 trator:{coexistencia:20,local_geral:30,autoestrada:null,reservada:null,restante:40},
 maquina_agricola:{coexistencia:20,local_geral:20,autoestrada:null,reservada:null,restante:20},
 maquina_industrial:{coexistencia:20,local_geral:40,autoestrada:80,reservada:70,restante:70}
 };

 const V61_CODES = {
 light:{
 local_geral:{leve:'1860270109',grave:'2860270110',muito:'3860270111',topo:'3860270112'},
 local_placas:{leve:'1860280106',grave:'2860280107',muito:'3860280108',topo:'3860280109'},
 fora_geral:{leve:'1860270113',grave:'2860270114',muito:'3860270115',topo:'3860270116'},
 fora_placas:{leve:'1860280110',grave:'2860280111',muito:'3860280112',topo:'3860280113'}
 },
 other:{
 local_geral:{leve:'1860270117',grave:'2860270118',muito:'3860270119',topo:'3860270120'},
 local_placas:{leve:'1860280118',grave:'2860280119',muito:'3860280120',topo:'3860280121'},
 fora_geral:{leve:'1860270121',grave:'2860270122',muito:'3860270123',topo:'3860270124'},
 fora_placas:{leve:'1860280122',grave:'2860280123',muito:'3860280124',topo:'3860280125'}
 }
 };

 function vehicle(){return document.getElementById('cinVeiculo')?.value||'ligeiro_passageiros_sem';}
 function regime(){return document.getElementById('cinRegime')?.value||'local_geral';}
 function light(){return V61_LIGHT.has(vehicle());}
 function group(){return light()?'light':'other';}
 function family(){
 const r=regime();
 if(r==='coexistencia'||r==='local_geral')return 'local_geral';
 if(r==='local_placas')return 'local_placas';
 if(r==='autoestrada'||r==='reservada'||r==='restante')return 'fora_geral';
 if(r==='fora_placas'||r==='auto_placas')return 'fora_placas';
 return null;
 }

 // EMA operacional reproduzido conforme o simulador de referência:
 // Fixo -> 3% (1.ª) / 5% (periódica)
 // Em movimento / Perseguição -> 5% (1.ª) / 7% (periódica)
 window.cinEMA=function(){
 const ver=document.getElementById('cinVerificacao')?.value||'primeira';
 const modo=document.getElementById('cinSessaoModo')?.value||'fixo';
 if(modo==='movimento' || modo==='perseguicao') return ver==='primeira'?0.05:0.07;
 return ver==='primeira'?0.03:0.05;
 };

 window.cinEtiquetaEMA=function(){
 return (cinEMA()*100).toFixed(0)+' %';
 };

 window.cinCalcularDeducida=function(registada){
 if(!Number.isFinite(registada)||registada<=0)return null;
 const ema=cinEMA();
 // A tabela do Anexo C usa valor inteiro até 100 km/h e percentagem acima de 100.
 const desconto=registada<=100?(ema*100):(registada*ema);
 return Math.floor(registada-desconto+1e-9);
 };

 

 window.cinAtualizarLimite=function(){
 const l=document.getElementById('cinLimite');
 const fonte=document.getElementById('cinLimiteFonte');
 const label=document.getElementById('cinLimiteLabel');
 const r=regime(), v=vehicle();
 if(!l)return;

 if(['local_placas','fora_placas','especial','personalizado'].includes(r)){
 l.dataset.manual='1';
 l.value='';
 l.placeholder='Introduzir valor';
 if(label)label.textContent=(r==='personalizado')?'LIMITE PERSONALIZADO':'LIMITE SINALIZADO';
 if(fonte){
 fonte.textContent=(r==='personalizado')?'Introduza o limite aplicável nesta sessão.':'Introduza o limite efetivamente sinalizado no local.';
 fonte.classList.add('cin-v47-source-special');
 fonte.classList.remove('cin-v47-source-auto');
 }
 }else{
 const valor=V61_LIMITES[v]?.[r];
 l.dataset.manual='0';
 if(label)label.textContent='LIMITE';
 if(r==='auto_placas'){
 l.value='100';l.placeholder='100';
 if(fonte){fonte.textContent='Referência operacional: 100 km/h — confirme a sinalização.';fonte.classList.add('cin-v47-source-auto');fonte.classList.remove('cin-v47-source-special');}
 }else if(valor==null){
 l.value='';l.placeholder='—';
 if(fonte){fonte.textContent='Não aplicável para este veículo.';fonte.classList.remove('cin-v47-source-auto','cin-v47-source-special');}
 }else{
 l.value=String(valor);l.placeholder='km/h';
 if(fonte){fonte.textContent='Valor automático — tabela do art. 27.º CE.';fonte.classList.remove('cin-v47-source-auto','cin-v47-source-special');}
 }
 }
 try{cinRecalcular();}catch(e){}
 };

 window.cinClassificarExcesso=function(excesso){
 const r=regime();
 const inside=(r==='coexistencia'||r==='local_geral'||r==='local_placas');
 const l=light();
 let limGrave,limMuito,limTopo;
 if(l){
 limGrave=inside?20:30;
 limMuito=inside?40:60;
 limTopo=inside?60:80;
 }else{
 limGrave=inside?10:20;
 limMuito=inside?20:40;
 limTopo=inside?40:60;
 }
 const coexist=r==='coexistencia';
 if(excesso<=limGrave)return {gravidade:'Leve',coima:'60€ a 300€',pontos:'—',inibicao:'—',faixa:'leve'};
 if(excesso<=limMuito)return {gravidade:'Grave',coima:'120€ a 600€',pontos:coexist?'3':'2',inibicao:'1 mês a 1 ano',faixa:'grave'};
 if(excesso<=limTopo)return {gravidade:'Muito Grave',coima:'300€ a 1500€',pontos:coexist?'5':'4',inibicao:'2 meses a 2 anos',faixa:'muito'};
 return {gravidade:'Muito Grave',coima:'500€ a 2500€',pontos:coexist?'5':'4',inibicao:'2 meses a 2 anos',faixa:'topo'};
 };

 window.cinCodigoOperacional=function(classificacao){
 const fam=family();
 const faixa=classificacao?.faixa;
 if(!fam||!faixa)return '—';
 return V61_CODES[group()][fam][faixa]||'—';
 };

 window.cinAtualizarEMA=function(){
 const pct=(cinEMA()*100).toFixed(0)+' %';
 const ver=(document.getElementById('cinVerificacao')?.value==='primeira')?'1.ª verificação':'Verificação periódica';
 const e=document.getElementById('cinEmaValor');
 const n=document.getElementById('cinEmaNota');
 const top=document.getElementById('cinEmaTopValor');
 const topNota=document.getElementById('cinEmaTopNota');
 if(e)e.textContent=pct;
 if(n){n.textContent=ver;n.classList.add('cin-v61-ema-note');}
 if(top)top.textContent=pct;
 const modoEl=document.getElementById('cinSessaoModo');
 const modoTexto=modoEl?.selectedOptions?.[0]?.textContent||'Fixo';
 if(topNota)topNota.textContent=modoTexto+' • '+ver;
 try{cinRecalcular();}catch(e){}
 };

 window.cinRecalcular=function(){
 const registada=parseFloat(document.getElementById('cinRegistada')?.value);
 const limite=parseFloat(document.getElementById('cinLimite')?.value);
 const ded=cinCalcularDeducida(registada);
 const k=(id,val)=>{const e=document.getElementById(id);if(e)e.textContent=val;};
 const sem=document.getElementById('cinSemInfracao');
 const r=regime();

 if(ded===null||!Number.isFinite(limite)){
 ['cinDeducida','cinDeducida2','cinExcesso','cinGravidade','cinCodigo','cinValor','cinCoima','cinPontos','cinInibicao','cinBaseLegal'].forEach(id=>k(id,'—'));
 if(sem)sem.classList.remove('show');
 if(r==='especial'||r==='personalizado'){
 const a=document.getElementById('cinAviso');
 if(a)a.textContent='Defina o limite aplicável e confirme o enquadramento antes do auto.';
 }
 try{cinMontarTexto();}catch(e){}
 return;
 }

 const excesso=ded-limite;
 const classificacao=cinClassificarExcesso(Math.max(0,excesso));
 const codigo=cinCodigoOperacional(classificacao);
 const kex=Math.max(0,excesso);
 k('cinDeducida',String(ded));
 k('cinDeducida2',String(ded));
 k('cinExcesso',String(kex));
 k('cinGravidade',excesso<=0?'Sem infração':classificacao.gravidade);
 k('cinCodigo',excesso<=0?'—':codigo);
 k('cinValor',excesso<=0?'—':classificacao.coima);
 k('cinCoima',excesso<=0?'—':classificacao.coima);
 k('cinPontos',excesso<=0?'—':classificacao.pontos);
 k('cinInibicao',excesso<=0?'—':classificacao.inibicao);

 if(excesso<=0){
 k('cinBaseLegal','—');if(sem)sem.classList.add('show');
 }else{
 if(sem)sem.classList.remove('show');
 let base='Art. 27.º + ';
 if(r==='local_placas'||r==='fora_placas'||r==='auto_placas')base='Art. 28.º + ';
 if(classificacao.gravidade==='Grave')base+='145.º + 147.º + 148.º CE';
 else if(classificacao.gravidade==='Muito Grave')base+='146.º + 147.º + 148.º CE';
 else base+='27.º CE';
 k('cinBaseLegal',base);
 }

 const a=document.getElementById('cinAviso');
 if(a){
 a.classList.remove('cin-v61-warning');
 if(r==='especial'||r==='personalizado'){
 a.classList.add('cin-v61-warning');
 a.textContent='Enquadramento especial/manual: confirme local, sinalização e código antes da emissão.';
 }else if(excesso<=0)a.textContent='A velocidade deduzida não ultrapassa o limite aplicável.';
 else a.textContent='Classificação calculada pelo excesso sobre o limite aplicável.';
 }
 try{cinMontarTexto();}catch(e){}
 };

 window.cinMontarTexto=function(){
 const get=id=>(document.getElementById(id)?.value||'').trim();
 const registada=parseFloat(get('cinRegistada')), limite=parseFloat(get('cinLimite'));
 const ded=cinCalcularDeducida(registada);
 const marca=get('cinMarca'), modelo=get('cinModelo'), serie=get('cinSerie');
 const ansr=get('cinANSR'), ipq=get('cinIPQ'), data=get('cinDataIPQ');
 const certTipo=get('cinCertTipo'), cert=get('cinCert');
 const opNo=get('cinSessaoOperadorNo'), opNome=get('cinSessaoOperadorNome');
 let texto='';
 if(ded!==null&&Number.isFinite(registada)&&Number.isFinite(limite)){
 const aparelho=(marca||'')+(modelo?(', modelo '+modelo):'')+(serie?(' n.º '+serie):'');
 texto='O veículo circulava, pelo menos, à velocidade de '+ded+' km/h correspondente à velocidade registada de '+registada+' km/h, deduzido o valor do erro máximo admissível, sendo o limite máximo de velocidade permitido no local de '+limite+' km/h. ';
 texto+='A velocidade foi verificada através do aparelho Cinemómetro - '+aparelho+'. ';
 if(ansr)texto+='Aprovado para controlo e fiscalização pela ANSR através de '+ansr+'. ';
 if(ipq)texto+='Pelo IPQ através de '+ipq+'. ';
 if(data)texto+='Verificado pelo IPQ em '+data;
 if(certTipo)texto+=', com '+certTipo;
 if(cert)texto+=' n.º '+cert;
 if(data||certTipo||cert)texto+='. ';
 const posto=get('cinSessaoOperadorPosto');
 if(opNo||opNome||posto){
 let operador='';
 if(posto)operador+=posto;
 if(opNo)operador+=(operador?' ':'')+'Nº '+opNo;
 if(opNome)operador+=(operador?' - ':'')+opNome;
 if(operador)texto+='Operador '+operador+'.';
 }
 }else{
 texto='Preencha a velocidade registada e o limite permitido para gerar o texto do auto.';
 }
 const ta=document.getElementById('cinTexto');if(ta)ta.value=texto;
 try{cinMontarLocal();}catch(e){}
 };

 // Retira o antigo texto que associa EMA ao modo e mantém a informação curta.
 function sync(){
 try{cinAtualizarEMA();}catch(e){}
 try{
 const fonte=document.getElementById('cinLimiteFonte');
 if(fonte && !['local_placas','fora_placas','auto_placas','especial','personalizado'].includes(regime()))
 fonte.textContent='Valor automático — tabela do art. 27.º CE.';
 }catch(e){}
 }

 document.addEventListener('change',function(e){
 if(e.target?.id==='cinVerificacao')sync();
 if(e.target?.id==='cinVeiculo'||e.target?.id==='cinRegime')setTimeout(()=>{cinAtualizarLimite();cinAtualizarEMA();},0);
 });

 setTimeout(sync,120);
})();
