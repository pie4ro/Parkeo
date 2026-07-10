const express = require('express');
const { mutate, read } = require('../db/db');
const { expireOldReservations } = require('../services/expiry.service');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function publicReservation(r) {
  return {
    id: r.id,
    spotId: r.spotId,
    spotCode: r.spotCode,
    status: r.status,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    confirmedAt: r.confirmedAt,
    endedAt: r.endedAt,
  };
}

// GET /api/reservations/current -> reserva vigente del usuario (activa o confirmada) con tiempo de vencimiento
router.get('/current', requireAuth, (req, res) => {
  mutate((data) => expireOldReservations(data));
  const data = read();
  const current = data.reservations
    .filter((r) => r.userId === req.user.id && (r.status === 'activa' || r.status === 'confirmada'))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

  res.json({ reservation: current ? publicReservation(current) : null });
});

// GET /api/reservations/history -> historial completo de reservas del usuario
router.get('/history', requireAuth, (req, res) => {
  mutate((data) => expireOldReservations(data));
  const data = read();
  const history = data.reservations
    .filter((r) => r.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(publicReservation);

  res.json({ history });
});

module.exports = router;
