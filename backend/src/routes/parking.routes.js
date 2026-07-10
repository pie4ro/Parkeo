const express = require('express');
const { mutate, read } = require('../db/db');
const { expireOldReservations, RESERVATION_TOLERANCE_MS } = require('../services/expiry.service');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function publicSpot(s) {
  return {
    id: s.id,
    code: s.code,
    status: s.status, // libre | ocupado | reservado
    ledColor: s.ledColor, // verde | rojo | amarillo
  };
}

// GET /api/parking/spots -> estado de todo el parking (vista pública para usuarios logueados)
router.get('/spots', requireAuth, (req, res) => {
  mutate((data) => expireOldReservations(data));
  const data = read();
  const spots = data.spots.sort((a, b) => a.code.localeCompare(b.code)).map(publicSpot);
  res.json({ spots });
});

// POST /api/parking/spots/:id/reserve -> el usuario selecciona un estacionamiento libre
router.post('/spots/:id/reserve', requireAuth, (req, res) => {
  const spotId = Number(req.params.id);

  const result = mutate((data) => {
    expireOldReservations(data);

    const alreadyActive = data.reservations.find(
      (r) => r.userId === req.user.id && r.status === 'activa'
    );
    if (alreadyActive) {
      return { error: 'Ya tienes una reserva activa. Espera a que se confirme o venza para reservar otra.' };
    }

    const spot = data.spots.find((s) => s.id === spotId);
    if (!spot) return { error: 'El estacionamiento no existe.' };
    if (spot.status !== 'libre') return { error: 'Ese estacionamiento ya no está disponible.' };

    const now = new Date();
    const expiresAt = new Date(now.getTime() + RESERVATION_TOLERANCE_MS);

    const reservation = {
      id: data.meta.nextReservationId++,
      userId: req.user.id,
      spotId: spot.id,
      spotCode: spot.code,
      status: 'activa', // activa | confirmada | expirada | cancelada | finalizada
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      confirmedAt: null,
      endedAt: null,
    };
    data.reservations.push(reservation);

    spot.status = 'reservado';
    spot.ledColor = 'amarillo';
    spot.currentReservationId = reservation.id;

    return { reservation };
  });

  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json({ reservation: result.reservation });
});

// POST /api/parking/reservations/:id/cancel -> el usuario cancela su reserva antes de que venza
router.post('/reservations/:id/cancel', requireAuth, (req, res) => {
  const reservationId = Number(req.params.id);

  const result = mutate((data) => {
    expireOldReservations(data);
    const reservation = data.reservations.find((r) => r.id === reservationId);
    if (!reservation) return { error: 'La reserva no existe.' };
    if (reservation.userId !== req.user.id) return { error: 'No puedes cancelar una reserva que no es tuya.' };
    if (reservation.status !== 'activa') return { error: 'Esta reserva ya no está activa.' };

    reservation.status = 'cancelada';
    reservation.endedAt = new Date().toISOString();

    const spot = data.spots.find((s) => s.id === reservation.spotId);
    if (spot) {
      spot.status = 'libre';
      spot.ledColor = 'verde';
      spot.currentReservationId = null;
    }
    return { ok: true };
  });

  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ message: 'Reserva cancelada. El estacionamiento vuelve a estar disponible.' });
});

module.exports = router;
