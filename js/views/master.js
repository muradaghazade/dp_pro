/* ============================================================
   views/master.js — material master list + AI search / duplicate detection
   ============================================================ */
(function () {
    window.Views = window.Views || {};
    const S = {
        query: '', analysis: null, loading: false, layout: 'list', sidebarCollapsed: false,
        filters: { statuses: [], blocks: [], manufacturer: '', category: '', plant: '', attrs: {} }
    };
    function filtersActive() {
        const f = S.filters;
        return f.statuses.length || f.blocks.length || f.manufacturer || f.category || f.plant || Object.keys(f.attrs).length;
    }
    // schema of the currently selected category filter (matched by label)
    function selectedCategorySchema() {
        if (!S.filters.category) return null;
        return (window.UI.ds().CATEGORY_ATTRIBUTES || []).find(c => c.label === S.filters.category) || null;
    }

    function icon(name) {
        const I = {
            search: `<svg class="search-icon-embedded" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
            filter: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
            star: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
            grid: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
            list: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`
        };
        return I[name] || '';
    }
    const esc = (s) => window.UI.esc(s);

    // shared card body: title + pills, description, labeled meta grid, plant chips
    function cardShell(opts) {
        // opts: {act, id, image, title, desc, pills, meta:[{k,v}], plants:[], footNote}
        const noImg = `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#C9CCC6" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`;
        return `<div class="material-card ${opts.cardCls || ''}" data-act="${opts.act}" data-id="${opts.id}">
            <div class="material-img-frame">${opts.image ? `<img src="${opts.image}" alt="">` : noImg}</div>
            <div class="material-details">
                <div class="mc-top">
                    <h3 class="material-title">${esc(opts.title)}</h3>
                    <div class="mc-pills">${opts.pills}</div>
                </div>
                <div class="material-desc-line">${esc(opts.desc || '')}</div>
                <div class="mc-meta-grid">
                    ${opts.meta.map(x => `<div class="mc-meta"><span class="k">${esc(x.k)}</span><span class="v">${esc(x.v || '—')}</span></div>`).join('')}
                </div>
                <div class="mc-foot">
                    <div class="mc-plants">${(opts.plants || []).length
                        ? `<span class="plants-label">Plant${opts.plants.length > 1 ? 's' : ''} - </span>` +
                          opts.plants.map(pc => `<span class="plant-chip">${esc(window.UI.plantLabel(pc))}</span>`).join('')
                        : '<span class="muted" style="font-size:12px">No plants</span>'}</div>
                    ${opts.footNote ? `<span class="mc-footnote">${esc(opts.footNote)}</span>` : ''}
                </div>
            </div>
        </div>`;
    }

    function cardHtml(m) {
        const status = m.itemStatus || 'Approved';
        const statusCls = { 'Approved': 'approved', 'In review': 'in-review', 'Draft': 'draft' }[status] || 'approved';
        const pills = `<span class="status-pill ${statusCls}">${esc(status)}</span>` +
            (m.blockStatus ? `<span class="status-pill blocked">${esc(m.blockStatus)}</span>` : '');
        const category = (m.unspscLabel || m.category) ? (m.unspscLabel || m.category) + (m.unspsc ? ' · ' + m.unspsc : '') : '';
        const meta = [];
        if (m.manufacturer) meta.push({ k: 'Manufacturer', v: m.manufacturer });
        if (m.mfrPartNo) meta.push({ k: 'Part #', v: m.mfrPartNo });
        meta.push({ k: 'Category · UNSPSC', v: category });
        meta.push({ k: 'SAP ID', v: m.sapId });
        meta.push({ k: 'Material group', v: m.materialGroup });
        meta.push({ k: 'Base UoM', v: m.baseUom });
        return cardShell({
            act: 'open-item', id: m.id, image: m.image,
            title: m.shortName || m.name, desc: m.longDesc, pills,
            meta,
            plants: m.plants || [],
            footNote: 'dmp ID ' + (m.dmpId || '—'),
            cardCls: m.blockStatus ? 'card-blocked' : ''
        });
    }

    // pending create-requests surfaced in the list as Draft / In review items
    function pendingCardHtml(r) {
        const p = r.payload || {};
        const status = r.status === 'Draft' ? 'Draft' : 'In review';
        const cls = status === 'Draft' ? 'draft' : 'in-review';
        const st = window.Workflow.currentStage(r);
        const category = p.unspscLabel ? p.unspscLabel + (p.unspsc ? ' · ' + p.unspsc : '') : '';
        const meta = [];
        if (p.manufacturer) meta.push({ k: 'Manufacturer', v: p.manufacturer });
        if (p.mfrPartNo) meta.push({ k: 'Part #', v: p.mfrPartNo });
        meta.push({ k: 'Category · UNSPSC', v: category });
        meta.push({ k: 'Request', v: window.Workflow.reqNo(r) });
        meta.push({ k: 'Material group', v: p.materialGroup });
        meta.push({ k: 'Base UoM', v: p.baseUom });
        return cardShell({
            act: 'open-req', id: r.id, image: p.image,
            title: p.shortName || r.title, desc: p.longDesc,
            pills: `<span class="status-pill ${cls}">${esc(status)}</span>`,
            meta,
            plants: (p.plants && p.plants.length) ? p.plants : (p.plant ? [p.plant] : []),
            footNote: status === 'Draft' ? 'Draft — not submitted' : 'Awaiting ' + (st ? st.label : 'review'),
            cardCls: status === 'Draft' ? 'card-draft' : 'card-inreview'
        });
    }

    function aiPanelHtml(a) {
        const p = a.parsed;
        const check = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
        const chips = a.steps.map(st =>
            `<span class="ai-chip" title="${esc(st.detail)}"><span class="ai-chip-check">${check}</span>${esc(st.label)}</span>`
        ).join('');
        const kv = (k, v) => `<div class="ai-kv"><div class="k">${esc(k)}</div><div class="v">${esc((v === undefined || v === null || v === '') ? '—' : v)}</div></div>`;
        const grid = a.categoryFound ? `
            <div class="ai-kv-grid">
                ${kv('Category · UNSPSC', (p.unspscLabel || '') + ' · ' + p.unspsc)}
                ${kv('Material group', p.materialGroup ? p.materialGroup + ' — ' + window.UI.groupDesc(p.materialGroup) : '')}
                ${kv('Manufacturer', p.manufacturer)}
                ${kv('Part #', p.mfrPartNo)}
                ${kv('Suggested type', p.matTypeChoice)}
                ${kv('Attributes resolved', Object.keys(p.attributes || {}).length)}
            </div>` : '';
        return `<div class="ai-card">
            <div class="ai-card-head">
                <span class="ai-badge">${icon('star')} AI Mastering</span>
                <span class="ai-head-note">Analysis complete</span>
            </div>
            <div class="ai-ident">
                <div class="ai-ident-k">Identified item</div>
                <div class="ai-ident-v">${esc(p.summary)}</div>
            </div>
            <div class="ai-chips">${chips}</div>
            ${grid}
        </div>`;
    }

    function outcomeHtml(a) {
        const myPlant = window.Store.session().plant;
        if (a.outcome === 'category_missing') {
            const cs = a.categorySuggestion;
            return `<div class="banner warn">
                <span class="banner-icon">⚠️</span>
                <div class="banner-body"><div class="banner-title">Category not found in the system</div>
                    ${cs ? `The AI could not match this item to an existing category, so it prepared a new-category proposal for the Central team:<br>
                    <strong>“${esc(cs.categoryName)}” · UNSPSC ${esc(cs.unspsc)} · ${cs.catAttributes.length} attributes</strong>`
                    : 'The AI could not match this item to an existing category. Please ask the Data Steward to create the relevant categories and attributes for this item.'}</div>
                <div class="banner-actions"><button class="btn btn-black btn-sm" data-act="req-category">Request New Category</button></div>
            </div>`;
        }
        if (a.outcome === 'exists_my_plant') {
            const m = a.exactMatch;
            return `<div class="banner danger">
                    <span class="banner-icon">🚫</span>
                    <div class="banner-body"><div class="banner-title">This item already exists in your plant (${esc(myPlant)})</div>
                        You cannot create a new request for it. Open the record to use, amend or block it.</div>
                </div>${cardHtml(m)}`;
        }
        if (a.outcome === 'exists_other_plant') {
            const m = a.exactMatch;
            return `<div class="banner match">
                    <span class="banner-icon">↗️</span>
                    <div class="banner-body"><div class="banner-title">Exists in plant ${esc(m.plants[0])} — extend it to your plant</div>
                        This item is already mastered in another plant. Create an <strong>extension request</strong> to add it to Plant ${esc(myPlant)}. You cannot create it as a brand-new item.</div>
                    <div class="banner-actions"><button class="btn btn-green btn-sm" data-act="extend" data-id="${m.id}">↗ Extend to my plant</button></div>
                </div>${cardHtml(m)}`;
        }
        // not_found
        const list = a.similar.length
            ? `<div class="rb-title" style="margin:6px 0 12px">Similar items you could use as an alternative</div>
               <div class="items-list-container">${a.similar.map(m => cardHtml(m)).join('')}</div>`
            : `<div class="muted" style="margin:6px 0 12px">No similar items found in the material master.</div>`;
        return `<div class="banner info">
                <span class="banner-icon">➕</span>
                <div class="banner-body"><div class="banner-title">No exact match in the material master</div>
                    You don't have this item yet. Review the alternatives below, or create a new item request for your plant (Plant ${esc(myPlant)}).</div>
                <div class="banner-actions"><button class="btn btn-black btn-sm" data-act="create">Create new item request</button></div>
            </div>${list}`;
    }

    function listHtml(items) {
        const pending = pendingRequests().filter(r => matchesFilters(pendingEntry(r)));
        const filtered = items.filter(m => matchesFilters(materialEntry(m)));
        const note = filtersActive()
            ? `<div class="muted" style="margin-bottom:12px">${filtered.length + pending.length} item(s) match the selected filters. <button class="btn-link" data-act="clear-filters">Clear filters</button></div>`
            : '';
        if (!filtered.length && !pending.length) return note + `<div class="seen-all">No items match${filtersActive() ? ' the selected filters' : ''}.</div>`;
        return note + `<div class="items-list-container ${S.layout === 'grid' ? 'grid' : ''}">
                ${pending.map(r => pendingCardHtml(r)).join('')}
                ${filtered.map(m => cardHtml(m)).join('')}
            </div>
            <div class="seen-all">You have seen it all…</div>`;
    }

    function contentHtml() {
        let body;
        if (S.loading) {
            body = `<div class="ai-card">
                <div class="ai-card-head">
                    <span class="ai-badge">${icon('star')} AI Mastering</span>
                    <span class="ai-head-note">Analysing…</span>
                </div>
                <div class="ai-loading"><span class="spinner"></span><span>Parsing description, categorising the item and checking the material master…</span></div>
            </div>`;
        } else if (S.error) {
            body = `<div class="banner danger"><span class="banner-icon">⚠️</span><div class="banner-body">
                <div class="banner-title">Search failed</div>${esc(S.error)}</div>
                <div class="banner-actions"><button class="btn btn-outline btn-sm" data-act="clear">Dismiss</button></div></div>` + listHtml(window.Store.materials());
        } else if (S.analysis) {
            body = aiPanelHtml(S.analysis) + outcomeHtml(S.analysis);
        } else {
            body = listHtml(window.Store.materials());
        }
        return `
            <div class="search-action-row">
                <div class="search-shell">
                    <svg class="ss-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input type="text" id="master-search" class="search-input-clean" value="${esc(S.query)}"
                        placeholder="Describe the item you need — e.g. 'SKF wedge V-belt PHG SPC2500, pitch length 2500 mm'">
                    ${S.query ? `<button class="search-clear-btn" data-act="clear" title="Clear">✕</button>` : ''}
                </div>
                <button class="btn btn-black search-btn-solid" data-act="search" title="AI-assisted search">
                    <svg width="17" height="17" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path fill="#fff" d="M10 2l1.8 5.2L17 9l-5.2 1.8L10 16l-1.8-5.2L3 9l5.2-1.8z"/>
                        <path fill="#fff" d="M18 3l.9 2.6L21.5 6.5l-2.6.9L18 10l-.9-2.6L14.5 6.5l2.6-.9z" opacity=".8"/>
                        <path fill="#fff" d="M18.5 12l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" opacity=".6"/>
                    </svg>
                    <span>Search</span>
                </button>
                <button class="btn-icon-sq ss-filter" data-act="toggle-sidebar" title="Filters">${icon('filter')}</button>
            </div>
            <div class="toolbar-row">
                <div class="layout-toggles">
                    <button class="toggle-icon-btn ${S.layout === 'grid' ? 'active' : ''}" data-act="layout" data-layout="grid">${icon('grid')}</button>
                    <button class="toggle-icon-btn ${S.layout === 'list' ? 'active' : ''}" data-act="layout" data-layout="list">${icon('list')}</button>
                </div>
                <div class="toolbar-right">
                    <button class="btn btn-outline" data-act="bulk">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        Bulk upload</button>
                    <button class="btn btn-black" data-act="add-new">Add new item</button>
                </div>
            </div>
            ${body}`;
    }

    // distinct values from the live data (materials + pending create requests)
    function filterOptions() {
        const mats = window.Store.materials();
        const pend = pendingRequests();
        const manufacturers = new Set(), categories = new Set();
        mats.forEach(m => { if (m.manufacturer) manufacturers.add(m.manufacturer); if (m.unspscLabel || m.category) categories.add(m.unspscLabel || m.category); });
        pend.forEach(r => { const p = r.payload || {}; if (p.manufacturer) manufacturers.add(p.manufacturer); if (p.unspscLabel) categories.add(p.unspscLabel); });
        (window.UI.ds().CATEGORY_ATTRIBUTES || []).forEach(c => categories.add(c.label));
        return {
            manufacturers: [...manufacturers].sort(),
            categories: [...categories].sort(),
            plants: window.UI.ds().PLANTS
        };
    }

    function sidebarHtml() {
        const f = S.filters, opts = filterOptions();
        const cb = (group, val, label) =>
            `<label class="checkbox-label"><input type="checkbox" data-filter="${group}" value="${esc(val)}" ${f[group].indexOf(val) !== -1 ? 'checked' : ''}> ${esc(label || val)}</label>`;
        return `<aside class="sidebar ${S.sidebarCollapsed ? 'collapsed' : ''}">
            <div class="sidebar-collapse-icon" data-act="toggle-sidebar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
            </div>
            <div class="filter-section first">
                <div class="filter-title">Item status</div>
                <div class="checkbox-group">
                    ${cb('statuses', 'Draft')}
                    ${cb('statuses', 'In review')}
                    ${cb('statuses', 'Approved')}
                </div>
            </div>
            <div class="filter-section">
                <div class="filter-title">Block status</div>
                <div class="checkbox-group">
                    ${cb('blocks', 'Not blocked')}
                    ${cb('blocks', 'Plant block')}
                    ${cb('blocks', 'Procurement block')}
                    ${cb('blocks', 'Total block')}
                </div>
            </div>
            <div class="filter-section">
                <div class="filter-title">Manufacturer</div>
                <select class="filter-select" data-filter-select="manufacturer">
                    <option value="">All manufacturers</option>
                    ${opts.manufacturers.map(m => `<option value="${esc(m)}" ${f.manufacturer === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
                </select>
            </div>
            <div class="filter-section">
                <div class="filter-title">Category</div>
                <select class="filter-select" data-filter-select="category">
                    <option value="">All categories</option>
                    ${opts.categories.map(c => `<option value="${esc(c)}" ${f.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
                </select>
            </div>
            ${attrFiltersHtml()}
            <div class="filter-section">
                <div class="filter-title">Plant</div>
                <select class="filter-select" data-filter-select="plant">
                    <option value="">All plants</option>
                    ${opts.plants.map(p => `<option value="${esc(p.code)}" ${f.plant === p.code ? 'selected' : ''}>${esc(p.code + ' — ' + p.name)}</option>`).join('')}
                </select>
            </div>
            <div class="filter-section">
                <button class="btn btn-outline btn-sm" data-act="clear-filters" ${filtersActive() ? '' : 'disabled'}>Clear filters</button>
            </div>
        </aside>`;
    }

    // per-attribute filter controls for the selected category (schema-driven)
    function attrFiltersHtml() {
        const schema = selectedCategorySchema();
        if (!schema || !schema.attributes.length) return '';
        const fa = S.filters.attrs;
        const controls = schema.attributes.map(a => {
            const t = a.fieldType || 'Text';
            const cur = fa[a.name] || {};
            const uom = a.uom ? ` <span class="attr-uom">(${esc(a.uom.toLowerCase())})</span>` : '';
            if (t === 'Number' || t === 'Range') {
                return `<div class="af-row"><div class="af-label">${esc(a.name)}${uom}</div>
                    <div class="af-minmax">
                        <input class="form-input af-num" type="number" step="any" placeholder="Min" data-attr-num="${esc(a.name)}" data-bound="min" value="${esc(cur.min ?? '')}">
                        <span class="muted">–</span>
                        <input class="form-input af-num" type="number" step="any" placeholder="Max" data-attr-num="${esc(a.name)}" data-bound="max" value="${esc(cur.max ?? '')}">
                    </div></div>`;
            }
            if (t === 'List' || t === 'Yes/No') {
                const opts = t === 'Yes/No' ? ['Yes', 'No'] : String(a.options || '').split(',').map(x => x.trim()).filter(Boolean);
                return `<div class="af-row"><div class="af-label">${esc(a.name)}</div>
                    <select class="filter-select" data-attr-sel="${esc(a.name)}">
                        <option value="">Any</option>
                        ${opts.map(o => `<option value="${esc(o)}" ${cur.val === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
                    </select></div>`;
            }
            return `<div class="af-row"><div class="af-label">${esc(a.name)}${uom}</div>
                <input class="form-input" type="text" placeholder="Contains…" data-attr-text="${esc(a.name)}" value="${esc(cur.text || '')}"></div>`;
        }).join('');
        return `<div class="filter-section attr-filters">
            <div class="filter-title">${esc(schema.label)} attributes</div>
            ${controls}
        </div>`;
    }

    // does an item's attribute map satisfy the active attribute filters?
    function matchesAttrFilters(attrs) {
        const fa = S.filters.attrs;
        const keys = Object.keys(fa);
        if (!keys.length) return true;
        attrs = attrs || {};
        return keys.every(name => {
            const f = fa[name];
            const raw = attrs[name];
            if (f.min !== undefined || f.max !== undefined) {
                const n = parseFloat(String(raw === undefined ? '' : raw).replace(',', '.'));
                if (isNaN(n)) return false;
                if (f.min !== undefined && n < f.min) return false;
                if (f.max !== undefined && n > f.max) return false;
                return true;
            }
            if (f.val !== undefined) {
                return String(raw || '').toLowerCase().indexOf(String(f.val).toLowerCase()) !== -1;
            }
            if (f.text !== undefined) {
                return String(raw || '').toLowerCase().indexOf(String(f.text).toLowerCase()) !== -1;
            }
            return true;
        });
    }

    function pendingRequests() {
        return window.Store.requests().filter(r =>
            (r.type === 'create') && (r.status === 'Draft' || r.status === 'In Review'));
    }

    function matchesFilters(entry) {
        // entry: { status, block, manufacturer, category, plants[] }
        const f = S.filters;
        if (f.statuses.length && f.statuses.indexOf(entry.status) === -1) return false;
        if (f.blocks.length && f.blocks.indexOf(entry.block) === -1) return false;
        if (f.manufacturer && entry.manufacturer !== f.manufacturer) return false;
        if (f.category && entry.category !== f.category) return false;
        if (f.plant && entry.plants.indexOf(f.plant) === -1) return false;
        if (!matchesAttrFilters(entry.attributes)) return false;
        return true;
    }
    function materialEntry(m) {
        return { status: m.itemStatus || 'Approved', block: m.blockStatus || 'Not blocked',
            manufacturer: m.manufacturer || '', category: m.unspscLabel || m.category || '', plants: m.plants || [],
            attributes: m.attributes || {} };
    }
    function pendingEntry(r) {
        const p = r.payload || {};
        return { status: r.status === 'Draft' ? 'Draft' : 'In review', block: 'Not blocked',
            manufacturer: p.manufacturer || '', category: p.unspscLabel || '',
            plants: (p.plants && p.plants.length) ? p.plants : (p.plant ? [p.plant] : []),
            attributes: p.attributes || {} };
    }

    function render() {
        const root = document.getElementById('view');
        root.innerHTML = `
            <div class="sub-header">Material Master</div>
            <div class="workspace">
                ${sidebarHtml()}
                <main class="content-panel">${contentHtml()}</main>
            </div>`;
        bind(root);
        const input = document.getElementById('master-search');
        if (input && S.query) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }

    function runSearch() {
        const input = document.getElementById('master-search');
        const q = input ? input.value.trim() : S.query;
        S.query = q;
        S.error = null;
        if (!q) { S.analysis = null; S.loading = false; render(); return; }
        S.loading = true; S.analysis = null; render();
        setTimeout(() => {
            try {
                S.analysis = window.AI.analyze(q);
                // every identified category is registered into the living catalog
                if (S.analysis.categoryFound) {
                    const existed = !!window.UI.categorySchema(S.analysis.parsed.unspsc);
                    window.AI.registerCategory(S.analysis);
                    if (!existed) window.UI.toast({ title: 'New category catalogued', body: `“${S.analysis.parsed.unspscLabel}” (UNSPSC ${S.analysis.parsed.unspsc}) with ${Object.keys(S.analysis.parsed.attributes).length} attributes was added to the Category catalog.`, kind: 'info' });
                }
            } catch (err) {
                console.error('AI search failed:', err);
                S.error = 'The AI could not process this description. Please try again or reset the demo data.';
                window.UI.toast({ title: 'Search failed', body: String(err && err.message || err), kind: 'danger' });
            }
            S.loading = false;
            render();
        }, 850);
    }

    // "Request New Category": propose a category + attributes → reviewed by the Central team
    function categoryRequestModal() {
        const parsed = S.analysis && S.analysis.parsed || {};
        const prefill = S.analysis && S.analysis.categorySuggestion
            ? JSON.parse(JSON.stringify(S.analysis.categorySuggestion))
            : { categoryName: '', unspsc: '', catAttributes: [] };
        window.UI.openModal({
            title: 'Request new category',
            wide: true,
            bodyHtml: `<p class="muted" style="margin-bottom:14px">The AI has proposed a category and attribute set for this item — review and adjust anything before sending. The Central team will review your proposal and on approval the category is added to the catalog.</p>
                ${parsed.summary ? `<div class="banner info" style="margin-bottom:14px"><span class="banner-icon">✦</span><div class="banner-body"><div class="banner-title">Searched item</div>${window.UI.esc(parsed.summary)}</div></div>` : ''}
                <div id="cat-req-editor">${window.UI.categoryEditorHtml(prefill)}</div>`,
            onOpen: (o) => window.UI.bindCategoryEditor(o.querySelector('#cat-req-editor')),
            buttons: [
                { label: 'Cancel', cls: 'btn-outline', onClick: (o) => o.remove() },
                { label: 'Submit request', cls: 'btn-green', onClick: (o) => {
                    const ed = o.querySelector('#cat-req-editor');
                    const data = window.UI.collectCategoryEditor(ed);
                    if (!window.UI.validateCategoryEditor(ed, data)) {
                        window.UI.toast({ title: 'Cannot submit', body: 'Please complete the category details.', kind: 'danger' });
                        return;
                    }
                    o.remove();
                    const payload = Object.assign({ name: data.categoryName, shortName: data.categoryName, sourceText: S.query || '' }, data);
                    const req = window.Workflow.createRequest({ type: 'category', payload });
                    window.UI.toast({ title: 'Request sent to Central team',
                        body: window.Workflow.reqNo(req) + ' — you will be notified when the category is reviewed.', kind: 'info' });
                } }
            ]
        });
    }

    function startCreate() {
        const a = S.analysis;
        window.Views._draft = {
            type: 'create',
            payload: a ? window.AI.toPayload(a) : emptyPayload(),
            analysis: a || null
        };
        window.UI.go('#/request/new?type=create');
    }
    function startExtend(id) {
        window.Views._draft = { type: 'extend', materialId: id };
        window.UI.go('#/request/new?type=extend');
    }
    function emptyPayload() {
        const s = window.Store.session();
        return { name: '', shortName: '', longDesc: '', materialType: 'ROH', matTypeChoice: '',
            manufacturer: '', mfrPartNo: '', unspsc: '', unspscLabel: '', category: '', materialGroup: '',
            baseUom: '', plant: s.plant, storageLocation: '', mrpEnabled: '', batchManaged: '', mrpType: '',
            recordType: '', valuationClass: '', attributes: {}, image: '' };
    }

    function bind(root) {
        window.UI.bindActions(root, {
            'search': runSearch,
            'clear': () => { S.query = ''; S.analysis = null; S.error = null; render(); },
            'layout': (t) => { S.layout = t.getAttribute('data-layout'); render(); },
            'toggle-sidebar': () => { S.sidebarCollapsed = !S.sidebarCollapsed; root.querySelector('.sidebar').classList.toggle('collapsed', S.sidebarCollapsed); },
            'open-item': (t) => window.UI.go('#/item/' + t.getAttribute('data-id')),
            'open-req': (t) => window.UI.go('#/request/' + t.getAttribute('data-id')),
            'create': startCreate,
            'add-new': startCreate,
            'bulk': () => window.UI.go('#/bulk'),
            'extend': (t) => startExtend(t.getAttribute('data-id')),
            'clear-filters': () => { S.filters = { statuses: [], blocks: [], manufacturer: '', category: '', plant: '', attrs: {} }; render(); },
            'req-category': () => categoryRequestModal()
        });
        const input = document.getElementById('master-search');
        if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });

        // filter controls
        root.querySelectorAll('[data-filter]').forEach(el => el.addEventListener('change', e => {
            const group = e.target.getAttribute('data-filter');
            const val = e.target.value;
            const list = S.filters[group];
            const i = list.indexOf(val);
            if (e.target.checked && i === -1) list.push(val);
            if (!e.target.checked && i !== -1) list.splice(i, 1);
            render();
        }));
        root.querySelectorAll('[data-filter-select]').forEach(el => el.addEventListener('change', e => {
            const key = e.target.getAttribute('data-filter-select');
            S.filters[key] = e.target.value;
            if (key === 'category') S.filters.attrs = {};   // new category → new attribute set
            render();
        }));

        // attribute filters (schema-driven)
        const setAttr = (name, patch) => {
            const cur = Object.assign({}, S.filters.attrs[name] || {}, patch);
            Object.keys(cur).forEach(k => { if (cur[k] === undefined || cur[k] === '') delete cur[k]; });
            if (Object.keys(cur).length) S.filters.attrs[name] = cur; else delete S.filters.attrs[name];
            render();
        };
        root.querySelectorAll('[data-attr-num]').forEach(el => el.addEventListener('change', e => {
            const v = e.target.value === '' ? undefined : parseFloat(e.target.value);
            setAttr(e.target.getAttribute('data-attr-num'), { [e.target.getAttribute('data-bound')]: (v === undefined || isNaN(v)) ? undefined : v });
        }));
        root.querySelectorAll('[data-attr-sel]').forEach(el => el.addEventListener('change', e => {
            setAttr(e.target.getAttribute('data-attr-sel'), { val: e.target.value || undefined });
        }));
        root.querySelectorAll('[data-attr-text]').forEach(el => el.addEventListener('change', e => {
            setAttr(e.target.getAttribute('data-attr-text'), { text: e.target.value.trim() || undefined });
        }));
    }

    window.Views.master = function () {
        // reset transient state when navigated fresh (keep query if returning)
        render();
    };
    // allow other views to prefill the search
    window.Views.masterSearch = function (q) { S.query = q; S.analysis = null; runSearch(); };
})();
