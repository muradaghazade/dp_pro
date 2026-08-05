/* ============================================================
   views/categories.js — category catalog with full management:
   categories (UNSPSC code + label) and their structured attributes
   (name, field type, UoM, mandatory, list options) — create/edit/delete
   ============================================================ */
(function () {
    window.Views = window.Views || {};
    const esc = (s) => window.UI.esc(s);
    const state = { expanded: {} };

    function cats() { return window.Store.get().datasets.CATEGORY_ATTRIBUTES || []; }
    function catBy(unspsc) { return cats().find(c => c.unspsc === unspsc); }
    function ds() { return window.Store.get().datasets; }

    /* ================= rendering ================= */
    function attrTable(c) {
        if (!c.attributes.length) return `<div class="muted" style="padding:14px 4px">No attributes yet — add the first one.</div>`;
        return `<table class="data-table attr-table">
            <thead><tr>
                <th>Attribute name</th><th>Field type</th><th>UoM</th><th>Mandatory</th><th style="width:150px"></th>
            </tr></thead>
            <tbody>${c.attributes.map((a, i) => `
                <tr>
                    <td style="font-weight:600">${esc(a.name)}</td>
                    <td><span class="ft-chip" ${a.options ? `title="${esc(a.options)}"` : ''}>${esc(a.fieldType || 'Text')}</span></td>
                    <td>${a.uom ? esc(a.uom) : '<span class="muted">—</span>'}</td>
                    <td>${a.mandatory ? '<span class="mand-chip">Mandatory</span>' : '<span class="muted">Optional</span>'}</td>
                    <td style="text-align:right;white-space:nowrap">
                        <button class="btn-mini" data-act="edit-attr" data-cat="${esc(c.unspsc)}" data-i="${i}">Edit</button>
                        <button class="btn-mini danger" data-act="del-attr" data-cat="${esc(c.unspsc)}" data-i="${i}">Delete</button>
                    </td>
                </tr>`).join('')}</tbody>
        </table>`;
    }

    function catCard(c) {
        const open = state.expanded[c.unspsc] === true;   // default collapsed
        const mand = c.attributes.filter(a => a.mandatory).length;
        return `<div class="panel-card cat-card">
            <div class="cat-head" data-act="toggle" data-cat="${esc(c.unspsc)}">
                <div class="cat-head-left">
                    <span class="cat-caret">${open ? '▾' : '▸'}</span>
                    <div>
                        <div class="cat-title">${esc(c.label)} <span class="cat-code">UNSPSC ${esc(c.unspsc)}</span>
                            ${c.addedByAI ? '<span class="ai-added-chip">✦ AI-added</span>' : ''}</div>
                        <div class="cat-sub">${esc(c.materialGroup || '—')} ${esc(window.UI.groupDesc(c.materialGroup))} · ${c.attributes.length} attribute(s), ${mand} mandatory</div>
                    </div>
                </div>
                <div class="cat-head-actions">
                    <button class="btn btn-outline btn-sm" data-act="add-attr" data-cat="${esc(c.unspsc)}">＋ Add attribute</button>
                    <button class="btn-mini" data-act="edit-cat" data-cat="${esc(c.unspsc)}">Edit</button>
                    <button class="btn-mini danger" data-act="del-cat" data-cat="${esc(c.unspsc)}">Delete</button>
                </div>
            </div>
            ${open ? `<div class="cat-body">${attrTable(c)}</div>` : ''}
        </div>`;
    }

    window.Views.categories = function () {
        const root = document.getElementById('view');
        const list = cats();

        root.innerHTML = `
            <div class="sub-header"><span class="crumb-link" data-act="home">Material Master</span> › Category catalog</div>
            <div class="page-narrow" style="padding-top:4px">
                <div class="form-header" style="align-items:flex-end;margin-bottom:14px">
                    <div>
                        <h2 style="font-size:22px;font-weight:600">Categories &amp; attributes</h2>
                        <div class="muted" style="font-size:14px;margin-top:3px">Each category (UNSPSC code + label) defines the structured attributes that must be filled when creating items in that category.</div>
                    </div>
                    <button class="btn btn-black" data-act="add-cat">＋ Add category</button>
                </div>
                ${list.length ? list.map(catCard).join('') : '<div class="empty-state">No categories yet. Add the first one.</div>'}
                <div class="seen-all">${list.length} categories defined. Mandatory attributes block item request submission when left blank.</div>
            </div>`;

        window.UI.bindActions(root, {
            'home': () => window.UI.go('#/master'),
            'toggle': (t) => {
                const id = t.getAttribute('data-cat');
                state.expanded[id] = state.expanded[id] !== true;
                window.Views.categories();
            },
            'add-cat': () => catModal(null),
            'edit-cat': (t, e) => { e.stopPropagation(); catModal(t.getAttribute('data-cat')); },
            'del-cat': (t, e) => { e.stopPropagation(); delCat(t.getAttribute('data-cat')); },
            'add-attr': (t, e) => { e.stopPropagation(); attrModal(t.getAttribute('data-cat'), null); },
            'edit-attr': (t) => attrModal(t.getAttribute('data-cat'), +t.getAttribute('data-i')),
            'del-attr': (t) => delAttr(t.getAttribute('data-cat'), +t.getAttribute('data-i'))
        });
    };

    /* ================= category CRUD ================= */
    function catModal(unspsc) {
        const c = unspsc ? catBy(unspsc) : null;
        const groups = ds().MATERIAL_GROUPS;
        window.UI.openModal({
            title: c ? 'Edit category' : 'Add category',
            bodyHtml: `
                <div class="field" style="margin-bottom:12px"><label>UNSPSC code <span class="req">*</span></label>
                    <input class="form-input" id="cm-code" value="${esc(c ? c.unspsc : '')}" ${c ? 'readonly' : ''} placeholder="e.g. 31171504"></div>
                <div class="field" style="margin-bottom:12px"><label>UNSPSC label <span class="req">*</span></label>
                    <input class="form-input" id="cm-label" value="${esc(c ? c.label : '')}" placeholder="e.g. Ball bearings"></div>
                <div class="field"><label>Material group</label>
                    <select class="form-select" id="cm-group">
                        <option value="">Select…</option>
                        ${groups.map(g => `<option value="${esc(g.code)}" ${c && c.materialGroup === g.code ? 'selected' : ''}>${esc(g.code + ' — ' + g.desc)}</option>`).join('')}
                    </select></div>`,
            buttons: [
                { label: 'Cancel', cls: 'btn-outline', onClick: (o) => o.remove() },
                { label: c ? 'Save changes' : 'Add category', cls: 'btn-green', onClick: (o) => {
                    const code = o.querySelector('#cm-code').value.trim();
                    const label = o.querySelector('#cm-label').value.trim();
                    const group = o.querySelector('#cm-group').value;
                    if (!code || !label) { window.UI.toast({ title: 'Missing data', body: 'UNSPSC code and label are required.', kind: 'danger' }); return; }
                    if (!c && catBy(code)) { window.UI.toast({ title: 'Already exists', body: 'A category with UNSPSC ' + code + ' already exists.', kind: 'danger' }); return; }
                    window.Store.set(s => {
                        if (c) {
                            const cc = s.datasets.CATEGORY_ATTRIBUTES.find(x => x.unspsc === unspsc);
                            cc.label = label; cc.materialGroup = group;
                        } else {
                            s.datasets.CATEGORY_ATTRIBUTES.push({ unspsc: code, label, materialGroup: group, attributes: [] });
                        }
                    });
                    o.remove();
                    window.UI.toast({ title: c ? 'Category updated' : 'Category added', body: label + ' (UNSPSC ' + code + ')' });
                    window.Views.categories();
                } }
            ]
        });
    }

    function delCat(unspsc) {
        const c = catBy(unspsc);
        if (!c) return;
        window.UI.openModal({
            title: 'Delete category',
            bodyHtml: `<p>Delete <strong>${esc(c.label)}</strong> (UNSPSC ${esc(c.unspsc)}) and its ${c.attributes.length} attribute(s)?<br>
                <span class="muted">Existing items keep their saved attribute values; new items in this category will have no attribute schema.</span></p>`,
            buttons: [
                { label: 'Cancel', cls: 'btn-outline', onClick: (o) => o.remove() },
                { label: 'Delete', cls: 'btn-danger-outline', onClick: (o) => {
                    window.Store.set(s => {
                        s.datasets.CATEGORY_ATTRIBUTES = s.datasets.CATEGORY_ATTRIBUTES.filter(x => x.unspsc !== unspsc);
                    });
                    o.remove();
                    window.UI.toast({ title: 'Category deleted', body: c.label, kind: 'danger' });
                    window.Views.categories();
                } }
            ]
        });
    }

    /* ================= attribute CRUD ================= */
    function attrModal(unspsc, index) {
        const c = catBy(unspsc);
        if (!c) return;
        const a = index !== null && index !== undefined && c.attributes[index] ? c.attributes[index] : null;
        const types = ds().ATTR_FIELD_TYPES || ['Text', 'Number', 'Range', 'Yes/No', 'List', 'Date'];
        const uoms = ds().UOM;
        window.UI.openModal({
            title: (a ? 'Edit attribute — ' : 'Add attribute — ') + c.label,
            bodyHtml: `
                <div class="field" style="margin-bottom:12px"><label>Attribute name <span class="req">*</span></label>
                    <input class="form-input" id="am-name" value="${esc(a ? a.name : '')}" placeholder="e.g. Bore diameter"></div>
                <div style="display:flex;gap:12px;margin-bottom:12px">
                    <div class="field" style="flex:1"><label>Field type <span class="req">*</span></label>
                        <select class="form-select" id="am-type">
                            ${types.map(t => `<option ${a && a.fieldType === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
                        </select></div>
                    <div class="field" style="flex:1"><label>Unit of measure</label>
                        <select class="form-select" id="am-uom">
                            <option value="">— none —</option>
                            ${uoms.map(u => `<option ${a && a.uom === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}
                        </select></div>
                </div>
                <div class="field" style="margin-bottom:12px" id="am-options-wrap">
                    <label>List values <span class="muted" style="font-weight:400">(for List type, comma-separated)</span></label>
                    <input class="form-input" id="am-options" value="${esc(a ? a.options || '' : '')}" placeholder="e.g. CN, C2, C3, C4"></div>
                <label class="checkbox-label" style="font-size:14px"><input type="checkbox" id="am-mand" ${a && a.mandatory ? 'checked' : ''}> Mandatory — blocks item request submission when blank</label>`,
            onOpen: (o) => {
                const typeSel = o.querySelector('#am-type');
                const optsWrap = o.querySelector('#am-options-wrap');
                const sync = () => { optsWrap.style.display = typeSel.value === 'List' ? '' : 'none'; };
                typeSel.addEventListener('change', sync); sync();
            },
            buttons: [
                { label: 'Cancel', cls: 'btn-outline', onClick: (o) => o.remove() },
                { label: a ? 'Save changes' : 'Add attribute', cls: 'btn-green', onClick: (o) => {
                    const name = o.querySelector('#am-name').value.trim();
                    const fieldType = o.querySelector('#am-type').value;
                    const uom = o.querySelector('#am-uom').value;
                    const options = o.querySelector('#am-options').value.trim();
                    const mandatory = o.querySelector('#am-mand').checked;
                    if (!name) { window.UI.toast({ title: 'Missing data', body: 'Attribute name is required.', kind: 'danger' }); return; }
                    if (fieldType === 'List' && !options) { window.UI.toast({ title: 'Missing data', body: 'List type needs at least one value.', kind: 'danger' }); return; }
                    const dup = c.attributes.some((x, i) => x.name.toLowerCase() === name.toLowerCase() && i !== index);
                    if (dup) { window.UI.toast({ title: 'Already exists', body: 'This category already has an attribute named “' + name + '”.', kind: 'danger' }); return; }
                    window.Store.set(s => {
                        const cc = s.datasets.CATEGORY_ATTRIBUTES.find(x => x.unspsc === unspsc);
                        const obj = { name, fieldType, uom, mandatory, options: fieldType === 'List' ? options : '' };
                        if (a) cc.attributes[index] = obj; else cc.attributes.push(obj);
                    });
                    o.remove();
                    window.UI.toast({ title: a ? 'Attribute updated' : 'Attribute added', body: name + ' (' + fieldType + (uom ? ', ' + uom : '') + ')' });
                    window.Views.categories();
                } }
            ]
        });
    }

    function delAttr(unspsc, index) {
        const c = catBy(unspsc);
        if (!c || !c.attributes[index]) return;
        const a = c.attributes[index];
        window.UI.openModal({
            title: 'Delete attribute',
            bodyHtml: `<p>Delete attribute <strong>${esc(a.name)}</strong> from <strong>${esc(c.label)}</strong>?</p>`,
            buttons: [
                { label: 'Cancel', cls: 'btn-outline', onClick: (o) => o.remove() },
                { label: 'Delete', cls: 'btn-danger-outline', onClick: (o) => {
                    window.Store.set(s => {
                        const cc = s.datasets.CATEGORY_ATTRIBUTES.find(x => x.unspsc === unspsc);
                        cc.attributes.splice(index, 1);
                    });
                    o.remove();
                    window.UI.toast({ title: 'Attribute deleted', body: a.name, kind: 'danger' });
                    window.Views.categories();
                } }
            ]
        });
    }
})();
