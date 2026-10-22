
(function(){
 function boot(){
 try{
 if(!document.querySelector('.verix-holo-scan')){
 var s=document.createElement('div');
 s.className='verix-holo-scan';
 s.setAttribute('aria-hidden','true');
 document.body.appendChild(s);
 }
 if(!document.querySelector('.v007-orb')){
 ['a','b','c'].forEach(function(k){
 var o=document.createElement('div');
 o.className='v007-orb '+k;
 o.setAttribute('aria-hidden','true');
 document.body.appendChild(o);
 });
 }
 }catch(e){}
 }
 if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
 else boot();
})();
