
(function(){
 try {
 document.documentElement.classList.add('fx-hud');
 document.body.classList.add('fx-hud-body');
 } catch(e) {}
 // Smooth appear for main menu cards
 try {
 var cards = document.querySelectorAll('.vx-home-action');
 cards.forEach(function(c, i){
 c.style.opacity = '0';
 c.style.transform = 'translateY(12px)';
 setTimeout(function(){
 c.style.transition = 'opacity .45s ease, transform .45s ease';
 c.style.opacity = '1';
 c.style.transform = 'translateY(0)';
 }, 80 + i * 60);
 });
 } catch(e) {}
})();
