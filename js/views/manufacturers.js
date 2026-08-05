/* ============================================================
   views/manufacturers.js — manufacturer master data (Central team only)
   ============================================================ */
(function () {
    window.Views = window.Views || {};
    const esc = (s) => window.UI.esc(s);

    function list() { return window.Store.get().datasets.MANUFACTURERS || []; }

    function restricted(root) {
        root.innerHTML = `<div class="page-narrow"><div class="inbox-empty" style="margin-top:30px">
            <div style="font-size:26px">🔒</div>
            <div style="font-weight:600;margin-top:10px;font-size:15px">Central team only</div>
            <div class="muted" style="font-size:14px;margin-top:3px">Switch to the Central team role to manage this page.</div>
        </div></div>`;
    }

    window.Views.manufacturers = function () {
        const root = document.getElementById('view');
        if (window.Store.session().currentRole !== 'Central team') return restricted(root);
        const rows = list();
        const usage = {};
        window.Store.materials().forEach(m => { if (m.manufacturer) usage[m.manufacturer] = (usage[m.manufacturer] || 0) + 1; });

        root.innerHTML = `
            <div class="sub-header"><span class="crumb-link" data-act="home">Material Master</span> › Manufacturers</div>
            <div class="page-narrow" style="padding-top:4px">
                <div class="form-header" style="align-items:flex-end;margin-bottom:14px">
                    <div>
                        <h2 style="font-size:22px;font-weight:600">Manufacturers</h2>
                        <div class="muted" style="font-size:14px;margin-top:3px">Master list of manufacturers referenced by material records and item requests.</div>
                    </div>
                    <button class="btn btn-black" data-act="add">＋ Add manufacturer</button>
                </div>
                <div class="panel-card" style="padding:0;overflow:hidden">
                    <table class="data-table attr-table">
                        <thead><tr><th style="padding-left:20px">Name</th><th>Country</th><th>Used by items</th><th style="width:150px"></th></tr></thead>
                        <tbody>${rows.map((m, i) => `
                            <tr>
                                <td style="font-weight:600;padding-left:20px">${esc(m.name)}</td>
                                <td>${m.country ? esc(m.country) : '<span class="muted">—</span>'}</td>
                                <td>${usage[m.name] ? usage[m.name] + ' item(s)' : '<span class="muted">—</span>'}</td>
                                <td style="text-align:right;white-space:nowrap;padding-right:20px">
                                    <button class="btn-mini" data-act="edit" data-i="${i}">Edit</button>
                                    <button class="btn-mini danger" data-act="del" data-i="${i}">Delete</button>
                                </td>
                            </tr>`).join('')}</tbody>
                    </table>
                </div>
                <div class="seen-all">${rows.length} manufacturers.</div>
            </div>`;

        window.UI.bindActions(root, {
            'home': () => window.UI.go('#/master'),
            'add': () => modal(null),
            'edit': (t) => modal(+t.getAttribute('data-i')),
            'del': (t) => del(+t.getAttribute('data-i'))
        });
    };

    function modal(index) {
        const m = index !== null && index !== undefined ? list()[index] : null;
        window.UI.openModal({
            title: m ? 'Edit manufacturer' : 'Add manufacturer',
            bodyHtml: `
                <div class="field" style="margin-bottom:12px"><label>Name <span class="req">*</span></label>
                    <input class="form-input" id="mm-name" value="${esc(m ? m.name : '')}" placeholder="e.g. SKF"></div>
                <div class="field"><label>Country</label>
                    <input class="form-input" id="mm-country" value="${esc(m ? m.country || '' : '')}" placeholder="e.g. Sweden"></div>`,
            buttons: [
                { label: 'Cancel', cls: 'btn-outline', onClick: (o) => o.remove() },
                { label: m ? 'Save changes' : 'Add manufacturer', cls: 'btn-green', onClick: (o) => {
                    const name = o.querySelector('#mm-name').value.trim();
                    const country = o.querySelector('#mm-country').value.trim();
                    if (!name) { window.UI.toast({ title: 'Missing data', body: 'Manufacturer name is required.', kind: 'danger' }); return; }
                    const dup = list().some((x, i) => x.name.toLowerCase() === name.toLowerCase() && i !== index);
                    if (dup) { window.UI.toast({ title: 'Already exists', body: '“' + name + '” is already in the list.', kind: 'danger' }); return; }
                    window.Store.set(s => {
                        if (m) { s.datasets.MANUFACTURERS[index] = { name, country }; }
                        else s.datasets.MANUFACTURERS.push({ name, country });
                    });
                    o.remove();
                    window.UI.toast({ title: m ? 'Manufacturer updated' : 'Manufacturer added', body: name });
                    window.Views.manufacturers();
                } }
            ]
        });
    }

    function del(index) {
        const m = list()[index];
        if (!m) return;
        const used = window.Store.materials().filter(x => x.manufacturer === m.name).length;
        window.UI.openModal({
            title: 'Delete manufacturer',
            bodyHtml: `<p>Delete <strong>${esc(m.name)}</strong>?${used ? `<br><span class="muted">${used} existing item(s) reference it — they keep their saved value.</span>` : ''}</p>`,
            buttons: [
                { label: 'Cancel', cls: 'btn-outline', onClick: (o) => o.remove() },
                { label: 'Delete', cls: 'btn-danger-outline', onClick: (o) => {
                    window.Store.set(s => { s.datasets.MANUFACTURERS.splice(index, 1); });
                    o.remove();
                    window.UI.toast({ title: 'Manufacturer deleted', body: m.name, kind: 'danger' });
                    window.Views.manufacturers();
                } }
            ]
        });
    }
})();
