/* ============================================================
   app.js — bootstrap
   ============================================================ */
(function () {
    window.Views = window.Views || {};
    function boot() {
        window.Store.init();
        window.Router.start();
        if (window.I18N) window.I18N.apply();   // re-apply persisted language
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
