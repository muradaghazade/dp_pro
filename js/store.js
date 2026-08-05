/* ============================================================
   store.js — localStorage-backed application state
   ============================================================ */
(function () {
    const KEY = 'dmp_dp_state_v1';
    let state = null;
    let loadedSavedAt = 0;   // __savedAt as it was when loaded — the honest age of the local copy
    const listeners = new Set();

    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) { /* ignore */ }
        return null;
    }

    function persist() {
        state.__savedAt = Date.now();
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
        scheduleServerSave();
    }

    /* ---- server-side persistence: every change is synced (debounced) to
       /api/state, which server.py stores on disk with rolling backups.
       localStorage stays as a fast local cache; the copy with the newest
       __savedAt wins on load. Fails silently on static-only hosts. ---- */
    let saveTimer = null;
    let syncPending = false;
    function scheduleServerSave() {
        if (typeof fetch !== 'function' || syncPending) return;   // never race the initial pull
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            try {
                fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(state) }).catch(() => {});
            } catch (e) { /* ignore */ }
        }, 400);
    }
    function syncFromServer(done) {
        if (typeof fetch !== 'function') { if (done) done(false); return; }
        syncPending = true;
        clearTimeout(saveTimer);
        fetch('/api/state', { cache: 'no-store' })
            .then(r => (r.status === 200 ? r.json() : null))
            .catch(() => null)
            .then(remote => {
                let changed = false;
                if (remote && remote.__seeded) {
                    // compare against the age of the copy as LOADED — boot-time persists
                    // re-stamp __savedAt and must not make stale local data look fresh.
                    // A fresh seed (wiped browser) always defers to the server copy.
                    if (state.__freshSeed || (remote.__savedAt || 0) > loadedSavedAt) {
                        state = remote;
                        migrate(state);
                        loadedSavedAt = remote.__savedAt || 0;
                        changed = true;
                    }
                }
                delete state.__freshSeed;
                try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
                syncPending = false;
                scheduleServerSave();   // make sure the server holds the current state
                if (done) done(changed);
            });
    }
    // flush the latest state when the tab closes (covers the debounce window)
    if (typeof window.addEventListener === 'function') {
        window.addEventListener('beforeunload', () => {
            try {
                if (state && navigator.sendBeacon) navigator.sendBeacon('/api/state', JSON.stringify(state));
            } catch (e) { /* ignore */ }
        });
    }

    function init() {
        state = load();
        loadedSavedAt = (state && state.__savedAt) || 0;
        if (!state || !state.__seeded) {
            state = window.Seed.build();      // fresh seed
            state.__seeded = true;
            state.__freshSeed = true;         // must defer to any existing server-side state
            state.__spec10Cleanup = 2;        // fresh seeds already contain only the Spec10 master
            state.__spec10V = 4;              // ...at the current (verbatim + images) data version
            state.__mroV = 1;                 // ...with MRO-structured descriptions
        } else {
            migrate(state);                   // backfill keys added in newer versions
        }
        persist();
    }

    // non-destructive migration: add any datasets / top-level keys introduced after this
    // state was first persisted, without wiping the user's requests/materials.
    function migrate(s) {
        const fresh = window.Seed.build();
        // refresh static reference datasets from the current seed, but keep the user's
        // dynamically-grown category catalog.
        const keepCats = (s.datasets && Array.isArray(s.datasets.CATEGORY_ATTRIBUTES)) ? s.datasets.CATEGORY_ATTRIBUTES : fresh.datasets.CATEGORY_ATTRIBUTES;
        // legacy plain-string attributes → structured schema objects; adopt richer
        // fresh-seed schemas for the built-in categories that still look legacy
        keepCats.forEach(c => {
            const freshCat = fresh.datasets.CATEGORY_ATTRIBUTES.find(f => f.unspsc === c.unspsc);
            if ((c.attributes || []).some(a => typeof a === 'string')) {
                c.attributes = freshCat ? freshCat.attributes
                    : c.attributes.map(a => typeof a === 'string' ? { name: a, uom: '', mandatory: false, fieldType: 'Text', options: '' } : a);
            }
        });
        // manufacturers are editable master data — keep the user's list if present
        const keepManu = (s.datasets && Array.isArray(s.datasets.MANUFACTURERS)) ? s.datasets.MANUFACTURERS : fresh.datasets.MANUFACTURERS;
        // merge newly seeded catalog categories / manufacturers (e.g. the Spec10 batch)
        fresh.datasets.CATEGORY_ATTRIBUTES.forEach(fc => { if (!keepCats.some(c => c.unspsc === fc.unspsc)) keepCats.push(fc); });
        fresh.datasets.MANUFACTURERS.forEach(fm => { if (!keepManu.some(m => m.name === fm.name)) keepManu.push(fm); });
        s.datasets = Object.assign({}, fresh.datasets, { CATEGORY_ATTRIBUTES: keepCats, MANUFACTURERS: keepManu });
        if (!Array.isArray(s.users)) s.users = fresh.users;
        // legacy single-plant users → plants array
        s.users.forEach(u => {
            if (!Array.isArray(u.plants)) { u.plants = u.plant ? [u.plant] : []; delete u.plant; }
        });
        if (!s.session) s.session = fresh.session;
        if (!s.session.lang) s.session.lang = 'en';
        if (!Array.isArray(s.materials)) s.materials = fresh.materials;
        // one-time reset (Jul 2026): the material master was rebuilt to contain only the
        // Spec10 batch — drop everything else from old states: other materials, requests
        // tied to them, and unfinished create requests (the Draft / In review cards)
        if (s.__spec10Cleanup !== 2) {
            const dropped = s.materials.filter(m => m.id.indexOf('mat_s10_') !== 0).map(m => m.id);
            s.materials = s.materials.filter(m => m.id.indexOf('mat_s10_') === 0);
            if (Array.isArray(s.requests)) s.requests = s.requests.filter(r =>
                dropped.indexOf(r.materialId) === -1 && !(r.type === 'create' && r.status !== 'Completed'));
            s.__spec10Cleanup = 2;
        }
        // merge newly seeded materials (e.g. the Spec10 batch) into existing states
        fresh.materials.forEach(fm => { if (!s.materials.some(m => m.id === fm.id)) s.materials.push(fm); });
        // Spec10 data versions are MONOTONIC — each pass runs at most once, ever.
        // (an earlier exact-match check made the v2 pass re-run after v3 had set the
        // flag to 3, re-seeding the records on every other load)
        const dataV = Number(s.__spec10V) || 0;
        // one-time refresh (v2): Spec10 fields are now verbatim from the source file —
        // replace stored copies, keeping any changelog / inventory the user added
        if (dataV < 2) {
            fresh.materials.forEach(fm => {
                const i = s.materials.findIndex(m => m.id === fm.id);
                if (i === -1) return;
                const prev = s.materials[i];
                const nm = JSON.parse(JSON.stringify(fm));
                if (prev.changelog && prev.changelog.length) nm.changelog = prev.changelog;
                if (prev.inventory) nm.inventory = prev.inventory;
                if (prev.image) nm.image = prev.image;   // never drop an uploaded photo
                s.materials[i] = nm;    // stale i18n stamp dropped → re-translated on next sync
            });
            s.__spec10V = 2;
        }
        // one-time: items mastered before the MRO description rule (e.g. dmp 1611)
        // get their short/long descriptions restructured like the rest of the master;
        // the original readable wording moves to the name field
        if (s.__mroV !== 1 && window.AI && window.AI.structuredDesc) {
            s.materials.forEach(m => {
                if (!/[a-z]/.test(m.shortName || '')) return;   // already structured
                if (!m.name || m.name === m.shortName) m.name = m.shortName;
                const sd = window.AI.structuredDesc(m);
                m.shortName = sd.shortName;
                m.longDesc = sd.longDesc;
                delete m.i18n;                                  // re-translate from the new wording
            });
            s.__mroV = 1;
        }
        // v3: restore item photos — recover uploads from completed request payloads
        // (the v2 refresh dropped them), else fall back to the seeded placeholder
        if (dataV < 3) {
            s.materials.forEach(m => {
                // a seeded SVG placeholder may be replaced by a recovered upload; a real upload never is
                if (!m.image || m.image.indexOf('data:image/svg+xml') === 0) {
                    const withImg = (s.requests || []).filter(r =>
                        r.materialId === m.id && r.status === 'Completed' && r.payload && r.payload.image);
                    if (withImg.length) m.image = withImg[withImg.length - 1].payload.image;
                }
                if (!m.image) {
                    const fm = fresh.materials.find(f => f.id === m.id);
                    if (fm && fm.image) m.image = fm.image;
                }
            });
            s.__spec10V = 3;
        }
        // v4: deeper photo recovery — an uploaded photo may sit in ANY request payload
        // for the item (pending amends included, newest first). A placeholder icon is
        // always replaced by a recovered upload; a real photo is never touched.
        if (dataV < 4) {
            s.materials.forEach(m => {
                if (m.image && m.image.indexOf('data:image/svg+xml') !== 0) return;   // real photo present
                const withImg = (s.requests || []).filter(r =>
                    r.materialId === m.id && r.payload && r.payload.image &&
                    String(r.payload.image).indexOf('data:image/svg+xml') !== 0);
                if (withImg.length) m.image = withImg[0].payload.image;   // requests are newest-first
            });
            s.__spec10V = 4;
        }
        // legacy Active/Blocked item statuses → lifecycle status + separate block flag
        s.materials.forEach(m => {
            if (m.itemStatus === 'Active') { m.itemStatus = 'Approved'; m.blockStatus = m.blockStatus || null; }
            else if (m.itemStatus === 'Blocked') { m.itemStatus = 'Approved'; m.blockStatus = m.blockStatus || 'Plant block'; }
            if (m.blockStatus === undefined) m.blockStatus = null;
            if (!Array.isArray(m.changelog)) m.changelog = [];
        });
        if (!Array.isArray(s.requests)) s.requests = [];
        // unify the MDM stage label on requests created before the rename
        s.requests.forEach(r => (r.stages || []).forEach(st => {
            if (st.label === 'Material master review') st.label = 'MDM review';
        }));
        // amend requests no longer have Finance or Inventory stages — strip them
        s.requests.forEach(r => {
            if (r.type !== 'amend' || !Array.isArray(r.stages)) return;
            ['finance', 'inventory'].forEach(key => {
                const fi = r.stages.findIndex(st => st.key === key);
                if (fi === -1) return;
                r.stages.splice(fi, 1);
                if (r.currentStageIndex > fi) r.currentStageIndex -= 1;
            });
            // an amend that was waiting at Inventory is now past its last stage → complete it
            if ((r.status === 'Approved' || r.status === 'In Review') && r.sapId && r.currentStageIndex >= r.stages.length) {
                r.status = 'Completed';
                r.currentStageIndex = r.stages.length;
            }
        });
        // sequential request numbers for older requests created before numbering existed
        s.seq = s.seq || { req: 0 };
        let maxNo = s.requests.reduce((a, r) => Math.max(a, r.no || 0), s.seq.req || 0);
        s.requests.slice().sort((a, b) => (a.createdTs || 0) - (b.createdTs || 0))
            .forEach(r => { if (!r.no) { maxNo += 1; r.no = maxNo; } });
        s.seq.req = maxNo;
        if (!Array.isArray(s.notifications)) s.notifications = fresh.notifications;
        if (!Array.isArray(s.cart)) s.cart = [];
        // legacy single bulk session → history array
        if (!Array.isArray(s.bulkBatches)) s.bulkBatches = [];
        if (s.bulk) {
            s.bulkBatches.unshift(Object.assign({ id: uid('blk'), user: s.session.currentUser, plant: s.session.plant }, s.bulk));
            delete s.bulk;
        }
    }

    function get() { return state; }

    function set(mutator) {
        // mutator receives a draft (the live state); mutate then we persist + notify
        mutator(state);
        persist();
        emit();
    }

    function reset() {
        state = window.Seed.build();
        state.__seeded = true;
        persist();
        emit();
    }

    function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    function emit() { listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } }); }

    // ---- id helpers (deterministic-ish, no external deps) ----
    let _seq = Math.floor(performance.now() * 1000) % 100000;
    function uid(prefix) { _seq += 1; return (prefix || 'id') + '_' + _seq.toString(36) + Date.now().toString(36).slice(-4); }

    // ---- convenience selectors ----
    function materials() { return state.materials; }
    function materialById(id) { return state.materials.find(m => m.id === id); }
    function requests() { return state.requests; }
    function requestById(id) { return state.requests.find(r => r.id === id); }
    function session() { return state.session; }
    function notifications() { return state.notifications; }

    function setRole(role) { set(s => { s.session.currentRole = role; }); }

    function addNotification(n) {
        set(s => {
            s.notifications.unshift(Object.assign({
                id: uid('ntf'), read: false, ts: Date.now()
            }, n));
        });
    }
    function markAllNotificationsRead() {
        set(s => s.notifications.forEach(n => { n.read = true; }));
    }

    window.Store = {
        init, get, set, reset, subscribe, uid,
        materials, materialById, requests, requestById, session, notifications,
        setRole, addNotification, markAllNotificationsRead,
        persist, syncFromServer
    };
})();
