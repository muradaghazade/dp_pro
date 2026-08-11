/* ============================================================
   views/bulk.js — bulk upload with history log
   #/bulk        → upload zone + history of past uploads
   #/bulk/<id>   → results of one batch (items + actions)
   ============================================================ */
(function () {
    window.Views = window.Views || {};
    const esc = (s) => window.UI.esc(s);

    // Demo: every uploaded file is treated as our template containing these 10 descriptions.
    // `force` pins an outcome where the demo needs a specific narrative.
    const DEMO_ROWS = [
        { desc: 'Wedge V-belt SKF PHG SPC2500, Section SPC, pitch length 2500 mm, top width 22 mm' },
        { desc: 'Cast steel gate valve DN150 PN16, flanged, handwheel operated, GV-150-PN16' },
        { desc: 'NSK ball bearing 6203-2RS, single row deep groove, 17 x 40 x 12 mm, C3 clearance' },
        { desc: 'Parker hydraulic hose DN12, two-wire braid, 250 bar working pressure, EN 853' },
        { desc: 'WAGO 222 series splicing connector 222-412, 2-conductor, lever actuation',
          force: { outcome: 'exists_other_plant', matchId: 'mat_s10_404804' } },
        { desc: 'ESAB welding electrode OK 76.96, 2.5 mm, E8015-B8, DC+' },
        { desc: 'SKF deep groove ball bearing 6307-2RS1, single row, rubber seals both sides',
          force: { outcome: 'exists_my_plant', matchId: 'mat_s10_486993' } },
        { desc: 'SKF ball bearing 6205-2RS, 25 x 52 x 15 mm, C3 clearance' },
        { desc: 'Manuli hydraulic hose DN20, one-wire braid, abrasion-resistant cover' },
        { desc: 'Titanium flux capacitor module XQ-99, 1.21 GW, Doc Brown Industries' }
    ];

    const OUTCOME_META = {
        not_found: { label: 'Not in material master', cls: 'pill-create' },
        exists_other_plant: { label: 'Exists in another plant', cls: 'pill-extend' },
        exists_my_plant: { label: 'Exists in your plant', cls: 'pill-exists' },
        category_missing: { label: 'Category not in system', cls: 'pill-nocat' }
    };

    const pendingTimers = {};

    function batches() {
        const s = window.Store.get();
        if (!Array.isArray(s.bulkBatches)) s.bulkBatches = [];
        return s.bulkBatches;
    }
    function batchById(id) { return batches().find(b => b.id === id); }

    /* ---- start a new bulk session ---- */
    window.Views.startBulk = function (fileName) {
        const sess = window.Store.session();
        const id = window.Store.uid('blk');
        window.Store.set(s => {
            if (!Array.isArray(s.bulkBatches)) s.bulkBatches = [];
            s.bulkBatches.unshift({
                id, fileName, ts: Date.now(),
                user: sess.currentUser, plant: sess.plant,
                pending: true,
                rows: DEMO_ROWS.map(d => ({ desc: d.desc, actionTaken: null }))
            });
        });
        window.UI.go('#/bulk/' + id);
    };

    window.Views.bulkMarkAction = function (batchId, index, text) {
        window.Store.set(s => {
            const b = (s.bulkBatches || []).find(x => x.id === batchId);
            if (b && b.rows[index]) b.rows[index].actionTaken = text;
        });
    };

    /* ---- analyse a row (deterministic → recomputed per render) ---- */
    function processRow(row, i) {
        const a = window.AI.analyze(row.desc);
        const force = (DEMO_ROWS[i] || {}).force;
        let outcome = a.outcome, match = a.exactMatch;
        if (force) {
            outcome = force.outcome;
            match = window.Store.materialById(force.matchId) || match;
            if (outcome === 'exists_other_plant' && match && match.plants.indexOf(window.Store.session().plant) !== -1) {
                outcome = 'exists_my_plant';   // was extended meanwhile → now exists here
            }
        }
        return { row, i, a, outcome, match };
    }

    /* ================= history page (#/bulk) ================= */
    function uploadBoxHtml(hasHistory) {
        return `
            <div class="upload-zone">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#8aa87b" stroke-width="1.6"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <div>
                    <div style="font-weight:700;margin-bottom:3px">${hasHistory ? 'Upload a new template file' : 'Upload your template file'}</div>
                    <div class="muted" style="font-size:13px">Excel (.xlsx / .xls) or CSV with one item description per row.
                        <button class="btn-link" data-act="template">Download template</button></div>
                </div>
                <div style="margin-left:auto">
                    <input type="file" id="bulk-file" accept=".xlsx,.xls,.csv" hidden>
                    <button class="btn btn-black" data-act="choose-file">Choose file & submit</button>
                </div>
            </div>`;
    }

    function historyHtml() {
        const list = batches();
        if (!list.length) return `<div class="empty-state">No bulk uploads yet. Upload a template to see AI results for every row.</div>`;
        return `
            <div class="section-title" style="margin-top:24px">Upload history</div>
            <table class="data-table">
                <thead><tr>
                    <th>File</th><th>Uploaded by</th><th>Plant</th><th>Date</th>
                    <th>Items</th><th>Progress</th><th>Status</th>
                </tr></thead>
                <tbody>${list.map(b => {
                    const done = b.rows.filter(r => r.actionTaken).length;
                    const actionable = b.pending ? 0 : b.rows.map((r, i) => processRow(r, i))
                        .filter(x => x.outcome !== 'exists_my_plant').length;
                    const status = b.pending ? '<span class="status-pill in-review">Processing</span>'
                        : (actionable > 0 && done >= actionable ? '<span class="status-pill approved">All actioned</span>'
                            : '<span class="status-pill pill-create">Open actions</span>');
                    return `<tr class="clickable" data-act="open-batch" data-id="${b.id}">
                        <td style="font-weight:600">📄 ${esc(b.fileName)}</td>
                        <td>${esc(b.user || '—')}</td>
                        <td>${esc(b.plant || '—')}</td>
                        <td>${window.UI.nowLabel(b.ts)}</td>
                        <td>${b.rows.length}</td>
                        <td>${done} of ${actionable || '—'} actioned</td>
                        <td>${status}</td>
                    </tr>`;
                }).join('')}</tbody>
            </table>`;
    }

    window.Views.bulk = function () {
        const root = document.getElementById('view');
        root.innerHTML = `
            <div class="sub-header"><span class="crumb-link" data-act="home">Material Master</span> › Bulk upload</div>
            <div class="page-narrow" style="padding-top:4px">
                <div class="form-header" style="margin-top:6px">
                    <div>
                        <h2 style="font-size:20px;font-weight:600">Bulk upload</h2>
                        <div class="muted" style="font-size:13px;margin-top:2px">Upload a template of item descriptions — the AI engine processes every row and tells you what to do for each item.</div>
                    </div>
                </div>
                ${uploadBoxHtml(batches().length > 0)}
                ${historyHtml()}
            </div>`;
        bindCommon(root);
        window.UI.bindActions(root, Object.assign(commonActions(root), {
            'open-batch': (t) => window.UI.go('#/bulk/' + t.getAttribute('data-id'))
        }));
    };

    /* ================= batch results page (#/bulk/<id>) ================= */
    function summaryHtml(items) {
        const count = (o) => items.filter(x => x.outcome === o && !x.row.actionTaken).length;
        const done = items.filter(x => x.row.actionTaken).length;
        const chip = (n, label, cls) => `<span class="bulk-sum ${cls}">${n} ${label}</span>`;
        return `<div class="bulk-summary">
            ${chip(count('not_found'), 'to create', 'pill-create')}
            ${chip(count('exists_other_plant'), 'to extend', 'pill-extend')}
            ${chip(count('exists_my_plant'), 'already in your plant', 'pill-exists')}
            ${chip(count('category_missing'), 'need a category', 'pill-nocat')}
            ${done ? chip(done, 'actioned', 'pill-done') : ''}
        </div>`;
    }

    function actionCell(x) {
        if (x.row.actionTaken) return `<span class="bulk-done">✓ ${esc(x.row.actionTaken)}</span>`;
        switch (x.outcome) {
            case 'not_found':
                return `<button class="btn btn-black btn-sm" data-act="bulk-create" data-i="${x.i}">Create new item</button>`;
            case 'exists_other_plant':
                return `<button class="btn btn-green btn-sm" data-act="bulk-extend" data-i="${x.i}">↗ Extend to my plant</button>`;
            case 'exists_my_plant':
                return `<span class="muted" style="font-size:12px;margin-right:8px">No action needed</span>
                    <button class="btn btn-outline btn-sm" data-act="bulk-view" data-i="${x.i}">View record</button>`;
            case 'category_missing':
                return `<button class="btn btn-outline btn-sm" data-act="bulk-cat" data-i="${x.i}">Request category</button>`;
        }
        return '';
    }

    /* ---- one-click bulk submission: all rows sharing the same needed action
       are submitted together as ONE bulk request for the approval chain ---- */
    function bulkActionsHtml(items) {
        const pend = (o) => items.filter(x => x.outcome === o && !x.row.actionTaken);
        const creates = pend('not_found').length;
        const extends_ = pend('exists_other_plant').length;
        const cats = pend('category_missing').length;
        if (creates + extends_ + cats === 0) return '';
        return `<div class="bulk-actions-bar">
            <span class="bab-label">Bulk actions</span>
            ${creates ? `<button class="btn btn-black btn-sm" data-act="bulk-all-create">Create all new items (${creates})</button>` : ''}
            ${extends_ ? `<button class="btn btn-green btn-sm" data-act="bulk-all-extend">↗ Extend all to my plant (${extends_})</button>` : ''}
            ${cats ? `<button class="btn btn-outline btn-sm" data-act="bulk-all-cat">Request all categories (${cats})</button>` : ''}
            <span class="muted" style="font-size:12px">One request per action — approvers review the whole batch at once.</span>
        </div>`;
    }

    function resultsHtml(batch) {
        const items = batch.rows.map((r, i) => processRow(r, i));
        return `
            ${summaryHtml(items)}
            ${bulkActionsHtml(items)}
            <table class="data-table bulk-table">
                <thead><tr>
                    <th style="width:34px">#</th>
                    <th>Uploaded description</th>
                    <th>AI-identified item</th>
                    <th>Category · UNSPSC</th>
                    <th>Result</th>
                    <th style="width:220px">Action</th>
                </tr></thead>
                <tbody>${items.map(x => {
                    const om = OUTCOME_META[x.outcome] || {};
                    const p = x.a.parsed;
                    const cat = p.materialGroup ? `${esc(p.unspscLabel)} · ${esc(p.unspsc)}` : '<span class="muted">—</span>';
                    const plantHint = x.outcome === 'exists_other_plant' && x.match ? `<div class="muted" style="font-size:11px;margin-top:2px">In plant ${esc(x.match.plants[0])} — ${esc(window.UI.plantName(x.match.plants[0]))}</div>` :
                        (x.outcome === 'exists_my_plant' && x.match ? `<div class="muted" style="font-size:11px;margin-top:2px">SAP ID ${esc(x.match.sapId || '—')}</div>` : '');
                    return `<tr>
                        <td class="muted">${x.i + 1}</td>
                        <td style="max-width:260px"><div class="bulk-desc">${esc(x.row.desc)}</div></td>
                        <td style="max-width:200px;font-weight:600">${esc(p.shortName || p.summary)}</td>
                        <td>${cat}</td>
                        <td><span class="status-pill ${om.cls}">${esc(om.label || x.outcome)}</span>${plantHint}</td>
                        <td>${actionCell(x)}</td>
                    </tr>`;
                }).join('')}</tbody>
            </table>`;
    }

    window.Views.bulkDetail = function (id) {
        const root = document.getElementById('view');
        const batch = batchById(id);
        if (!batch) {
            root.innerHTML = `<div class="page-narrow"><div class="empty-state">Bulk upload not found. <button class="btn-link" data-act="to-bulk">Back to Bulk upload</button></div></div>`;
            window.UI.bindActions(root, { 'to-bulk': () => window.UI.go('#/bulk') });
            return;
        }

        let body;
        if (batch.pending) {
            body = `<div class="ai-panel" style="margin-top:18px"><div class="ai-panel-head">✦ AI Mastering — processing “${esc(batch.fileName)}”</div>
                <div class="ai-panel-body"><div class="ai-steps">
                    <div class="ai-step"><span class="tick">✓</span>File received — ${batch.rows.length} descriptions found</div>
                    <div class="ai-step"><span class="spinner"></span><span class="muted">Parsing, categorising and checking each item against the material master…</span></div>
                </div></div></div>`;
            if (!pendingTimers[id]) {
                pendingTimers[id] = setTimeout(() => {
                    delete pendingTimers[id];
                    window.Store.set(s => {
                        const b = (s.bulkBatches || []).find(x => x.id === id);
                        if (b) b.pending = false;
                    });
                    const b2 = batchById(id);
                    if (b2) b2.rows.forEach(r => {
                        const a = window.AI.analyze(r.desc);
                        if (a.categoryFound) window.AI.registerCategory(a);
                    });
                    if (window.location.hash === '#/bulk/' + id) window.Views.bulkDetail(id);
                }, 1600);
            }
        } else {
            body = `${resultsHtml(batch)}`;
        }

        const done = batch.rows.filter(r => r.actionTaken).length;
        root.innerHTML = `
            <div class="sub-header"><span class="crumb-link" data-act="home">Material Master</span> ›
                <span class="crumb-link" data-act="to-bulk">Bulk upload</span> › ${esc(batch.fileName)}</div>
            <div class="page-narrow" style="padding-top:4px">
                <div class="back-link" data-act="to-bulk">‹ Back to upload history</div>
                <div class="form-header" style="margin-top:2px">
                    <div>
                        <h2 style="font-size:20px;font-weight:600">Results — ${esc(batch.fileName)}</h2>
                        <div class="muted" style="font-size:13px;margin-top:2px">
                            ${batch.rows.length} descriptions · uploaded by ${esc(batch.user || '—')} (Plant ${esc(batch.plant || '—')}) · ${window.UI.nowLabel(batch.ts)}${batch.pending ? '' : ' · ' + done + ' actioned'}</div>
                    </div>
                </div>
                ${body}
            </div>`;

        bindCommon(root);
        window.UI.bindActions(root, Object.assign(commonActions(root), {
            'to-bulk': () => window.UI.go('#/bulk'),
            'bulk-create': (t) => {
                const i = +t.getAttribute('data-i');
                const a = window.AI.analyze(batch.rows[i].desc);
                window.Views._draft = { type: 'create', payload: window.AI.toPayload(a), analysis: a, fromBulk: { batch: batch.id, i } };
                window.UI.go('#/request/new?type=create');
            },
            'bulk-extend': (t) => {
                const i = +t.getAttribute('data-i');
                const x = processRow(batch.rows[i], i);
                if (!x.match) return;
                window.Views._draft = { type: 'extend', materialId: x.match.id, fromBulk: { batch: batch.id, i } };
                window.UI.go('#/request/new?type=extend&mat=' + x.match.id);
            },
            'bulk-view': (t) => {
                const i = +t.getAttribute('data-i');
                const x = processRow(batch.rows[i], i);
                if (x.match) window.UI.go('#/item/' + x.match.id);
            },
            'bulk-cat': (t) => {
                const i = +t.getAttribute('data-i');
                window.Views.bulkMarkAction(batch.id, i, 'Category requested from Data Steward');
                window.UI.toast({ title: 'Request sent to Data Steward', body: 'A new-category request was raised for this item.', kind: 'info' });
                window.Views.bulkDetail(batch.id);
            },
            'bulk-all-create': () => submitBulkAction(batch, 'not_found'),
            'bulk-all-extend': () => submitBulkAction(batch, 'exists_other_plant'),
            'bulk-all-cat': () => submitBulkAction(batch, 'category_missing')
        }));
    };

    /* ---- submit ONE bulk request for every pending row with the given outcome ---- */
    function submitBulkAction(batch, outcome) {
        const rows = batch.rows.map((r, i) => processRow(r, i)).filter(x => x.outcome === outcome && !x.row.actionTaken);
        if (!rows.length) return;
        const type = { not_found: 'create', exists_other_plant: 'extend', category_missing: 'category' }[outcome];
        const items = [];
        rows.forEach(x => {
            if (type === 'create') {
                items.push({ desc: x.row.desc, payload: window.AI.toPayload(x.a) });
            } else if (type === 'extend') {
                if (!x.match) return;
                items.push({ desc: x.row.desc, materialId: x.match.id,
                    payload: { shortName: x.match.shortName, name: x.match.name, unspsc: x.match.unspsc, sapIdSource: x.match.sapId } });
            } else {
                const cs = x.a.categorySuggestion;
                if (!cs) return;
                items.push({ desc: x.row.desc, payload: Object.assign({ sourceText: x.row.desc,
                    name: cs.categoryName, shortName: cs.categoryName }, JSON.parse(JSON.stringify(cs))) });
            }
        });
        if (!items.length) return;
        const req = window.Workflow.createBulkRequest({ type, items });
        window.Store.set(s => {
            const b = (s.bulkBatches || []).find(z => z.id === batch.id);
            if (b) rows.forEach(x => { if (b.rows[x.i]) b.rows[x.i].actionTaken = 'Submitted in bulk — ' + window.Workflow.reqNo(req); });
        });
        const firstStage = window.Workflow.stagesFor(req)[0];
        window.UI.toast({ title: 'Bulk request submitted',
            body: window.Workflow.reqNo(req) + ' — ' + items.length + ' item(s) sent to ' + (firstStage ? firstStage.role : 'review') + '.', kind: 'info' });
        window.UI.go('#/request/' + req.id);
    }

    /* ---- shared bits ---- */
    function commonActions(root) {
        return {
            'home': () => window.UI.go('#/master'),
            'template': () => window.UI.toast({ title: 'Template downloaded', body: 'dmp_bulk_template.xlsx — one item description per row.', kind: 'info' }),
            'choose-file': () => { const fi = root.querySelector('#bulk-file'); if (fi) fi.click(); }
        };
    }
    function bindCommon(root) {
        const fi = root.querySelector('#bulk-file');
        if (fi) fi.addEventListener('change', e => {
            const f = e.target.files && e.target.files[0];
            if (f) window.Views.startBulk(f.name);
        });
    }
})();
