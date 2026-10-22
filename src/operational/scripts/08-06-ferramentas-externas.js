function consultarIMTERRU() {
 const mat = obterMatriculaOuVazia();
 copiarEVisualizar(mat);
 const url = `https://erru.imt-ip.pt/ERRU/`;
 window.open(url, 'IMTERRUPopup', 'width=900,height=700,top=100,left=100,resizable=yes,scrollbars=yes');
 }

 function consultarINEM() {
 const mat = obterMatriculaOuVazia();
 copiarEVisualizar(mat);
 const url = `https://alvaras.inem.pt/DMZ/ConsultaCertificado.aspx`;
 window.open(url, 'INEMPopup', 'width=900,height=700,top=100,left=100,resizable=yes,scrollbars=yes');
 }

 function consultarWAZE() {
 const modal = document.getElementById('wazeGpsModal');
 if (modal) modal.classList.add('active');
 }

 function fecharWazeGpsModal() {
 const modal = document.getElementById('wazeGpsModal');
 if (modal) modal.classList.remove('active');
 }

 function abrirDefinicoesLocalizacao() {
 const uri = 'ms-settings:privacy-location';
 try { window.location.href = uri; }
 catch (e) { window.open(uri, '_blank'); }
 }

 function confirmarWazeGps() {
 fecharWazeGpsModal();
 const url = `https://location.wazept.com/#/`;
 window.open(url, 'WazePopup', 'width=900,height=700,top=100,left=100,resizable=yes,scrollbars=yes');
 }

