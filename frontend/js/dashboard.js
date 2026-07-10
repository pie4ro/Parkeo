const user = requireSession('user');
document.getElementById('userName').textContent = user.name;

const globalAlert = document.getElementById('globalAlert');
const parkingLot = document.getElementById('parkingLot');
const reservationPanel = document.getElementById('reservationPanel');
const historyBody = document.getElementById('historyBody');
const historyCount = document.getElementById('historyCount');
const rfidCode = document.getElementById('rfidCode');

let countdownTimer = null;
let currentReservation = null;

const STATUS_LABEL = { libre: 'Libre', ocupado: 'Ocupado', reservado: 'Reservado' };

function renderSpots(spots) {
  if (!spots.length) {
    parkingLot.innerHTML = '<div class="empty-state">Aún no hay estacionamientos configurados.</div>';
    return;
  }
  parkingLot.innerHTML = spots.map((s) => `
    <button class="spot ${s.status} spot-select" data-id="${s.id}" ${s.status !== 'libre' ? 'disabled' : ''}>
      <span class="code">${escapeHtml(s.code)}</span>
      <span class="status-row"><span class="led-dot"></span> ${STATUS_LABEL[s.status] || s.status}</span>
    </button>
  `).join('');

  parkingLot.querySelectorAll('.spot-select').forEach((btn) => {
    btn.addEventListener('click', () => reserveSpot(btn.dataset.id));
  });
}

async function reserveSpot(spotId) {
  hideAlert(globalAlert);
  try {
    await api(`/parking/spots/${spotId}/reserve`, { method: 'POST' });
    await refreshAll();
  } catch (err) {
    showAlert(globalAlert, err.message);
  }
}

async function cancelReservation(reservationId) {
  hideAlert(globalAlert);
  try {
    await api(`/parking/reservations/${reservationId}/cancel`, { method: 'POST' });
    await refreshAll();
  } catch (err) {
    showAlert(globalAlert, err.message);
  }
}

function renderReservation(reservation) {
  currentReservation = reservation;
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }

  if (!reservation) {
    reservationPanel.innerHTML = `
      <div class="empty-state">
        <div class="icon">🅿️</div>
        No tienes una reserva activa. Selecciona un estacionamiento libre en el mapa.
      </div>`;
    return;
  }

  if (reservation.status === 'confirmada') {
    reservationPanel.innerHTML = `
      <div style="text-align:center; padding: 0.6rem 0 0.2rem;">
        <span class="pill pill-ocupado">Ingreso confirmado</span>
        <h3 style="margin-top:0.8rem; font-size:1.4rem;">${escapeHtml(reservation.spotCode)}</h3>
        <p style="color: var(--ink-soft); font-size: 0.85rem; margin-top: 0.4rem;">
          El sensor detectó tu vehículo el ${formatDateTime(reservation.confirmedAt)}.
        </p>
      </div>`;
    return;
  }

  // Reserva activa: mostramos el anillo de cuenta regresiva (1 minuto de tolerancia).
  reservationPanel.innerHTML = `
    <div style="text-align:center;">
      <span class="pill pill-reservado">Reservado</span>
      <h3 style="margin: 0.6rem 0 0; font-size: 1.4rem;">${escapeHtml(reservation.spotCode)}</h3>
      <div class="countdown-ring">
        <svg width="108" height="108" viewBox="0 0 108 108">
          <circle class="bg" cx="54" cy="54" r="46"></circle>
          <circle class="fg" id="ringFg" cx="54" cy="54" r="46"></circle>
        </svg>
        <div class="label"><span class="time" id="ringTime">60</span><span class="unit">segundos</span></div>
      </div>
      <p style="color: var(--ink-soft); font-size: 0.82rem; margin-bottom: 1rem;">
        Acerca tu tarjeta RFID antes de que venza la tolerancia o la reserva se liberará automáticamente.
      </p>
      <button class="btn-danger btn-sm" id="cancelBtn">Cancelar reserva</button>
    </div>`;

  document.getElementById('cancelBtn').addEventListener('click', () => cancelReservation(reservation.id));

  const circle = document.getElementById('ringFg');
  const timeLabel = document.getElementById('ringTime');
  const circumference = 2 * Math.PI * 46;
  circle.style.strokeDasharray = `${circumference}`;

  const totalMs = new Date(reservation.expiresAt) - new Date(reservation.createdAt);

  function tick() {
    const remainingMs = new Date(reservation.expiresAt) - new Date();
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
    timeLabel.textContent = remainingSec;
    const fraction = Math.max(0, Math.min(1, remainingMs / totalMs));
    circle.style.strokeDashoffset = `${circumference * (1 - fraction)}`;
    if (remainingMs <= 0) {
      clearInterval(countdownTimer);
      refreshAll();
    }
  }
  tick();
  countdownTimer = setInterval(tick, 1000);
}

function renderHistory(history) {
  historyCount.textContent = history.length;
  if (!history.length) {
    historyBody.innerHTML = '<tr><td colspan="5" style="color: var(--ink-soft);">Todavía no tienes reservas registradas.</td></tr>';
    return;
  }
  historyBody.innerHTML = history.map((r) => `
    <tr>
      <td class="mono">${escapeHtml(r.spotCode)}</td>
      <td><span class="pill pill-${r.status === 'confirmada' || r.status === 'finalizada' ? 'ocupado' : r.status === 'activa' ? 'reservado' : 'libre'}">${r.status}</span></td>
      <td>${formatDateTime(r.createdAt)}</td>
      <td>${formatDateTime(r.confirmedAt)}</td>
      <td>${formatDateTime(r.endedAt)}</td>
    </tr>
  `).join('');
}

async function refreshAll() {
  try {
    const [{ spots }, { reservation }, { history }] = await Promise.all([
      api('/parking/spots'),
      api('/reservations/current'),
      api('/reservations/history'),
    ]);
    renderSpots(spots);
    renderReservation(reservation);
    renderHistory(history);
  } catch (err) {
    showAlert(globalAlert, err.message);
  }
}

rfidCode.textContent = user.rfidUid || '—';

refreshAll();
setInterval(() => {
  // No refrescamos si el usuario está a mitad de una cuenta regresiva visual para no cortarla;
  // igual actualizamos el mapa y el historial que no dependen de esa animación.
  refreshAll();
}, 6000);

document.getElementById('logoutBtn').addEventListener('click', logout);

// ---- Modal de cambio de contraseña ----
const passwordModal = document.getElementById('passwordModal');
const modalAlert = document.getElementById('modalAlert');
document.getElementById('passwordBtn').addEventListener('click', () => passwordModal.classList.remove('hidden'));
document.getElementById('cancelModalBtn').addEventListener('click', () => passwordModal.classList.add('hidden'));

document.getElementById('passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert(modalAlert);
  try {
    await api('/auth/change-password', {
      method: 'POST',
      body: {
        currentPassword: document.getElementById('currentPassword').value,
        newPassword: document.getElementById('newPassword').value,
      },
    });
    passwordModal.classList.add('hidden');
    showAlert(globalAlert, 'Contraseña actualizada correctamente.', 'success');
    e.target.reset();
  } catch (err) {
    showAlert(modalAlert, err.message);
  }
});
