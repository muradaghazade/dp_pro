/* ============================================================
   app.js — bootstrap
   ============================================================ */
(function () {
    window.Views = window.Views || {};
    function boot() {
        window.Store.init();
        window.Router.start();
        if (window.I18N) window.I18N.apply();   // re-apply persisted language
        // pull the server-side copy of the state (data/state.json) — if it is newer
        // than the local cache (e.g. localStorage was cleared), adopt it and re-render
        window.Store.syncFromServer(function (changed) {
            if (!changed) return;
            window.UI.renderHeader();
            window.Router.render();
            if (window.I18N) window.I18N.apply();
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
