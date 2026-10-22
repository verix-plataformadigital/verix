
(function(){
  try{
    var cores=Number(navigator.hardwareConcurrency||0);
    var memory=Number(navigator.deviceMemory||0);
    var low=(cores>0 && cores<=4) || (memory>0 && memory<=4);
    if(low) document.documentElement.classList.add('verix-low-power');
  }catch(_){}
})();
