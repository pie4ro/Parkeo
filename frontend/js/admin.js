const admin = requireSession('admin');
document.getElementById('userName').textContent = admin.name;
document.getElementById('logoutBtn').addEventListener('click', logout);

const globalAlert = document.getElementById('globalAlert');
const spotsBody = document.getElementById('spotsBody');
const usersBody = document.getElementById('usersBody');
const reservationsBody = document.getElementById('reservationsBody');
const genericModal = document.getElementById('genericModal');
const genericModalBody = document.getElementById('genericModalBody');

// ---- Tabs ----
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

function closeModal() {
  genericModal.classList.add('hidden');
  genericModalBody.innerHTML = '';
}

// ---- Estacionamientos ----
async function loadSpots() {
  try {
    const { spots } = await api('/admin/spots');
    spotsBody.innerHTML = spots.map((s) => `
      <tr>
        <td class="mono">${escapeHtml(s.code)}</td>
        <td><span class="pill pill-${s.status}">${s.status}</span></td>
        <td>
          <select data-id="${s.id}" class="spot-status-select">
            <option value="libre" ${s.status === 'libre' ? 'selected' : ''}>Libre</option>
            <option value="ocupado" ${s.status === 'ocupado' ? 'selected' : ''}>Ocupado</option>
            <option value="reservado" ${s.status === 'reservado' ? 'selected' : ''}>Reservado</option>
          </select>
        </td>
        <td><button class="btn-danger btn-sm" data-id="${s.id}" data-action="delete-spot">Eliminar</button></td>
      </tr>
    `).join('') || '<tr><td colspan="4" style="color:var(--ink-soft)">No hay estacionamientos.</td></tr>';

    spotsBody.querySelectorAll('.spot-status-select').forEach((sel) => {
      sel.addEventListener('change', async () => {
        try {
          await api(`/admin/spots/${sel.dataset.id}`, { method: 'PUT', body: { status: sel.value } });
          await loadSpots();
        } catch (err) { showAlert(globalAlert, err.message); }
      });
    });
    spotsBody.querySelectorAll('[data-action="delete-spot"]').forEach((btn) => {
      btn.addEventListener('click', () => confirmAction(
        '¿Eliminar este estacionamiento?',
        () => api(`/admin/spots/${btn.dataset.id}`, { method: 'DELETE' }).then(loadSpots)
      ));
    });
  } catch (err) {
    showAlert(globalAlert, err.message);
  }
}

document.getElementById('addSpotForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert(globalAlert);
  const input = document.getElementById('newSpotCode');
  try {
    await api('/admin/spots', { method: 'POST', body: { code: input.value } });
    input.value = '';
    await loadSpots();
  } catch (err) {
    showAlert(globalAlert, err.message);
  }
});

// ---- Usuarios ----
async function loadUsers() {
  try {
    const { users } = await api('/admin/users');
    usersBody.innerHTML = users.map((u) => `
      <tr>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="badge-role">${u.role}</span></td>
        <td class="mono">${escapeHtml(u.rfidUid)}</td>
        <td style="display:flex; gap:0.4rem; flex-wrap:wrap;">
          <button class="btn-secondary btn-sm" data-action="edit-user" data-id="${u.id}">Editar</button>
          <button class="btn-secondary btn-sm" data-action="reset-rfid" data-id="${u.id}">Nueva RFID</button>
          <button class="btn-secondary btn-sm" data-action="reset-pass" data-id="${u.id}">Reset contraseña</button>
          <button class="btn-danger btn-sm" data-action="delete-user" data-id="${u.id}">Eliminar</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="5" style="color:var(--ink-soft)">No hay usuarios.</td></tr>';

    usersBody.querySelectorAll('[data-action="edit-user"]').forEach((btn) => {
      btn.addEventListener('click', () => openEditUser(btn.dataset.id, users));
    });
    usersBody.querySelectorAll('[data-action="reset-rfid"]').forEach((btn) => {
      btn.addEventListener('click', () => confirmAction(
        'Se generará una nueva tarjeta RFID para este usuario. ¿Continuar?',
        () => api(`/admin/users/${btn.dataset.id}/reset-rfid`, { method: 'POST' }).then(loadUsers)
      ));
    });
    usersBody.querySelectorAll('[data-action="delete-user"]').forEach((btn) => {
      btn.addEventListener('click', () => confirmAction(
        '¿Eliminar este usuario? Esta acción no se puede deshacer.',
        () => api(`/admin/users/${btn.dataset.id}`, { method: 'DELETE' }).then(loadUsers)
      ));
    });
    usersBody.querySelectorAll('[data-action="reset-pass"]').forEach((btn) => {
      btn.addEventListener('click', () => openResetPassword(btn.dataset.id));
    });
  } catch (err) {
    showAlert(globalAlert, err.message);
  }
}

function openEditUser(id, users) {
  const u = users.find((x) => String(x.id) === String(id));
  genericModalBody.innerHTML = `
    <h3>Editar usuario</h3>
    <div id="editUserAlert" class="hidden"></div>
    <div class="field"><label>Nombre</label><input type="text" id="editName" value="${escapeHtml(u.name)}" /></div>
    <div class="field"><label>Rol</label>
      <select id="editRole">
        <option value="user" ${u.role === 'user' ? 'selected' : ''}>Usuario</option>
        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" id="cancelEdit">Cancelar</button>
      <button class="btn-primary" id="saveEdit">Guardar</button>
    </div>`;
  genericModal.classList.remove('hidden');
  document.getElementById('cancelEdit').addEventListener('click', closeModal);
  document.getElementById('saveEdit').addEventListener('click', async () => {
    try {
      await api(`/admin/users/${id}`, {
        method: 'PUT',
        body: { name: document.getElementById('editName').value, role: document.getElementById('editRole').value },
      });
      closeModal();
      await loadUsers();
    } catch (err) {
      showAlert(document.getElementById('editUserAlert'), err.message);
    }
  });
}

function openResetPassword(id) {
  genericModalBody.innerHTML = `
    <h3>Restablecer contraseña</h3>
    <div id="resetPassAlert" class="hidden"></div>
    <div class="field"><label>Nueva contraseña</label><input type="password" id="resetPassInput" minlength="6" /></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="cancelReset">Cancelar</button>
      <button class="btn-primary" id="saveReset">Guardar</button>
    </div>`;
  genericModal.classList.remove('hidden');
  document.getElementById('cancelReset').addEventListener('click', closeModal);
  document.getElementById('saveReset').addEventListener('click', async () => {
    try {
      await api(`/admin/users/${id}/reset-password`, {
        method: 'POST', body: { newPassword: document.getElementById('resetPassInput').value },
      });
      closeModal();
    } catch (err) {
      showAlert(document.getElementById('resetPassAlert'), err.message);
    }
  });
}

function confirmAction(message, onConfirm) {
  genericModalBody.innerHTML = `
    <h3>Confirmar acción</h3>
    <p style="color: var(--ink-soft); margin-bottom: 1rem;">${escapeHtml(message)}</p>
    <div class="modal-actions">
      <button class="btn-secondary" id="cancelConfirm">Cancelar</button>
      <button class="btn-danger" id="okConfirm">Confirmar</button>
    </div>`;
  genericModal.classList.remove('hidden');
  document.getElementById('cancelConfirm').addEventListener('click', closeModal);
  document.getElementById('okConfirm').addEventListener('click', async () => {
    try {
      await onConfirm();
      closeModal();
    } catch (err) {
      showAlert(globalAlert, err.message);
      closeModal();
    }
  });
}

// ---- Reservas ----
async function loadReservations() {
  try {
    const { reservations } = await api('/admin/reservations');
    reservationsBody.innerHTML = reservations.map((r) => `
      <tr>
        <td>${escapeHtml(r.userName)}<br><span style="color:var(--ink-faint); font-size:0.75rem;">${escapeHtml(r.userEmail)}</span></td>
        <td class="mono">${escapeHtml(r.spotCode)}</td>
        <td><span class="pill pill-${r.status === 'confirmada' || r.status === 'finalizada' ? 'ocupado' : r.status === 'activa' ? 'reservado' : 'libre'}">${r.status}</span></td>
        <td>${formatDateTime(r.createdAt)}</td>
        <td>${formatDateTime(r.confirmedAt)}</td>
        <td>${formatDateTime(r.endedAt)}</td>
      </tr>
    `).join('') || '<tr><td colspan="6" style="color:var(--ink-soft)">Aún no hay reservas.</td></tr>';
  } catch (err) {
    showAlert(globalAlert, err.message);
  }
}

async function refreshAll() {
  await Promise.all([loadSpots(), loadUsers(), loadReservations()]);
}

refreshAll();
setInterval(refreshAll, 6000);
