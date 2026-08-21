/* ============================================================
   components.js — shared render helpers & chrome (header, toast, modal)
   ============================================================ */
(function () {

    /* ---------- tiny utils ---------- */
    function esc(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }
    function go(hash) { window.location.hash = hash; }
    function nowLabel(ts) {
        const d = new Date(ts);
        return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    // delegate helper: attach one handler, match by [data-act].
    // Replaces any handler previously attached by bindActions on this root
    // (roots persist across re-renders, so addEventListener would otherwise stack).
    function bindActions(root, map) {
        if (root.__actHandler) root.removeEventListener('click', root.__actHandler);
        const handler = e => {
            const t = e.target.closest('[data-act]');
            if (!t || !root.contains(t)) return;
            const fn = map[t.getAttribute('data-act')];
            if (fn) fn(t, e);
        };
        root.__actHandler = handler;
        root.addEventListener('click', handler);
    }

    /* ---------- dataset lookups ---------- */
    function ds() { return window.Store.get().datasets; }
    function plantName(code) { const p = ds().PLANTS.find(x => x.code === code); return p ? p.name : code; }
    function plantLabel(code) { return code + ' — ' + plantName(code); }
    function groupDesc(code) { const g = ds().MATERIAL_GROUPS.find(x => x.code === code); return g ? g.desc : ''; }
    function valuationDesc(code) { const v = ds().VALUATION_CLASSES.find(x => x.code === code); return v ? v.desc : ''; }
    function categorySchema(unspsc) { return (ds().CATEGORY_ATTRIBUTES || []).find(c => c.unspsc === unspsc) || null; }
    function abcDesc(code) { const a = (ds().ABC_CODES || []).find(x => x.code === code); return a ? a.desc : ''; }
    // storage locations belong to a plant; plants without their own list fall back to the generic one
    /* ---- supporting documents: shared list rendering ---- */
    function docKB(size) { return (size / 1024).toFixed(2) + ' KB'; }
    const DOC_CLIP = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
    const DOC_TRASH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
    // read-only list (request detail / item page); pass {deletable:true} for the form
    function docListHtml(docs, opts) {
        opts = opts || {};
        if (!docs || !docs.length) return '';
        return `<div class="doc-table">
            <div class="doc-thead"><span>File</span><span>${opts.deletable ? 'Action' : ''}</span></div>
            ${docs.map((d, i) => `<div class="doc-row">
                <span class="doc-name"><span class="doc-clip">${DOC_CLIP}</span>
                    <a href="${d.data}" download="${esc(d.name)}" title="Download">${esc(d.name)} (${docKB(d.size || 0)})</a></span>
                ${opts.deletable ? `<button type="button" class="doc-del" data-doc-del="${i}" title="Remove">${DOC_TRASH}</button>` : '<span></span>'}
            </div>`).join('')}
        </div>`;
    }

    function storageOptionsFor(plant) {
        const list = (window.STORAGE_LOCATIONS_BY_PLANT || {})[String(plant || '')];
        if (list && list.length) return list.map(l => ({ value: l.code, label: l.code + ' — ' + l.name }));
        return (ds().STORAGE_LOCATIONS || []).slice();
    }

    // read-only display of the inventory-planning section (same def-grid style
    // as the Product details / Technical Details cards)
    function inventoryRows(inv) {
        if (!inv) return '<div class="muted">Inventory data not set yet.</div>';
        const rows = [
            ['Material (MMR)', inv.material],
            ['Plant', inv.plant],
            ['MRP Group', inv.mrpGroup],
            ['ABC Code', inv.abcCode ? inv.abcCode + ' — ' + abcDesc(inv.abcCode) : ''],
            ['MRP Type', inv.mrpType],
            ['Reorder point', inv.reorderPoint],
            ['Min qty', inv.mrpControllerMin],
            ['Max qty', inv.mrpControllerMax],
            ['Lot-size', inv.lotSize],
            ['Fixed lot size', inv.fixedLotSize],
            ['Procurement Type', inv.procurementType || 'F'],
            ['Planned Delivery Time (Days)', inv.plannedDeliveryDays],
            ['Safety Stock', inv.safetyStock]
        ];
        return `<div class="def-grid">${rows.map(r =>
            `<div class="def-row"><div class="def-k">${esc(r[0])}</div><div class="def-v">${esc((r[1] === undefined || r[1] === null || r[1] === '') ? '—' : r[1])}</div></div>`).join('')}</div>`;
    }

    /* ---- inventory rule: MRP type ND + lot-size EX → Min/Max levels are not
       applicable; grey them out, disable and clear them (live on change) ---- */
    function invMinMaxOff(container) {
        const g = (n) => container.querySelector(`[name="inv::${n}"]`);
        const mt = g('mrpType'), ls = g('lotSize');
        return !!(mt && ls && mt.value === 'ND' && ls.value === 'EX');
    }
    function bindInvMinMaxRule(container) {
        const apply = () => {
            const off = invMinMaxOff(container);
            ['mrpControllerMin', 'mrpControllerMax'].forEach(n => {
                const el = container.querySelector(`[name="inv::${n}"]`);
                if (!el) return;
                el.disabled = off;
                if (off) { el.value = ''; el.classList.remove('error'); }
                const field = el.closest('.field');
                if (field) {
                    field.classList.toggle('field-disabled', off);
                    // the mandatory mark goes away while the field is not applicable
                    const lab = field.querySelector('label');
                    if (lab) {
                        lab.classList.toggle('req-label', !off);
                        const star = lab.querySelector('.req');
                        if (star) star.style.display = off ? 'none' : '';
                    }
                    const hint = field.querySelector('.hint');
                    if (hint) hint.textContent = off ? 'Not applicable — MRP type ND with lot-size EX' : 'Numeric';
                    const err = field.querySelector('.field-error');
                    if (err && off) err.textContent = '';
                }
            });
        };
        container.addEventListener('change', (e) => {
            if (e.target.name === 'inv::mrpType' || e.target.name === 'inv::lotSize') apply();
        });
        apply();
    }

    /* ---------- toast ---------- */
    function toast(opts) {
        if (typeof opts === 'string') opts = { body: opts };
        const root = document.getElementById('toast-root');
        const el = document.createElement('div');
        el.className = 'toast ' + (opts.kind || '');
        el.innerHTML = (opts.title ? `<div class="toast-title">${esc(opts.title)}</div>` : '') +
            `<div>${esc(opts.body)}</div>`;
        root.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, opts.duration || 4200);
    }

    /* ---------- modal ---------- */
    function openModal(opts) {
        const root = document.getElementById('modal-root');
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal${opts.wide ? ' modal-wide' : ''}">
                <div class="modal-head">${esc(opts.title || '')}</div>
                <div class="modal-body">${opts.bodyHtml || ''}</div>
                <div class="modal-foot" id="modal-foot"></div>
            </div>`;
        root.appendChild(overlay);
        const foot = overlay.querySelector('#modal-foot');
        (opts.buttons || []).forEach(b => {
            const btn = document.createElement('button');
            btn.className = 'btn ' + (b.cls || 'btn-outline');
            btn.textContent = b.label;
            btn.onclick = () => { if (b.onClick) b.onClick(overlay); };
            foot.appendChild(btn);
        });
        overlay.addEventListener('click', e => { if (e.target === overlay && opts.dismissable !== false) close(); });
        function close() { overlay.remove(); }
        if (opts.onOpen) opts.onOpen(overlay);
        return { overlay, close };
    }
    function closeModals() { document.getElementById('modal-root').innerHTML = ''; }

    /* ---------- header ---------- */
    function inboxCountFor(role) {
        return window.Store.requests().filter(r => window.Workflow.isAwaiting(r, role)).length;
    }
    // Requester attention count: declined requests + own requests waiting for
    // the requester's approval (valuation class sign-off)
    function requesterCount(s) {
        return window.Store.requests().filter(r => r.requesterUser === s.currentUser &&
            (r.status === 'Declined' || window.Workflow.isAwaiting(r, 'Requester'))).length;
    }
    // notifications addressed to a specific role are only shown while acting as it
    function visibleNotifications() {
        const role = window.Store.session().currentRole;
        return window.Store.notifications().filter(n => !n.forRole || n.forRole === role);
    }
    function renderHeader() {
        const s = window.Store.session();
        const roles = ds().ROLES;
        const unread = visibleNotifications().filter(n => !n.read).length;
        const myCount = s.currentRole === 'Requester'
            ? requesterCount(s)
            : inboxCountFor(s.currentRole);

        const header = document.getElementById('app-header');
        header.innerHTML = `
            <div class="header-left">
                <button class="menu-toggle" data-act="nav-drawer" title="Menu">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                </button>
                <div class="logo-area" data-act="home">
                    <img class="logo-img" src="img/logo.svg" alt="dmp — Digital Material Purchasing">
                    <div class="divider"></div>
                    <div class="app-title">DEMAND PLANNING</div>
                </div>
            </div>
            <div class="header-right">
                <div class="lang-switcher">
                    <button class="lang-switch-btn" data-act="lang-toggle" title="Language / Dil">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                        <span class="lang-label">${(s.lang || 'en').toUpperCase()}</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    <div class="lang-menu" id="lang-menu">
                        <div class="lang-menu-item ${(s.lang || 'en') === 'en' ? 'active' : ''}" data-act="lang-pick" data-lang="en"><span>EN</span><span class="lang-name">English</span></div>
                        <div class="lang-menu-item ${s.lang === 'az' ? 'active' : ''}" data-act="lang-pick" data-lang="az"><span>AZ</span><span class="lang-name">Azərbaycan dili</span></div>
                    </div>
                </div>
                <div class="role-switcher">
                    <button class="role-switcher-btn" data-act="role-toggle">
                        <span class="role-dot"></span>
                        <span>Acting as <span class="role-label">${esc(s.currentRole)}</span></span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    <div class="role-menu" id="role-menu">
                        <div class="role-menu-head">Switch role (demo)</div>
                        ${roles.map(r => {
                            const c = r === 'Requester' ? requesterCount(s) : inboxCountFor(r);
                            return `<div class="role-menu-item ${r === s.currentRole ? 'active' : ''}" data-act="role-pick" data-role="${esc(r)}">
                                <span>${esc(r)}</span>${c ? `<span class="badge">${c}</span>` : ''}</div>`;
                        }).join('')}
                        <div class="role-menu-head" style="border-top:1px solid var(--border-soft);border-bottom:none">Demo</div>
                        <div class="role-menu-item" data-act="reset-demo"><span>↻ Reset demo data</span></div>
                    </div>
                </div>
                <button class="icon-btn" data-act="inbox">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
                    <span>Inbox</span>
                    ${myCount ? `<span class="count-badge">${myCount}</span>` : ''}
                </button>
                <button class="icon-btn" data-act="notif">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                    <span>Notifications</span>
                    ${unread ? `<span class="count-badge">${unread}</span>` : ''}
                </button>
                <div class="user-profile">
                    <div class="user-avatar"></div>
                    <div class="user-info">
                        <div class="user-name">${esc(s.currentUser)}</div>
                        <div class="user-company">${esc(s.company)} · Plant ${esc(s.plant)}</div>
                    </div>
                </div>
            </div>`;

        bindActions(header, {
            'home': () => go('#/master'),
            'inbox': () => go('#/inbox'),
            'nav-drawer': () => openNavDrawer(),
            'role-toggle': () => document.getElementById('role-menu').classList.toggle('open'),
            'role-pick': (t) => {
                document.getElementById('role-menu').classList.remove('open');
                window.Store.setRole(t.getAttribute('data-role'));
                // re-render the current page in place so role-specific actions
                // (e.g. Central team blocks on the item page) appear immediately
                window.Router.render();
            },
            'notif': () => toggleNotifPanel(),
            'lang-toggle': () => document.getElementById('lang-menu').classList.toggle('open'),
            'lang-pick': (t) => {
                document.getElementById('lang-menu').classList.remove('open');
                if (window.I18N) window.I18N.setLang(t.getAttribute('data-lang'));
            },
            'reset-demo': () => {
                document.getElementById('role-menu').classList.remove('open');
                window.Store.reset();
                toast({ title: 'Demo reset', body: 'All requests cleared and material master re-seeded.' });
                go('#/master');
            }
        });
        // close menus on outside click (single persistent listener)
        if (!document.__menuCloseBound) {
            document.__menuCloseBound = true;
            document.addEventListener('click', outsideClose);
        }
    }
    function outsideClose(e) {
        if (!e.target.closest('.role-switcher')) { const m = document.getElementById('role-menu'); if (m) m.classList.remove('open'); }
        if (!e.target.closest('.lang-switcher')) { const lm = document.getElementById('lang-menu'); if (lm) lm.classList.remove('open'); }
        if (!e.target.closest('.notif-panel') && !e.target.closest('[data-act="notif"]')) { const p = document.getElementById('notif-panel'); if (p) p.classList.remove('open'); }
    }

    function toggleNotifPanel() {
        const panel = document.getElementById('notif-panel');
        const open = panel.classList.contains('open');
        if (open) { panel.classList.remove('open'); return; }
        const notifs = visibleNotifications();
        panel.innerHTML = `
            <div class="notif-head"><span>Notifications</span>
                <button class="btn-link" data-act="mark-read">Mark all read</button></div>
            ${notifs.length ? notifs.map(n => `
                <div class="notif-item ${n.read ? '' : 'unread'}">
                    <span class="n-dot" style="${n.read ? 'background:#ccc' : ''}"></span>
                    <div><div style="font-weight:600">${esc(n.title || '')}</div>
                    <div>${esc(n.body || '')}</div>
                    <div class="n-time">${nowLabel(n.ts)}</div></div>
                </div>`).join('') : `<div class="empty-state">No notifications</div>`}`;
        panel.classList.add('open');
        bindActions(panel, { 'mark-read': () => { window.Store.markAllNotificationsRead(); toggleNotifPanel(); toggleNotifPanel(); } });
        setTimeout(() => document.addEventListener('click', outsideClose, { once: true }), 0);
    }

    /* ---------- navigation drawer (burger menu) ---------- */
    function openNavDrawer() {
        const root = document.getElementById('drawer-root');
        if (!root) return;
        const s = window.Store.session();
        const isCentral = s.currentRole === 'Central team';
        const ic = {
            list: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
            inbox: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
            grid: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
            factory: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>`,
            upload: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
            users: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
            chart: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`
        };
        const link = (hash, icon, label) => `<div class="drawer-link" data-go="${hash}">${icon}<span>${esc(label)}</span></div>`;
        root.innerHTML = `
            <div class="drawer-backdrop" data-close="1"></div>
            <aside class="nav-drawer">
                <div class="drawer-head">
                    <img class="logo-img" src="img/logo.svg" alt="dmp">
                    <button class="drawer-close" data-close="1">✕</button>
                </div>
                <div class="drawer-section">Navigation</div>
                ${link('#/master', ic.list, 'Material Master')}
                ${link('#/inbox', ic.inbox, s.currentRole === 'Requester' ? 'My Requests' : 'Inbox')}
                ${link('#/bulk', ic.upload, 'Bulk upload')}
                ${isCentral ? `
                    <div class="drawer-section">Administration <span class="drawer-role-chip">Central team</span></div>
                    ${link('#/dashboard', ic.chart, 'Analytics dashboard')}
                    ${link('#/sap', `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M4 12h16M4 17h10"/><circle cx="19" cy="17" r="2.6"/></svg>`, 'SAP integration')}
                    ${link('#/categories', ic.grid, 'Category catalog')}
                    ${link('#/manufacturers', ic.factory, 'Manufacturers')}
                    ${link('#/users', ic.users, 'User management')}
                ` : ''}
                <div class="drawer-foot">Acting as <strong>${esc(s.currentRole)}</strong> · ${esc(s.currentUser)}</div>
            </aside>`;
        const close = () => { root.innerHTML = ''; };
        root.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', close));
        root.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', () => {
            const h = el.getAttribute('data-go');
            close();
            if (window.location.hash === h) window.Router.render(); else go(h);
        }));
    }

    /* ---------- form field builders ---------- */
    function field(opts) {
        // opts: {label, name, value, type:'text|textarea|select|radio', options, required, readonly, aiFilled, hint, span, error}
        const req = opts.required ? '<span class="req">*</span>' : '';
        const spanCls = opts.span ? ('col-span-' + opts.span) : '';
        let control = '';
        const cls = (opts.aiFilled ? 'ai-filled ' : '') + (opts.error ? 'error ' : '');
        const ro = opts.readonly ? 'readonly' : '';
        const name = opts.name;
        if (opts.type === 'select' && opts.search) {
            control = searchSelectHtml({ name, value: opts.value, options: opts.options, placeholder: opts.placeholder, cls });
        } else if (opts.type === 'textarea') {
            control = `<textarea class="form-textarea ${cls}" name="${name}" ${ro} placeholder="${esc(opts.placeholder || '')}">${esc(opts.value || '')}</textarea>`;
        } else if (opts.type === 'select') {
            const opts2 = (opts.options || []).map(o => {
                let val, lab;
                if (typeof o === 'string') { val = o; lab = o; }
                else if (o.value !== undefined) { val = o.value; lab = o.label; }
                else if (o.code !== undefined) { val = o.code; lab = o.code + ' — ' + o.desc; }
                else { val = o; lab = o; }
                return `<option value="${esc(val)}" ${String(opts.value) === String(val) ? 'selected' : ''}>${esc(lab)}</option>`;
            }).join('');
            control = `<select class="form-select ${cls}" name="${name}" ${opts.disabled ? 'disabled' : ''}>
                <option value="">${esc(opts.placeholder || 'Select…')}</option>${opts2}</select>`;
        } else if (opts.type === 'radio') {
            control = `<div class="radio-row">${(opts.options || []).map(o => {
                const val = typeof o === 'string' ? o : o.value;
                const lab = typeof o === 'string' ? o : o.label;
                return `<label><input type="radio" name="${name}" value="${esc(val)}" ${String(opts.value) === String(val) ? 'checked' : ''}> ${esc(lab)}</label>`;
            }).join('')}</div>`;
        } else {
            control = `<input class="form-input ${cls}" type="text" name="${name}" value="${esc(opts.value || '')}" ${ro} placeholder="${esc(opts.placeholder || '')}">`;
        }
        return `<div class="field ${spanCls}">
            <label class="${opts.required ? 'req-label' : ''}">${esc(opts.label)}${req}</label>
            ${control}
            ${opts.hint ? `<div class="hint">${esc(opts.hint)}</div>` : ''}
            <div class="field-error" data-err="${name}">${opts.error ? esc(opts.error) : ''}</div>
        </div>`;
    }

    /* ---------- read-only key/value grid ---------- */
    function techGrid(attrs) {
        const entries = Object.entries(attrs || {});
        if (!entries.length) return '<div class="muted">No attributes.</div>';
        return `<div class="tech-grid">${entries.map(([k, v]) =>
            `<div class="tech-row"><span class="tk">${esc(k)}</span><span class="tv">${esc(v)}</span></div>`).join('')}</div>`;
    }

    /* ---------- workflow tracker ---------- */
    function workflowTracker(req) {
        const stages = window.Workflow.stagesFor(req);
        const idx = req.currentStageIndex;
        const declined = req.status === 'Declined';
        const submitted = req.status !== 'Draft';
        // step 0 (always first): the request being created by its requester
        const createdCls = submitted ? 'done' : 'current';
        const created = `<div class="wf-node"><div class="wf-dot ${createdCls}">${submitted ? '✓' : 1}</div>
            <div class="wf-label">Request created<span class="wf-who">${esc(req.requesterUser)}</span></div></div>
            <div class="wf-connector ${submitted ? 'done' : ''}"></div>`;
        return `<div class="wf-tracker">${created}${stages.map((st, i) => {
            let dotCls = '', label = st.label;
            if (declined && i === idx) dotCls = 'declined';
            else if (i < idx || req.status === 'Completed') dotCls = 'done';
            else if (i === idx) dotCls = 'current';
            const inner = dotCls === 'done' ? '✓' : (dotCls === 'declined' ? '✕' : (i + 2));
            const conn = i < stages.length - 1 ? `<div class="wf-connector ${i < idx || req.status === 'Completed' ? 'done' : ''}"></div>` : '';
            return `<div class="wf-node"><div class="wf-dot ${dotCls}">${inner}</div><div class="wf-label">${esc(label)}</div></div>${conn}`;
        }).join('')}</div>`;
    }

    /* ---------- history timeline ---------- */
    function historyList(req) {
        if (!req.history || !req.history.length) return '<div class="muted">No activity yet.</div>';
        return `<div class="history-list">${req.history.map(h => {
            const color = h.action === 'declined' ? 'var(--danger)' : (h.action === 'submitted' ? '#888' : 'var(--primary-green)');
            return `<div class="history-item"><span class="h-dot" style="background:${color}"></span>
                <div class="h-body"><strong>${esc(h.actorRole || '')}</strong> — ${esc(h.text)}
                ${h.comment ? `<div style="margin-top:3px">“${esc(h.comment)}”</div>` : ''}
                <div class="h-meta">${esc(h.actorUser || '')} · ${nowLabel(h.ts)}</div></div></div>`;
        }).join('')}</div>`;
    }

    /* ---------- searchable custom dropdown (replaces native <select>) ----------
       Renders a button + panel with a search bar; the value lives in a hidden
       input carrying the field name, so FormData/collect() and change listeners
       keep working exactly like with a native select. */
    function ssNormOptions(options) {
        return (options || []).map(o => {
            if (typeof o === 'string') return { v: o, l: o };
            if (o && o.value !== undefined) return { v: o.value, l: o.label };
            if (o && o.code !== undefined) return { v: o.code, l: o.code + ' — ' + o.desc };
            return { v: String(o), l: String(o) };
        });
    }

    function searchSelectHtml(opts) {
        // opts: {name, value, options, placeholder, cls}
        const norm = ssNormOptions(opts.options);
        const val = (opts.value === undefined || opts.value === null) ? '' : String(opts.value);
        const sel = norm.find(o => String(o.v) === val && val !== '');
        const ph = opts.placeholder || 'Select…';
        return `<div class="search-select">
            <input type="hidden" name="${opts.name}" value="${esc(val)}">
            <button type="button" class="form-select ss-toggle ${opts.cls || ''}">
                <span class="ss-label ${sel ? '' : 'ss-placeholder'}">${esc(sel ? sel.l : ph)}</span>
                <svg class="ss-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="ss-menu">
                <div class="ss-search"><input type="text" class="form-input ss-filter" placeholder="Search…"></div>
                <div class="ss-options">
                    <div class="ss-option ss-clear" data-value="">${esc(ph)}</div>
                    ${norm.map(o => `<div class="ss-option ${String(o.v) === val && val !== '' ? 'selected' : ''}" data-value="${esc(o.v)}">${esc(o.l)}</div>`).join('')}
                    <div class="ss-empty hidden">No matches</div>
                </div>
            </div>
        </div>`;
    }

    function ssCloseAll(except) {
        document.querySelectorAll('.search-select.open').forEach(w => { if (w !== except) w.classList.remove('open'); });
    }
    function ssFilter(wrap, q) {
        q = (q || '').trim().toLowerCase();
        let any = false;
        wrap.querySelectorAll('.ss-option').forEach(o => {
            const show = !q || o.textContent.toLowerCase().indexOf(q) !== -1 || o.classList.contains('ss-clear');
            o.classList.toggle('hidden', !show);
            if (show && !o.classList.contains('ss-clear')) any = true;
        });
        const empty = wrap.querySelector('.ss-empty');
        if (empty) empty.classList.toggle('hidden', any);
    }
    function ssPick(wrap, option) {
        const hidden = wrap.querySelector('input[type="hidden"], select.ss-hidden-native');
        const value = option.getAttribute('data-value') || '';
        const label = wrap.querySelector('.ss-label');
        const isClear = option.classList.contains('ss-clear');
        label.textContent = option.textContent.trim();
        label.classList.toggle('ss-placeholder', isClear);
        wrap.querySelectorAll('.ss-option').forEach(o => o.classList.toggle('selected', o === option && !isClear));
        wrap.classList.remove('open');
        if (hidden.value !== value) {
            hidden.value = value;
            hidden.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    /* ---- global progressive enhancement: every native <select> in the app is
       wrapped into the custom dropdown. More than 6 real options → a search bar
       is included; 6 or fewer → plain custom dropdown. The native select stays
       (hidden) as the source of truth, so FormData, [name=]/#id lookups, change
       listeners and validation error classes all keep working untouched. ---- */
    function ssSyncFromNative(wrap) {
        const sel = wrap.querySelector('select.ss-hidden-native');
        if (!sel) return;
        const cur = sel.options[sel.selectedIndex];
        const isPh = !cur || (cur.value || '').trim() === '';
        const label = wrap.querySelector('.ss-label');
        label.textContent = (cur ? cur.textContent : 'Select…').trim();
        label.classList.toggle('ss-placeholder', isPh);
        wrap.querySelectorAll('.ss-option').forEach(o =>
            o.classList.toggle('selected', !isPh && o.getAttribute('data-value') === sel.value && !o.classList.contains('ss-clear')));
    }

    function enhanceSelect(sel) {
        if (sel.__ssWrapped || sel.classList.contains('ss-hidden-native')) return;
        if (sel.hasAttribute('multiple') || sel.classList.contains('no-ss') || sel.disabled) return;
        sel.__ssWrapped = true;
        const wrap = document.createElement('div');
        wrap.className = 'search-select';
        sel.parentNode.insertBefore(wrap, sel);
        wrap.appendChild(sel);
        const baseCls = sel.className;
        sel.classList.add('ss-hidden-native');
        sel.setAttribute('tabindex', '-1');

        const opts = Array.from(sel.options);
        const real = opts.filter(o => (o.value || '').trim() !== '');
        const searchable = real.length > 6;

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = (baseCls + ' ss-toggle').trim();
        toggle.innerHTML = `<span class="ss-label"></span>
            <svg class="ss-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;
        const menu = document.createElement('div');
        menu.className = 'ss-menu';
        menu.innerHTML =
            (searchable ? `<div class="ss-search"><input type="text" class="form-input ss-filter" placeholder="Search…"></div>` : '') +
            `<div class="ss-options">` +
            opts.map(o => {
                const v = (o.value || '');
                const isPh = v.trim() === '';
                return `<div class="ss-option ${isPh ? 'ss-clear' : ''}" data-value="${esc(v)}">${esc(o.textContent.trim())}</div>`;
            }).join('') +
            `<div class="ss-empty hidden">No matches</div></div>`;
        wrap.appendChild(toggle);
        wrap.appendChild(menu);
        ssSyncFromNative(wrap);
    }

    let __ssScanQueued = false;
    function ssScan() {
        if (__ssScanQueued) return;
        __ssScanQueued = true;
        setTimeout(() => {
            __ssScanQueued = false;
            document.querySelectorAll('select').forEach(enhanceSelect);
        }, 0);
    }
    if (typeof MutationObserver !== 'undefined' && document.body) {
        new MutationObserver(ssScan).observe(document.body, { childList: true, subtree: true });
        ssScan();
    }
    if (!document.__ssBound) {
        document.__ssBound = true;
        document.addEventListener('click', (e) => {
            const toggle = e.target.closest('.ss-toggle');
            if (toggle) {
                const wrap = toggle.closest('.search-select');
                const willOpen = !wrap.classList.contains('open');
                ssCloseAll(null);
                if (willOpen) {
                    ssSyncFromNative(wrap);
                    wrap.classList.add('open');
                    const f = wrap.querySelector('.ss-filter');
                    if (f) { f.value = ''; ssFilter(wrap, ''); setTimeout(() => f.focus(), 0); }
                }
                return;
            }
            const option = e.target.closest('.ss-option');
            if (option) { ssPick(option.closest('.search-select'), option); return; }
            if (!e.target.closest('.search-select')) ssCloseAll(null);
        });
        document.addEventListener('input', (e) => {
            if (e.target.classList && e.target.classList.contains('ss-filter')) {
                ssFilter(e.target.closest('.search-select'), e.target.value);
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { ssCloseAll(null); return; }
            if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('ss-filter')) {
                e.preventDefault();
                const wrap = e.target.closest('.search-select');
                const first = wrap.querySelector('.ss-option:not(.hidden):not(.ss-clear)');
                if (first) ssPick(wrap, first);
            }
        });
    }

    /* ---------- category request editor (requester submit / Central review / resubmit) ---------- */
    function catAttrRowHtml(a) {
        a = a || {};
        const types = ds().ATTR_FIELD_TYPES || ['Text', 'Number', 'Range', 'Yes/No', 'List', 'Date'];
        const uoms = ds().UOM || [];
        const mand = a.mandatory === true || a.mandatory === 'Yes';
        return `<tr class="cat-attr-row">
            <td><input class="form-input" data-f="name" value="${esc(a.name || '')}" placeholder="Attribute name"></td>
            <td><select class="form-select" data-f="fieldType">${types.map(t => `<option value="${esc(t)}" ${a.fieldType === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></td>
            <td><select class="form-select" data-f="uom"><option value="">—</option>${uoms.map(u => `<option value="${esc(u)}" ${a.uom === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></td>
            <td><select class="form-select" data-f="mandatory"><option value="No" ${mand ? '' : 'selected'}>No</option><option value="Yes" ${mand ? 'selected' : ''}>Yes</option></select></td>
            <td><input class="form-input" data-f="options" value="${esc(a.options || '')}" placeholder="For List: a, b, c"></td>
            <td><button type="button" class="btn-view btn-view-danger" data-cat="del-row" title="Remove attribute">✕</button></td>
        </tr>`;
    }

    function categoryEditorHtml(p) {
        p = p || {};
        const attrs = (p.catAttributes && p.catAttributes.length) ? p.catAttributes : [{}, {}, {}];
        return `<div class="cat-editor">
            <div class="form-grid" style="margin-bottom:14px">
                ${field({ label: 'Category name', name: 'cat::name', value: p.categoryName || '', required: true, placeholder: 'e.g. Gate valves' })}
                ${field({ label: 'UNSPSC code', name: 'cat::unspsc', value: p.unspsc || '', required: true, placeholder: 'e.g. 40141607', hint: '8-digit UNSPSC classification code' })}
            </div>
            <div class="rb-title" style="margin-bottom:8px">Attributes</div>
            <div class="cat-attr-wrap"><table class="data-table attr-edit-table">
                <thead><tr><th>Attribute name</th><th>Field type</th><th>Measured in</th><th>Mandatory</th><th>List values</th><th></th></tr></thead>
                <tbody class="cat-attr-rows">${attrs.map(catAttrRowHtml).join('')}</tbody>
            </table></div>
            <button type="button" class="btn btn-outline btn-sm" data-cat="add-row" style="margin-top:10px">+ Add attribute</button>
            <div class="field-error" data-err="cat::attrs"></div>
        </div>`;
    }

    function bindCategoryEditor(container) {
        if (container.__catBound) return;
        container.__catBound = true;
        container.addEventListener('click', (e) => {
            const t = e.target.closest('[data-cat]');
            if (!t || !container.contains(t)) return;
            const act = t.getAttribute('data-cat');
            if (act === 'add-row') {
                container.querySelector('.cat-attr-rows').insertAdjacentHTML('beforeend', catAttrRowHtml({}));
            } else if (act === 'del-row') {
                const tr = t.closest('tr'); if (tr) tr.remove();
            }
        });
    }

    function collectCategoryEditor(container) {
        const val = (sel) => { const el = container.querySelector(sel); return el ? el.value.trim() : ''; };
        const attrs = [];
        container.querySelectorAll('.cat-attr-row').forEach(tr => {
            const f = (k) => { const el = tr.querySelector(`[data-f="${k}"]`); return el ? el.value.trim() : ''; };
            if (!f('name')) return;
            attrs.push({ name: f('name'), fieldType: f('fieldType') || 'Text', uom: f('uom'), mandatory: f('mandatory') === 'Yes', options: f('options') });
        });
        return { categoryName: val('[name="cat::name"]'), unspsc: val('[name="cat::unspsc"]'), catAttributes: attrs };
    }

    function validateCategoryEditor(container, data) {
        container.querySelectorAll('.form-input, .form-select').forEach(el => el.classList.remove('error'));
        container.querySelectorAll('.field-error').forEach(el => el.textContent = '');
        const errs = [];
        if (!data.categoryName) errs.push(['[name="cat::name"]', '[data-err="cat::name"]', 'Category name is required.']);
        if (!data.unspsc) errs.push(['[name="cat::unspsc"]', '[data-err="cat::unspsc"]', 'UNSPSC code is required.']);
        errs.forEach(([inSel, errSel, msg]) => {
            const el = container.querySelector(inSel); if (el) el.classList.add('error');
            const er = container.querySelector(errSel); if (er) er.textContent = msg;
        });
        if (!data.catAttributes.length) {
            const er = container.querySelector('[data-err="cat::attrs"]');
            if (er) er.textContent = 'Add at least one attribute (with a name).';
            return false;
        }
        return errs.length === 0;
    }

    /* ---- shared PDF export: rasterize a page section (html2canvas + jsPDF),
       paginate on card boundaries, download directly ---- */
    async function exportPdf(el, filename) {
        if (!el || !window.html2canvas || !window.jspdf) {
            toast({ title: 'Export unavailable', body: 'PDF engine failed to load.', kind: 'danger' });
            return;
        }
        toast({ title: 'Generating PDF…', body: 'Capturing the page — one moment.', kind: 'info' });
        el.classList.add('pdf-export');
        await new Promise(res => setTimeout(res, 60));   // let the export styles paint
        try {
            const canvas = await window.html2canvas(el, { scale: 1.5, backgroundColor: '#ffffff', logging: false, windowWidth: el.scrollWidth });
            const px = canvas.width / (el.scrollWidth || el.offsetWidth || 1);
            const breaks = [...el.querySelectorAll('.dash-tiles, .viz-card, .dash-section, .panel-card')]
                .map(b => Math.round((b.getBoundingClientRect().top - el.getBoundingClientRect().top) * px))
                .filter(y => y > 0).sort((a, b) => a - b);
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
            const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
            const margin = 24;
            const imgW = pw - margin * 2;
            const pageH = Math.floor((ph - margin * 2) * (canvas.width / imgW));
            let y = 0, page = 0;
            while (y < canvas.height - 4) {
                let end = Math.min(y + pageH, canvas.height);
                if (end < canvas.height) {
                    const cut = breaks.filter(b => b > y + pageH * 0.55 && b <= end).pop();
                    if (cut) end = cut - Math.round(6 * px);
                }
                const slice = document.createElement('canvas');
                slice.width = canvas.width; slice.height = end - y;
                const ctx = slice.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, slice.width, slice.height);
                ctx.drawImage(canvas, 0, y, canvas.width, end - y, 0, 0, canvas.width, end - y);
                if (page) pdf.addPage();
                pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, (end - y) * (imgW / canvas.width));
                y = end; page++;
            }
            pdf.save(filename);
            toast({ title: 'PDF downloaded', body: page + ' page(s) — ' + filename, kind: 'info' });
        } catch (err) {
            toast({ title: 'Export failed', body: String(err && err.message || err), kind: 'danger' });
        } finally {
            el.classList.remove('pdf-export');
        }
    }

    /* ---- shared .xlsx export: stored-entry ZIP + one inline-string sheet.
       No libraries — a genuine Excel file built byte by byte. ---- */
    const CRC_TABLE = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
        return t;
    })();
    function crc32(bytes) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }
    function zipStore(files) {
        const enc = new TextEncoder();
        const u16 = (v) => [v & 255, (v >> 8) & 255];
        const u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
        const parts = [], central = [];
        let offset = 0;
        files.forEach(f => {
            const name = enc.encode(f.name), data = enc.encode(f.text);
            const crc = crc32(data);
            const head = new Uint8Array([0x50, 0x4B, 3, 4, ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
                ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
            parts.push(head, name, data);
            central.push({ name, crc, size: data.length, offset });
            offset += head.length + name.length + data.length;
        });
        let cdSize = 0;
        central.forEach(c => {
            const e = new Uint8Array([0x50, 0x4B, 1, 2, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
                ...u32(c.crc), ...u32(c.size), ...u32(c.size), ...u16(c.name.length), ...u16(0), ...u16(0),
                ...u16(0), ...u16(0), ...u32(0), ...u32(c.offset)]);
            parts.push(e, c.name);
            cdSize += e.length + c.name.length;
        });
        parts.push(new Uint8Array([0x50, 0x4B, 5, 6, ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length),
            ...u32(cdSize), ...u32(offset), ...u16(0)]));
        return new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }
    function xmlEsc2(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function exportXlsx(rows, sheetName, filename) {
        const rowXml = rows.map(r => '<row>' + r.map(v =>
            `<c t="inlineStr"><is><t xml:space="preserve">${xmlEsc2(v)}</t></is></c>`).join('') + '</row>').join('');
        const blob = zipStore([
            { name: '[Content_Types].xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
            { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
            { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc2(sheetName || 'Sheet1')}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
            { name: 'xl/_rels/workbook.xml.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
            { name: 'xl/worksheets/sheet1.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>` }
        ]);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }

    window.UI = {
        esc, go, nowLabel, bindActions, toast, openModal, closeModals,
        renderHeader, toggleNotifPanel,
        field, techGrid, workflowTracker, historyList,
        categoryEditorHtml, bindCategoryEditor, collectCategoryEditor, validateCategoryEditor, searchSelectHtml,
        plantName, plantLabel, groupDesc, valuationDesc, categorySchema, abcDesc, storageOptionsFor, inventoryRows, ds,
        docListHtml, docKB, bindInvMinMaxRule, exportPdf, exportXlsx
    };
})();
