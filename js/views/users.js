/* ============================================================
   views/users.js — user management (Central team only):
   list with roles, invite, edit, delete
   ============================================================ */
(function () {
    window.Views = window.Views || {};
    const esc = (s) => window.UI.esc(s);

    function users() { return window.Store.get().users || []; }
    function ds() { return window.Store.get().datasets; }

    function restricted(root) {
        root.innerHTML = `<div class="page-narrow"><div class="inbox-empty" style="margin-top:30px">
            <div style="font-size:26px">🔒</div>
            <div style="font-weight:600;margin-top:10px;font-size:15px">Central team only</div>
            <div class="muted" style="font-size:14px;margin-top:3px">Switch to the Central team role to manage users.</div>
        </div></div>`;
    }

    function initials(name) {
        return (name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    }

    window.Views.users = function () {
        const root = document.getElementById('view');
        if (window.Store.session().currentRole !== 'Central team') return restricted(root);
        const rows = users();
        const me = window.Store.session().currentUser;

        root.innerHTML = `
            <div class="sub-header"><span class="crumb-link" data-act="home">Material Master</span> › User management</div>
            <div class="page-narrow" style="padding-top:4px">
                <div class="form-header" style="align-items:flex-end;margin-bottom:14px">
                    <div>
                        <h2 style="font-size:22px;font-weight:600">User management</h2>
                        <div class="muted" style="font-size:14px;margin-top:3px">Users of the Demand Planning module and their roles.</div>
                    </div>
                    <button class="btn btn-black" data-act="invite">＋ Invite user</button>
                </div>
                <div class="panel-card" style="padding:0;overflow:hidden">
                    <table class="data-table attr-table">
                        <thead><tr>
                            <th style="padding-left:20px">User</th><th>Email</th><th>Role</th><th>Plant</th><th>Status</th><th style="width:150px"></th>
                        </tr></thead>
                        <tbody>${rows.map(u => `
                            <tr>
                                <td style="padding-left:20px">
                                    <div style="display:flex;align-items:center;gap:10px">
                                        <span class="user-initials">${esc(initials(u.name))}</span>
                                        <span style="font-weight:600">${esc(u.name)}${u.name === me ? ' <span class="muted" style="font-weight:400">(you)</span>' : ''}</span>
                                    </div>
                                </td>
                                <td>${esc(u.email)}</td>
                                <td><span class="role-chip">${esc(u.role)}</span></td>
                                <td><div class="mc-plants">${(u.plants || []).map(pc =>
                                    `<span class="plant-chip" title="${esc(window.UI.plantName(pc))}">${esc(pc)}</span>`).join('') || '<span class="muted">—</span>'}</div></td>
                                <td>${u.status === 'Invited'
                                    ? '<span class="status-pill in-review">Invited</span>'
                                    : '<span class="status-pill approved">Active</span>'}</td>
                                <td style="text-align:right;white-space:nowrap;padding-right:20px">
                                    <button class="btn-mini" data-act="edit" data-id="${esc(u.id)}">Edit</button>
                                    <button class="btn-mini danger" data-act="del" data-id="${esc(u.id)}">Delete</button>
                                </td>
                            </tr>`).join('')}</tbody>
                    </table>
                </div>
                <div class="seen-all">${rows.length} user(s) · ${rows.filter(u => u.status === 'Invited').length} pending invitation(s).</div>
            </div>`;

        window.UI.bindActions(root, {
            'home': () => window.UI.go('#/master'),
            'invite': () => modal(null),
            'edit': (t) => modal(t.getAttribute('data-id')),
            'del': (t) => del(t.getAttribute('data-id'))
        });
    };

    function modal(id) {
        const u = id ? users().find(x => x.id === id) : null;
        window.UI.openModal({
            title: u ? 'Edit user' : 'Invite user',
            bodyHtml: `
                <div class="field" style="margin-bottom:12px"><label>Full name <span class="req">*</span></label>
                    <input class="form-input" id="um-name" value="${esc(u ? u.name : '')}" placeholder="e.g. Samir Novruzov"></div>
                <div class="field" style="margin-bottom:12px"><label>Email <span class="req">*</span></label>
                    <input class="form-input" id="um-email" value="${esc(u ? u.email : '')}" placeholder="name@dmp.az"></div>
                <div class="field" style="margin-bottom:12px"><label>Role <span class="req">*</span></label>
                    <select class="form-select" id="um-role">
                        ${ds().ROLES.map(r => `<option ${u && u.role === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}
                    </select></div>
                <div class="field"><label>Plants <span class="req">*</span> <span class="muted" style="font-weight:400">(select one or more)</span></label>
                    <div class="checkbox-group plants-picker">
                        ${ds().PLANTS.map(p => `<label class="checkbox-label">
                            <input type="checkbox" class="um-plant" value="${esc(p.code)}" ${u && (u.plants || []).indexOf(p.code) !== -1 ? 'checked' : ''}>
                            ${esc(p.code + ' — ' + p.name)}</label>`).join('')}
                    </div></div>`,
            buttons: [
                { label: 'Cancel', cls: 'btn-outline', onClick: (o) => o.remove() },
                { label: u ? 'Save changes' : 'Send invitation', cls: 'btn-green', onClick: (o) => {
                    const name = o.querySelector('#um-name').value.trim();
                    const email = o.querySelector('#um-email').value.trim();
                    const role = o.querySelector('#um-role').value;
                    const plants = [...o.querySelectorAll('.um-plant:checked')].map(cb => cb.value);
                    if (!name || !email) { window.UI.toast({ title: 'Missing data', body: 'Name and email are required.', kind: 'danger' }); return; }
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { window.UI.toast({ title: 'Invalid email', body: 'Please enter a valid email address.', kind: 'danger' }); return; }
                    if (!plants.length) { window.UI.toast({ title: 'Missing data', body: 'Select at least one plant.', kind: 'danger' }); return; }
                    const dup = users().some(x => x.email.toLowerCase() === email.toLowerCase() && x.id !== id);
                    if (dup) { window.UI.toast({ title: 'Already exists', body: 'A user with this email already exists.', kind: 'danger' }); return; }
                    window.Store.set(s => {
                        if (u) {
                            const uu = s.users.find(x => x.id === id);
                            uu.name = name; uu.email = email; uu.role = role; uu.plants = plants;
                        } else {
                            s.users.push({ id: window.Store.uid('usr'), name, email, role, plants, status: 'Invited' });
                        }
                    });
                    o.remove();
                    window.UI.toast(u
                        ? { title: 'User updated', body: name + ' — ' + role }
                        : { title: 'Invitation sent', body: 'An invite was emailed to ' + email + ' for the ' + role + ' role.', kind: 'info' });
                    window.Views.users();
                } }
            ]
        });
    }

    function del(id) {
        const u = users().find(x => x.id === id);
        if (!u) return;
        if (u.name === window.Store.session().currentUser) {
            window.UI.toast({ title: 'Not allowed', body: 'You cannot delete your own account.', kind: 'danger' });
            return;
        }
        window.UI.openModal({
            title: 'Delete user',
            bodyHtml: `<p>Delete <strong>${esc(u.name)}</strong> (${esc(u.email)})?<br>
                <span class="muted">They will lose access to the Demand Planning module. Their past requests and approvals stay in the history.</span></p>`,
            buttons: [
                { label: 'Cancel', cls: 'btn-outline', onClick: (o) => o.remove() },
                { label: 'Delete user', cls: 'btn-danger-outline', onClick: (o) => {
                    window.Store.set(s => { s.users = s.users.filter(x => x.id !== id); });
                    o.remove();
                    window.UI.toast({ title: 'User deleted', body: u.name, kind: 'danger' });
                    window.Views.users();
                } }
            ]
        });
    }
})();
