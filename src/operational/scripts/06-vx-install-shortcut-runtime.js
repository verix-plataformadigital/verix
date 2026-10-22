
(function(){
  'use strict';
  var deferredInstallPrompt = null;
  var appUrl = 'https://verix-plataformadigital.github.io/verix/';
  var installButtonId = 'vxInstallShortcutButton';

  // A pass-through service worker satisfies Chromium's install-prompt criteria
  // without caching operational pages, scripts, queries, or authority responses.
  if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js?v=20261017-install', {
      scope: './',
      updateViaCache: 'none'
    }).then(function(registration) {
      return registration.update().catch(function(){});
    }).catch(function(){});
  }

  function isStandalone(){
    try {
      return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        navigator.standalone === true;
    } catch (_) { return false; }
  }
  function markInstalled(){
    document.documentElement.classList.add('vx-install-standalone');
    var button = document.getElementById(installButtonId);
    if(button) button.hidden = true;
  }
  if(isStandalone()) markInstalled();

  window.addEventListener('beforeinstallprompt', function(event){
    event.preventDefault();
    deferredInstallPrompt = event;
    document.documentElement.classList.add('vx-install-prompt-ready');
  });
  window.addEventListener('appinstalled', function(){
    deferredInstallPrompt = null;
    markInstalled();
  });

  function showInstallGuide(){
    if(document.getElementById('vxInstallGuideDialog')) return;
    var ua = navigator.userAgent || '';
    var isEdge = /Edg\//i.test(ua);
    var isChrome = /Chrome\//i.test(ua) && !isEdge;
    var steps;
    if(isEdge){
      steps = '<ol><li>Abre o menu <strong>⋯</strong> do Edge.</li><li>Escolhe <strong>Aplicações → Instalar este site como aplicação</strong>.</li><li>Na janela final, escolhe <strong>Criar atalho do Ambiente de Trabalho</strong>. Se não aparecer, abre <code>edge://apps</code> → <strong>Detalhes</strong> → <strong>Criar atalho de Ambiente de Trabalho</strong>.</li></ol>';
    } else if(isChrome){
      steps = '<ol><li>Abre o menu <strong>⋮</strong> do Chrome.</li><li>Escolhe <strong>Transmitir, guardar e partilhar → Instalar página como aplicação</strong>.</li><li>Confirma <strong>Instalar</strong>. No Windows, o Chrome cria normalmente o atalho do PWA; se não aparecer, abre <code>chrome://apps</code> e cria-o a partir do VÉRIX.</li></ol>';
    } else {
      steps = '<ol><li>Abre o menu do teu navegador e procura <strong>Instalar este site como aplicação</strong>.</li><li>Se não houver essa opção, no Ambiente de Trabalho clica com o botão direito → <strong>Novo → Atalho</strong>.</li><li>Cola o endereço abaixo e dá ao atalho o nome <strong>VÉRIX</strong>.</li></ol>';
    }
    var dialog = document.createElement('dialog');
    dialog.id = 'vxInstallGuideDialog';
    dialog.className = 'vx-install-guide';
    dialog.setAttribute('aria-labelledby','vxInstallGuideTitle');
    dialog.innerHTML = '<section class="vx-install-guide-panel">' +
      '<header class="vx-install-guide-head"><span class="vx-install-guide-mark" aria-hidden="true">V</span><div><div class="vx-install-guide-kicker">ACESSO RÁPIDO</div><h2 id="vxInstallGuideTitle">Adicionar o VÉRIX</h2></div><button type="button" class="vx-install-guide-close" data-vx-guide-close aria-label="Fechar">×</button></header>' +
      '<p class="vx-install-guide-intro">A instalação direta ainda não está disponível neste momento. Usa os passos abaixo; depois da instalação, o VÉRIX abre numa janela própria.</p>' +
      '<div class="vx-install-guide-steps">' + steps + '</div>' +
      '<div class="vx-install-guide-address"><code>verix-plataformadigital.github.io/verix/</code><button type="button" class="vx-install-guide-copy" data-vx-copy-link>Copiar endereço</button></div>' +
      '<p class="vx-install-guide-status" data-vx-guide-status role="status" aria-live="polite"></p>' +
      '<footer class="vx-install-guide-actions"><button type="button" data-vx-guide-close>Fechar</button></footer>' +
      '</section>';
    document.body.appendChild(dialog);
    dialog.addEventListener('click', function(event){
      if(event.target === dialog) dialog.close();
    });
    dialog.querySelectorAll('[data-vx-guide-close]').forEach(function(button){
      button.addEventListener('click', function(){ dialog.close(); });
    });
    dialog.addEventListener('close', function(){ dialog.remove(); });
    dialog.querySelector('[data-vx-copy-link]').addEventListener('click', function(){
      var status = dialog.querySelector('[data-vx-guide-status]');
      function copied(){ status.textContent = 'Endereço copiado. Já o podes colar ao criar o atalho.'; }
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(appUrl).then(copied).catch(function(){
          status.textContent = 'Não foi possível copiar automaticamente. Seleciona o endereço e copia-o manualmente.';
        });
      } else {
        status.textContent = 'O browser não permite copiar automaticamente. Usa o endereço indicado acima.';
      }
    });
    if(typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open','');
  }

  document.addEventListener('click', function(event){
    var target = event.target;
    var button = target && target.closest ? target.closest('#' + installButtonId) : null;
    if(!button) return;
    event.preventDefault();
    if(isStandalone()) { markInstalled(); return; }
    if(!deferredInstallPrompt) { showInstallGuide(); return; }
    var promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    try {
      Promise.resolve(promptEvent.prompt()).then(function(){
        return promptEvent.userChoice;
      }).then(function(choice){
        if(choice && choice.outcome === 'accepted') markInstalled();
        else document.documentElement.classList.remove('vx-install-prompt-ready');
      }).catch(showInstallGuide);
    } catch (_) { showInstallGuide(); }
  });
})();
