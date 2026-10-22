
(function(){
 // Não envolve nem substitui abrirModulo. A navegação fica a cargo da função base e dos patches estáveis anteriores.
 // Apenas garante que o estado visual do módulo não herda classes antigas.
 document.addEventListener('click', function(e){
 const btn=e.target && e.target.closest && e.target.closest('.vx-home-action');
 if(!btn) return;
 const ov=document.getElementById('moduleOverlay');
 const win=ov && ov.querySelector('.module-window');
 if(ov){ ov.classList.remove('cinemometro-fullpage'); }
 if(win){ win.classList.remove('cinemometro-fullpage-window'); }
 }, true);
})();
