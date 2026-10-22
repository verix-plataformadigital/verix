
(function(){
  'use strict';

  /* VÉRIX — ARRANQUE ÚNICO
     1) Splash visível ~1,2 s
     2) Fade do splash
     3) Menu principal VÉRIX (NUNCA a consulta)
     4) Aviso inicial
  */
  var SPLASH_MS = 1200;
  var FADE_MS = 250;
  
  var started = (typeof window.__verixSplashStarted === 'number') ? window.__verixSplashStarted : performance.now();
  var finished = false;

  var splash = document.getElementById('opsBootOverlay');
  var notice = document.getElementById('verixAsfNoticeOverlay');
  var menu = document.getElementById('mainMenuScreen');
  var main = document.querySelector('.main');

  function forceStartupState(){
    try { document.documentElement.classList.add('verix-starting'); } catch(e) {}
    if (notice) notice.setAttribute('aria-hidden','true');
    if (menu) menu.classList.remove('show');
    document.body.classList.remove(
      'main-menu-active',
      'fixed-workspace-active',
      'consultation-screen-active',
      'cinemometro-page-active',
      'history-page-active'
    );
    if (main) main.classList.remove('consultation-fixed-active');
  }

  function prepareMainMenu(){
    /* Usa a função oficial, mas limpa explicitamente qualquer estado de consulta. */
    document.body.classList.remove(
      'fixed-workspace-active',
      'consultation-screen-active',
      'cinemometro-page-active',
      'history-page-active'
    );
    if (main) main.classList.remove('consultation-fixed-active');

    if (typeof window.mostrarMenuPrincipal === 'function') {
      try { window.mostrarMenuPrincipal(); } catch(e) {}
    } else {
      if (menu) menu.classList.add('show');
      document.body.classList.add('main-menu-active');
    }

    if (menu) menu.classList.add('show');
    document.body.classList.add('main-menu-active');

    if (main) main.classList.remove('consultation-fixed-active');
    document.body.classList.remove('fixed-workspace-active','consultation-screen-active');
  }

  function finish(){
    if (finished) return;
    finished = true;

    if (splash) splash.classList.add('ops-hide');

    window.setTimeout(function(){
      if (splash) {
        try { splash.remove(); } catch(e) {}
      }

      /* Menu já preparado, mas continua invisível durante esta passagem. */
      prepareMainMenu();

      /* O desbloqueio visual só acontece quando o menu está no estado certo. */
      requestAnimationFrame(function(){
        try { document.documentElement.classList.remove('verix-starting'); } catch(e) {}

        /* Garante que o menu aparece antes do aviso. */
        requestAnimationFrame(function(){
          var o=document.getElementById('verixAsfNoticeOverlay');
          if (o) o.setAttribute('aria-hidden','false');
          try { document.dispatchEvent(new CustomEvent('verix:boot-complete')); } catch(e) {}
        });
      });
    }, FADE_MS);
  }

  forceStartupState();

  /* Espera o documento inteiro estar parseado. */
  function startTimer(){
    if (finished) return;
    var elapsed=performance.now()-started;
    var remaining=Math.max(0,SPLASH_MS-elapsed);
    window.setTimeout(finish,remaining);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded',startTimer,{once:true});
  } else {
    startTimer();
  }

  window.fecharAvisoASFInicial=function(){
    var o=document.getElementById('verixAsfNoticeOverlay');
    if(o) o.setAttribute('aria-hidden','true');
  };
})();
