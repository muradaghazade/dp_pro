/* ============================================================
   router.js — hash-based routing
   ============================================================ */
(function () {
    const routes = [
        { re: /^#\/master$/, view: () => window.Views.master() },
        { re: /^#\/item\/([^/?]+)\/history$/, view: (m) => window.Views.itemHistory(m[1]) },
        { re: /^#\/item\/([^/?]+)/, view: (m) => window.Views.item(m[1]) },
        { re: /^#\/request\/new$/, view: () => window.Views.requestForm(parseQuery()) },
        { re: /^#\/request\/([^/?]+)/, view: (m) => window.Views.requestDetail(m[1]) },
        { re: /^#\/inbox$/, view: () => window.Views.inbox() },
        { re: /^#\/categories$/, view: () => window.Views.categories() },
        { re: /^#\/bulk\/([^/?]+)/, view: (m) => window.Views.bulkDetail(m[1]) },
        { re: /^#\/bulk$/, view: () => window.Views.bulk() },
        { re: /^#\/manufacturers$/, view: () => window.Views.manufacturers() },
        { re: /^#\/users$/, view: () => window.Views.users() }
    ];

    function parseQuery() {
        const q = {};
        const i = window.location.hash.indexOf('?');
        if (i === -1) return q;
        new URLSearchParams(window.location.hash.slice(i + 1)).forEach((v, k) => q[k] = v);
        return q;
    }

    function render() {
        const hash = window.location.hash || '#/master';
        const path = hash.split('?')[0];
        window.UI.renderHeader();
        const viewRoot = document.getElementById('view');
        let matched = false;
        for (const r of routes) {
            const m = (hash.indexOf('?') > -1 ? hash : path).match(r.re) || path.match(r.re);
            if (m) { r.view(m); matched = true; break; }
        }
        if (!matched) { window.location.hash = '#/master'; return; }
        window.scrollTo(0, 0);
    }

    function start() {
        window.addEventListener('hashchange', render);
        // re-render header badges when state changes (view handles its own re-render on nav)
        window.Store.subscribe(() => { window.UI.renderHeader(); });
        if (!window.location.hash) window.location.hash = '#/master';
        else render();
    }

    window.Router = { start, render, parseQuery };
})();
