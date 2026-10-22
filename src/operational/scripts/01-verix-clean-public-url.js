
(function(){
  'use strict';
  try {
    var search = String(window.location.search || '');
    if (/[?&]_(?:verix|auto|mobile)(?:=|&|$)/i.test(search)) {
      var path = String(window.location.pathname || '');
      path = path.replace(/verix-app\.html$/i, '');
      if (path.charAt(path.length - 1) !== '/') path += '/';
      window.history.replaceState(window.history.state, document.title, path + String(window.location.hash || ''));
    }
  } catch (_) {}
})();
