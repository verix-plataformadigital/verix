
(function(){
 function lockPlateInputs(){
 ['MatriculaVeiculo','MatriculaReboque'].forEach(function(id){
 var el = document.getElementById(id);
 if(!el) return;
 el.setAttribute('autocomplete','off');
 el.setAttribute('autocorrect','off');
 el.setAttribute('autocapitalize','off');
 el.setAttribute('spellcheck','false');
 el.setAttribute('data-lpignore','true');
 el.setAttribute('data-form-type','other');
 el.removeAttribute('list'); // no datalist
 // Randomize name periodically so browser profile doesn't stick
 try {
 if(!el.dataset.verixNameLocked){
 el.name = (id === 'MatriculaVeiculo' ? 'verix_v_' : 'verix_r_') + Math.random().toString(36).slice(2,8);
 el.dataset.verixNameLocked = '1';
 }
 } catch(e){}
 });
 var form = document.querySelector('.searchbar form');
 if(form) form.setAttribute('autocomplete','off');
 }
 if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lockPlateInputs);
 else lockPlateInputs();
 setTimeout(lockPlateInputs, 300);
})();
