function cinRoundDown(n) {
 return Math.floor(n + 1e-9);
}

function cinEMA() {
 const modo = document.getElementById('cinSessaoModo')?.value || 'fixo';
 const ver = document.getElementById('cinVerificacao')?.value || 'primeira';
 if(modo==='perseguicao') return ver==='primeira' ? 0.03 : 0.05;
 if(modo==='movimento') return ver==='primeira' ? 0.05 : 0.07;
 return ver==='primeira' ? 0.03 : 0.05;
}

function cinEtiquetaEMA() {
 const modo = document.getElementById('cinSessaoModo')?.value || 'fixo';
 const v = cinEMA();
 const unit = v < 1 ? (v*100).toFixed(0)+' %' : '± '+v.toFixed(0)+' km/h';
 // For speeds >100 km/h the same source table switches to percentage;
 return modo==='perseguicao' || modo==='movimento' || modo==='fixo' ? '± '+(v*100).toFixed(0)+' %' : unit;
}

function cinCalcularDeducida(registada) {
 if(!Number.isFinite(registada) || registada<=0) return null;
 const ema = cinEMA();
 const desconto = registada <= 100 ? (ema*100) : (registada*ema);
 return cinRoundDown(registada - desconto);
}

function cinAtualizarEMA() {
 const e=document.getElementById('cinEmaValor'), n=document.getElementById('cinEmaNota');
 const top=document.getElementById('cinEmaTopValor'), topNota=document.getElementById('cinEmaTopNota');
 const registada=parseFloat(document.getElementById('cinRegistada')?.value);
 const ema=cinEMA();
 const pct=(ema*100).toFixed(0)+' %';
 const extra=pct;
 const verificacao=(document.getElementById('cinVerificacao')?.value==='primeira'?'Primeira verificação':'Verificação periódica');
 const modoEl=document.getElementById('cinSessaoModo');
 const modoTexto=modoEl?.selectedOptions?.[0]?.textContent||'';
 if(e)e.textContent=extra;
 if(n)n.textContent=verificacao;
 if(top)top.textContent=pct;
 if(topNota)topNota.textContent=modoTexto ? modoTexto+' • '+verificacao : verificacao;
 cinRecalcular();
}

function cinRecalcular() {
 const registada=parseFloat(document.getElementById('cinRegistada')?.value);
 const limite=parseFloat(document.getElementById('cinLimite')?.value);
 const ded=cinCalcularDeducida(registada);
 const k=(id,val)=>{const e=document.getElementById(id);if(e)e.textContent=val;};
 const sem=document.getElementById('cinSemInfracao');

 if(ded===null || !Number.isFinite(limite)){
 ['cinDeducida','cinDeducida2','cinExcesso','cinGravidade','cinCodigo','cinValor','cinCoima','cinPontos','cinInibicao','cinBaseLegal'].forEach(id=>k(id,'—'));
 if(sem)sem.classList.remove('show');
 cinMontarTexto();
 return;
 }

 const excesso=ded-limite;
 const classificacao=cinClassificarExcesso(Math.max(0,excesso));
 const codigo=cinCodigoOperacional(classificacao);
 const regime=document.getElementById('cinRegime')?.value||'local_geral';

 k('cinDeducida',ded+'');
 k('cinDeducida2',ded+'');
 k('cinExcesso',Math.max(0,excesso)+'');
 k('cinGravidade',excesso<=0?'Sem infração':classificacao.gravidade);
 k('cinCodigo',excesso<=0?'—':codigo);
 k('cinValor',excesso<=0?'—':classificacao.coima);
 k('cinCoima',excesso<=0?'—':classificacao.coima);
 k('cinPontos',excesso<=0?'—':classificacao.pontos);
 k('cinInibicao',excesso<=0?'—':classificacao.inibicao);

 if(excesso<=0){
 k('cinBaseLegal','—');
 if(sem)sem.classList.add('show');
 }else{
 if(sem)sem.classList.remove('show');
 let base='Art. 27.º + ';
 if(classificacao.gravidade==='Grave') base+='145.º + 147.º + 148.º CE';
 else if(classificacao.gravidade==='Muito Grave') base+='146.º + 147.º + 148.º CE';
 else base+='27.º CE';
 k('cinBaseLegal',base);
 }

 const a=document.getElementById('cinAviso');
 if(a){
 if(excesso<=0) a.textContent='A velocidade deduzida não ultrapassa o limite aplicável.';
 else if(regime==='especial') a.textContent='Limite especial sinalizado: confirme a sinalização aplicável e o enquadramento antes da emissão do auto.';
 else a.textContent='Classificação calculada pelo excesso sobre o limite aplicável.';
 }
 cinMontarTexto();
}

function cinMontarTexto() {
 const get=id=>(document.getElementById(id)?.value||'').trim();
 const registada=parseFloat(get('cinRegistada')), limite=parseFloat(get('cinLimite'));
 const ded=cinCalcularDeducida(registada);
 const marca=get('cinMarca'), modelo=get('cinModelo'), serie=get('cinSerie');
 const ansr=get('cinANSR'), ipq=get('cinIPQ'), data=get('cinDataIPQ');
 const certTipo=get('cinCertTipo'), cert=get('cinCert');
 const opNo=get('cinSessaoOperadorNo'), opNome=get('cinSessaoOperadorNome'), opPosto=get('cinSessaoOperadorPosto');
 let texto='';
 if(ded!==null && Number.isFinite(registada) && Number.isFinite(limite)) {
 const aparelho=(marca||'')+(modelo?(', modelo '+modelo):'')+(serie?(' n.º '+serie):'');
 texto='O veículo circulava, pelo menos, à velocidade de '+ded+' km/h correspondente à velocidade registada de '+registada+' km/h, deduzido o valor do erro máximo admissível, sendo o limite máximo de velocidade permitido no local de '+limite+' km/h. ';
 const modoSessao=document.getElementById('cinSessaoModo')?.value||'fixo';
 let prefixo='A velocidade foi verificada através do aparelho Cinemómetro - ';
 if(modoSessao==='media') prefixo='A velocidade foi verificada através do aparelho Cinemómetro - ';
 texto+=prefixo+aparelho+'. ';
 if(ansr) texto+='Aprovado para controlo e fiscalização pela ANSR através de '+ansr+'. ';
 if(ipq) texto+='Pelo IPQ através de '+ipq+'. ';
 if(data) texto+='Verificado pelo IPQ em '+data;
 if(certTipo) texto+=', com '+certTipo;
 if(cert) texto+=' n.º '+cert;
 if(data || certTipo || cert) texto+='. ';
 if(opNo || opNome || opPosto) texto+='Operador'+(opNo?' n.º '+opNo:'')+(opNome?(' — '+opNome):'')+(opPosto?(' — '+opPosto):'')+'.';
 } else {
 texto='Preencha a velocidade registada e o limite permitido para gerar o texto do auto.';
 }
 const ta=document.getElementById('cinTexto'); if(ta)ta.value=texto;
 cinMontarLocal();
}

function cinMontarLocal() {
 const get=id=>(document.getElementById(id)?.value||'').trim();
 const parts=[];
 if(get('cinLocalidade')) parts.push(get('cinLocalidade'));
 if(get('cinDistrito')) parts.push('Distrito: '+get('cinDistrito'));
 if(get('cinVia')) parts.push(get('cinVia'));
 const sent=get('cinSentido'); if(sent) parts.push('SENTIDO '+sent);
 const km=get('cinKm'); if(km) parts.push('KM '+km);
 const local='LOCAL: '+(parts.length?parts.join(', '):'—');
 const el=document.getElementById('cinLocalTexto'); if(el)el.textContent=local;
 return local;
}


let CIN_COPIA_CODIGO=false;
let CIN_COPIA_TEXTO=false;

function cinVelocidadeDigitada(el){
 if(!el) return;
 // Apenas algarismos introduzidos pelo utilizador; sem spinner/alteração por setas do teclado.
 const limpo=String(el.value||'').replace(/[^0-9]/g,'').slice(0,3);
 if(el.value!==limpo) el.value=limpo;
 CIN_COPIA_CODIGO=false;
 CIN_COPIA_TEXTO=false;
 cinRecalcular();
}

function cinLimparVelocidadeAposCopias(){
 if(!(CIN_COPIA_CODIGO && CIN_COPIA_TEXTO)) return;
 const el=document.getElementById('cinRegistada');
 if(el){
 el.value='';
 el.focus();
 }
 CIN_COPIA_CODIGO=false;
 CIN_COPIA_TEXTO=false;
 cinRecalcular();
}

function cinMostrarCopiaConfirmacao(mensagem){
 const toast=document.getElementById('cinCopyToast');
 if(!toast)return;
 toast.textContent=mensagem;
 toast.classList.add('show');
 clearTimeout(window._cinCopyToastTimer);
 window._cinCopyToastTimer=setTimeout(()=>toast.classList.remove('show'),2600);
}

async function cinCopiarCodigo() {
 const codigo = document.getElementById('cinCodigo')?.textContent?.trim() || '';
 const btn = document.getElementById('cinCopiarCodigoBtn');
 if(!codigo || codigo==='—') { mostrarToast('Ainda não existe código calculado.'); return; }
 try{
 await navigator.clipboard.writeText(codigo);
 if(btn){
 btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
 btn.textContent='CÓDIGO COPIADO';
 btn.classList.add('copied');
 clearTimeout(window._cinCodigoCopyTimer);
 window._cinCodigoCopyTimer=setTimeout(()=>{btn.textContent=btn.dataset.originalText||'COPIAR CÓDIGO';btn.classList.remove('copied');},1800);
 }
 CIN_COPIA_CODIGO=true;
 cinLimparVelocidadeAposCopias();
 cinMostrarCopiaConfirmacao('CÓDIGO COPIADO COM SUCESSO');
 }
 catch(e){ mostrarToast('Não foi possível copiar o código.'); }
}



const CIN_CONFIG_KEY='VÉRIX_CINEMOMETROS_V2';
const CIN_SESSION_OPERATOR_KEY='VÉRIX_CINEMOMETRO_OPERADOR_V2';
let CIN_ACTIVE_PROFILE_ID=null;

function cinLerPerfis(){
 try{
 /* sem cinemómetros de fábrica; lista começa vazia */
 const raw=localStorage.getItem(CIN_CONFIG_KEY);
 if(raw===null || raw==='' || raw==='[]') return [];
 const data=JSON.parse(raw||'[]');
 return Array.isArray(data)?data:[];
 }catch(e){return [];}
}
function cinGuardarPerfis(perfis){
 try{localStorage.setItem(CIN_CONFIG_KEY,JSON.stringify(perfis));}catch(e){}
}

function cinCriarId(){
 return 'cin_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
}
function cinNomePerfil(p){
 const parts=[p.marca,p.modelo,p.serie].map(v=>(v||'').trim()).filter(Boolean);
 return parts.length?parts.join(' — '):'Cinemómetro sem identificação';
}
function cinPerfilAtual(){
 return cinLerPerfis().find(p=>p.id===CIN_ACTIVE_PROFILE_ID)||null;
}
function cinAlternarConfiguracao(){cinAbrirGestor();}
function cinAbrirGestor(){
 const panel=document.getElementById('cinConfigPanel');
 if(!panel)return;
 cinAtualizarListaPerfis();
 cinAbrirConfiguracaoModal(false);
}
function cinEscaparHtml(v){
 return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function cinAtualizarListaPerfis(){
 const list=document.getElementById('cinProfileList');
 const empty=document.getElementById('cinProfileEmpty');
 const activeCard=document.getElementById('cinActiveDeviceCard');
 if(!list || !activeCard)return;

 let perfis=cinLerPerfis();

 if(!perfis.length){
 list.innerHTML='';
 activeCard.innerHTML=`<div class="cin-no-active"><strong>NENHUM CINEMÓMETRO EM SERVIÇO</strong><small>Crie ou adicione uma ficha técnica para começar.</small></div>`;
 if(empty)empty.style.display='none';
 return;
 }

 if(CIN_ACTIVE_PROFILE_ID && perfis.some(p=>p.id===CIN_ACTIVE_PROFILE_ID)){
 const idx=perfis.findIndex(p=>p.id===CIN_ACTIVE_PROFILE_ID);
 if(idx>0){
 const [ativo]=perfis.splice(idx,1);
 perfis.unshift(ativo);
 cinGuardarPerfis(perfis);
 }
 }else{
 CIN_ACTIVE_PROFILE_ID=perfis[0].id;
 }

 const ativo=perfis[0];
 const ativoNome=cinEscaparHtml(cinNomePerfil(ativo));
 const ativoNota=ativo.nota?cinEscaparHtml(ativo.nota):'Sem nota identificativa';
 const ativoClass=ativo.nota?'has-note':'no-note';

 activeCard.innerHTML=`
 <div class="cin-active-mark"><span>●</span> EM SERVIÇO</div> <div class="cin-active-main"> <strong>${ativoNome}</strong> <small class="${ativoClass}">${ativoNota}</small> </div> <button type="button" class="cin-note-active-btn" onclick="cinEditarNota('${ativo.id}')">${ativo.nota?'✎ EDITAR NOTA':'＋ ADICIONAR NOTA'}</button> <button type="button" class="cin-active-tech-btn" onclick="cinAbrirGestor()">VER / EDITAR FICHA</button>
 `;

 const outros=perfis.slice(1);
 list.innerHTML=outros.map((p,i)=>{
 const nome=cinEscaparHtml(cinNomePerfil(p));
 const nota=p.nota?cinEscaparHtml(p.nota):'Sem nota identificativa';
 return `<div class="cin-profile-item-clean"> <button type="button" class="cin-other-select" onclick="cinSelecionarPerfil('${p.id}')"> <span class="cin-profile-mini-index">#${String(i+2).padStart(2,'0')}</span> <span class="cin-other-info"><strong>${nome}</strong><small class="${p.nota?'has-note':'no-note'}">${nota}</small></span> <span class="cin-other-arrow">›</span> </button> <div class="cin-profile-actions-clean"> <button type="button" class="cin-note-inline-btn-clean" onclick="cinEditarNota('${p.id}')">${p.nota?'✎ NOTA':'＋ NOTA'}</button> <button type="button" class="cin-delete-profile-btn cin-delete-profile-btn-mini" onclick="cinEliminarPerfilPorId('${p.id}')" title="Apagar cinemómetro guardado">🗑 APAGAR</button> </div> </div>`;
 }).join('');

 if(empty)empty.style.display=outros.length?'none':'block';
 cinAplicarPerfil(ativo);
}

function cinEditarNota(id){
 const perfil=cinLerPerfis().find(p=>p.id===id);
 if(!perfil)return;
 const atual=perfil.nota||'';
 let modal=document.getElementById('cinNotaModal');
 if(!modal){
 modal=document.createElement('div');
 modal.id='cinNotaModal';
 modal.className='cin-note-modal';
 modal.innerHTML=`<div class="cin-note-modal-box"> <div class="cin-note-modal-head"><strong>NOTA DO CINEMÓMETRO</strong><button type="button" onclick="cinFecharNota()">×</button></div> <div class="cin-note-modal-body"> <label><span>IDENTIFICAÇÃO INTERNA</span><textarea id="cinNotaTexto" maxlength="180" placeholder="Adiciona uma nota a este cinemómetro."></textarea></label> <small>Podes indicar, por exemplo, a unidade, localização habitual ou qualquer outra referência interna.</small> </div> <div class="cin-note-modal-actions"> <button type="button" class="cancel" onclick="cinFecharNota()">CANCELAR</button> <button type="button" class="save" onclick="cinGuardarNota()">GUARDAR NOTA</button> </div> </div>`;
 document.body.appendChild(modal);
 }
 modal.dataset.profileId=id;
 const area=document.getElementById('cinNotaTexto');
 if(area)area.value=atual;
 modal.classList.add('show');
 setTimeout(()=>area?.focus(),50);
}
function cinGuardarNota(){
 const modal=document.getElementById('cinNotaModal');
 const id=modal?.dataset.profileId;
 if(!id)return;
 const area=document.getElementById('cinNotaTexto');
 const nota=(area?.value||'').trim();
 const perfis=cinLerPerfis();
 const perfil=perfis.find(p=>p.id===id);
 if(!perfil)return;
 perfil.nota=nota;
 cinGuardarPerfis(perfis);
 cinFecharNota();
 cinAtualizarListaPerfis();
 cinAplicarPerfil(perfil);
 mostrarToast(nota?'Nota guardada.':'Nota removida.');
}
function cinFecharNota(){
 document.getElementById('cinNotaModal')?.classList.remove('show');
}

function cinCapturarPerfilFormulario(){
 const ids=['cinMarca','cinModelo','cinSerie','cinANSR','cinIPQ','cinDataIPQ','cinVerificacao','cinCertTipo','cinCert'];
 const p={id:CIN_ACTIVE_PROFILE_ID||cinCriarId()};
 ids.forEach(id=>{
 const e=document.getElementById(id);
 if(e)p[id.replace(/^cin/,'').toLowerCase()]=e.value.trim();
 });
 return p;
}
function cinAplicarPerfil(p){
 if(!p)return;
 const map={
 cinMarca:p.marca||'',
 cinModelo:p.modelo||'',
 cinSerie:p.serie||'',
 cinANSR:p.ansr||'',
 cinIPQ:p.ipq||'',
 cinDataIPQ:p.dataipq||'',
 cinVerificacao:p.verificacao||'primeira',
 cinCertTipo:p.certtipo||'',
 cinCert:p.cert||''
 };
 Object.entries(map).forEach(([id,val])=>{const e=document.getElementById(id);if(e)e.value=val;});
 const label=document.getElementById('cinActiveProfileLabel');
 if(label)label.textContent=cinNomePerfil(p);
 const state=document.getElementById('cinConfigState');
 if(state)state.textContent='CINEMÓMETRO SELECIONADO';
 const summary=document.getElementById('cinConfigSummary');
 if(summary)summary.textContent=cinNomePerfil(p)+(p.nota?' · '+p.nota:'');
 cinAtualizarEMA();cinRecalcular();cinMontarLocal();
}
function cinSelecionarPerfil(id){
 const p=cinLerPerfis().find(x=>x.id===id);
 if(!p)return;
 CIN_ACTIVE_PROFILE_ID=id;
 const perfis=cinLerPerfis();
 const idx=perfis.findIndex(x=>x.id===id);
 if(idx>0){
 const [ativo]=perfis.splice(idx,1);
 perfis.unshift(ativo);
 cinGuardarPerfis(perfis);
 }
 cinAplicarPerfil(p);
 cinAtualizarListaPerfis();
 if(document.body.classList.contains('cin-config-modal-open'))cinFecharConfiguracaoModal();
 else document.getElementById('cinConfigPanel')?.classList.add('collapsed');
}
let CIN_CONFIG_MODAL_STATE=null;
function cinAbrirConfiguracaoModal(isNew=false){
 const panel=document.getElementById('cinConfigPanel');
 if(!panel) return;
 const atual=cinPerfilAtual();
 CIN_CONFIG_MODAL_STATE={
 id:CIN_ACTIVE_PROFILE_ID,
 isNew:!!isNew,
 original:atual?JSON.parse(JSON.stringify(atual)):null
 };
 // Retira a ficha da árvore do módulo e coloca-a diretamente no body.
 // Assim não fica condicionada por transform/overflow/stacking-context do módulo.
 if(panel.parentElement!==document.body) document.body.appendChild(panel);
 panel.classList.remove('collapsed');
 document.body.classList.add('cin-config-modal-open');
 cinCriarOuMostrarConfigOverlay();
 setTimeout(()=>document.getElementById('cinMarca')?.focus(),60);
}
function cinFecharConfiguracaoModal(){
 const panel=document.getElementById('cinConfigPanel');
 if(panel)panel.classList.add('collapsed');
 document.body.classList.remove('cin-config-modal-open');
 const overlay=document.getElementById('cinConfigModalBackdrop');
 if(overlay)overlay.classList.remove('active');
 const confirm=document.getElementById('cinConfigCancelModal');
 if(confirm)confirm.classList.remove('active');
 CIN_CONFIG_MODAL_STATE=null;
}
function cinCriarOuMostrarConfigOverlay(){
 let overlay=document.getElementById('cinConfigModalBackdrop');
 if(!overlay){
 overlay=document.createElement('div');
 overlay.id='cinConfigModalBackdrop';
 overlay.className='cin-config-modal-backdrop';
 overlay.setAttribute('aria-hidden','true');
 document.body.appendChild(overlay);
 }
 overlay.classList.add('active');
}
function cinCancelarConfiguracao(){
 const confirm=document.getElementById('cinConfigCancelModal');
 if(confirm)confirm.classList.add('active');
}
function cinFecharCancelConfigModal(){
 const confirm=document.getElementById('cinConfigCancelModal');
 if(confirm)confirm.classList.remove('active');
}
function cinConfirmarCancelConfiguracao(){
 cinFecharCancelConfigModal();
 const st=CIN_CONFIG_MODAL_STATE;
 if(!st){cinFecharConfiguracaoModal();return;}
 let perfis=cinLerPerfis();
 if(st.isNew && st.id){
 perfis=perfis.filter(p=>p.id!==st.id);
 cinGuardarPerfis(perfis);
 CIN_ACTIVE_PROFILE_ID=perfis[0]?.id||null;
 if(CIN_ACTIVE_PROFILE_ID){
 const ativo=perfis.find(p=>p.id===CIN_ACTIVE_PROFILE_ID);
 if(ativo)cinAplicarPerfil(ativo);
 }
 }else if(st.original){
 const idx=perfis.findIndex(p=>p.id===st.id);
 if(idx>=0){perfis[idx]=st.original;cinGuardarPerfis(perfis);cinAplicarPerfil(st.original);}
 }
 cinAtualizarListaPerfis();
 cinFecharConfiguracaoModal();
}
function cinNovoPerfil(silencioso=false){
 const perfis=cinLerPerfis();
 const p={id:cinCriarId(),marca:'',modelo:'',serie:'',ansr:'',ipq:'',dataipq:'',verificacao:'primeira',certtipo:'',cert:'',nota:''};
 perfis.push(p);
 cinGuardarPerfis(perfis);
 CIN_ACTIVE_PROFILE_ID=p.id;
 cinAtualizarListaPerfis();
 cinAbrirConfiguracaoModal(true);
 if(silencioso)document.getElementById('cinMarca')?.blur();
}
function cinDuplicarPerfil(){
 const p=cinPerfilAtual();
 if(!p){cinNovoPerfil();return;}
 const dup=JSON.parse(JSON.stringify(p));
 dup.id=cinCriarId();
 dup.nota=p.nota||'';
 const perfis=cinLerPerfis();perfis.push(dup);cinGuardarPerfis(perfis);
 CIN_ACTIVE_PROFILE_ID=dup.id;
 cinAtualizarListaPerfis();
 cinAbrirConfiguracaoModal(true);
}
let CIN_PENDING_DELETE_ID=null;
function cinEliminarPerfilPorId(id){
 const perfis=cinLerPerfis();
 const p=perfis.find(x=>x.id===id);
 if(!p)return;
 CIN_PENDING_DELETE_ID=id;
 const nomeEl=document.getElementById('cinDeleteProfileName');
 if(nomeEl)nomeEl.textContent=cinNomePerfil(p);
 const modal=document.getElementById('cinDeleteModal');
 if(modal)modal.classList.add('active');
}
function cinFecharDeleteModal(){
 CIN_PENDING_DELETE_ID=null;
 const modal=document.getElementById('cinDeleteModal');
 if(modal)modal.classList.remove('active');
}
function cinConfirmarDeletePerfil(){
 const id=CIN_PENDING_DELETE_ID;
 if(!id){cinFecharDeleteModal();return;}
 cinFecharDeleteModal();
 const perfis=cinLerPerfis();
 const p=perfis.find(x=>x.id===id);
 if(!p)return;
 const restantes=perfis.filter(x=>x.id!==id);
 cinGuardarPerfis(restantes);
 if(CIN_ACTIVE_PROFILE_ID===id) CIN_ACTIVE_PROFILE_ID=restantes[0]?.id||null;
 if(CIN_ACTIVE_PROFILE_ID){
 const ativo=restantes.find(x=>x.id===CIN_ACTIVE_PROFILE_ID);
 if(ativo) cinAplicarPerfil(ativo);
 }else{
 ['cinMarca','cinModelo','cinSerie','cinANSR','cinIPQ','cinDataIPQ','cinCertTipo','cinCert'].forEach(fid=>{const e=document.getElementById(fid);if(e)e.value='';});
 }
 cinAtualizarListaPerfis();
 mostrarToast('Cinemómetro apagado dos guardados.');
}
function cinEliminarPerfil(){
 const p=cinPerfilAtual();
 if(p) cinEliminarPerfilPorId(p.id);
}
function cinGuardarConfiguracao(){
 let perfis=cinLerPerfis();
 if(!CIN_ACTIVE_PROFILE_ID)CIN_ACTIVE_PROFILE_ID=cinCriarId();
 const p=cinCapturarPerfilFormulario();
 p.id=CIN_ACTIVE_PROFILE_ID;
 const idx=perfis.findIndex(x=>x.id===p.id);
 if(idx>=0)perfis[idx]=p;else perfis.push(p);
 cinGuardarPerfis(perfis);
 cinAplicarPerfil(p);
 cinAtualizarListaPerfis();
 cinFecharConfiguracaoModal();
 mostrarToast('Configuração do cinemómetro guardada.');
}
function cinLerSessaoOperador(){
 try{return JSON.parse(localStorage.getItem(CIN_SESSION_OPERATOR_KEY)||'null');}catch(e){return null;}
}
function cinGuardarSessaoOperador(){
 const data={
 posto:document.getElementById('cinSessaoOperadorPosto')?.value||'',
 numero:document.getElementById('cinSessaoOperadorNo')?.value||'',
 nome:document.getElementById('cinSessaoOperadorNome')?.value||'',
 modo:document.getElementById('cinSessaoModo')?.value||'fixo',
 veiculo:document.getElementById('cinVeiculo')?.value||'ligeiros',
 regime:document.getElementById('cinRegime')?.value||'local_geral',
 limite:document.getElementById('cinLimite')?.value||''
 };
 try{localStorage.setItem(CIN_SESSION_OPERATOR_KEY,JSON.stringify(data));}catch(e){}
 cinMontarTexto();
}
function cinCarregarSessaoOperador(){
 const data=cinLerSessaoOperador();if(!data)return;
 const a=document.getElementById('cinSessaoOperadorPosto');if(a)a.value=data.posto||'';
 const b=document.getElementById('cinSessaoOperadorNo');if(b)b.value=data.numero||'';
 const c=document.getElementById('cinSessaoOperadorNome');if(c)c.value=data.nome||'';
 const d=document.getElementById('cinSessaoModo');if(d)d.value=data.modo||'fixo';
 const e=document.getElementById('cinVeiculo');if(e)e.value=data.veiculo||'ligeiros';
 const f=document.getElementById('cinRegime');if(f)f.value=data.regime||'local_geral';
 const g=document.getElementById('cinLimite');if(g && data.limite!==undefined)g.value=data.limite||'';
}
function cinAtualizarSessaoOperador(){cinGuardarSessaoOperador();cinAtualizarEMA();cinRecalcular();cinMontarTexto();}

async function cinCopiarTexto() {
 const t=document.getElementById('cinTexto')?.value||'';
 const btn=document.getElementById('cinCopiarTextoBtn');
 if(!t)return;
 try{
 await navigator.clipboard.writeText(t);
 if(btn){
 btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
 btn.textContent='TEXTO COPIADO';
 btn.classList.add('copied');
 clearTimeout(window._cinTextoCopyTimer);
 window._cinTextoCopyTimer=setTimeout(()=>{btn.textContent=btn.dataset.originalText||'COPIAR TEXTO';btn.classList.remove('copied');},1800);
 }
 CIN_COPIA_TEXTO=true;
 cinLimparVelocidadeAposCopias();
 cinMostrarCopiaConfirmacao('TEXTO COPIADO COM SUCESSO');
 }
 catch(e){mostrarToast('Não foi possível copiar a descrição.');}
}

async function cinCopiarLocal() {
 const t=cinMontarLocal();
 try{await navigator.clipboard.writeText(t);mostrarToast('Local copiado.');}
 catch(e){mostrarToast('Não foi possível copiar o local.');}
}

document.addEventListener('input', function(e){
 if(['cinMarca','cinModelo','cinSerie','cinANSR','cinIPQ','cinDataIPQ','cinCertTipo','cinCert','cinSessaoOperadorNome','cinSessaoOperadorNo','cinSessaoOperadorPosto'].includes(e.target?.id)){
 if(e.target.id==='cinLimite')e.target.dataset.manual='1';
 cinMontarTexto();
 }
 if(e.target?.id==='cinLimite'){e.target.dataset.manual='1';cinRecalcular();}
});

const _cinOriginalAbrirModulo = abrirModulo;
abrirModulo = function(nome,el){
 _cinOriginalAbrirModulo(nome,el);
 if(nome==='cinemometro') setTimeout(()=>{
 cinCarregarSessaoOperador();
 
 const _cinRegimeDefault = document.getElementById('cinRegime');
 if(_cinRegimeDefault) _cinRegimeDefault.value='autoestrada';
 
 let _factoryResetPending=false;
 try{_factoryResetPending=localStorage.getItem('VÉRIX_FACTORY_RESET_PENDING')==='1';}catch(e){}
 cinAtualizarListaPerfis();
 
 try{
 const _prefsCin=Object.assign({cinRadarCollapsed:true},JSON.parse(localStorage.getItem('VÉRIX_PREFS_V1')||'{}'));
 if(typeof cinAlternarListaCinemometros==='function') cinAlternarListaCinemometros(!!_prefsCin.cinRadarCollapsed);
 }catch(e){}
 if(_factoryResetPending){try{localStorage.removeItem('VÉRIX_FACTORY_RESET_PENDING')}catch(e){}}
 cinAtualizarLimite();
 cinAtualizarEMA();
 cinRecalcular();
 cinMontarLocal();
 const speed=document.getElementById('cinRegistada');
 if(speed){speed.value='';speed.focus();}
 const sec=document.getElementById('cinOtherRadarsSection');
 const screen=document.querySelector('.cin-one-screen');
 if(sec&&screen)screen.classList.toggle('cin-list-expanded',!sec.classList.contains('collapsed'));
 },0);
};

function toggleFullscreen() {
 const doc = document.documentElement;
 if (!document.fullscreenElement) {
 doc.requestFullscreen();
 } else {
 document.exitFullscreen();
 }
 }
