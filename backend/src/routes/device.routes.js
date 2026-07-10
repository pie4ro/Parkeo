const express = require('express');
const { mutate } = require('../db/db');
const { expireOldReservations } = require('../services/expiry.service');

const router = express.Router();

// Estas rutas representan lo que, en el hardware real, publicaría el ESP32
// (lector RFID + sensores de presencia) hacia el backend. No requieren sesión
// de usuario porque el propio dispositivo físico es el que las invoca.

// POST /api/device/scan  { rfidUid, spotId }
// La tarjeta RFID (el "auto") es leída en la entrada del estacionamiento elegido.
router.post('/scan', (req, res) => {
  const { rfidUid, spotId } = req.body;
  if (!rfidUid || !spotId) {
    return res.status(400).json({ error: 'rfidUid y spotId son obligatorios.' });
  }

  const result = mutate((data) => {
    expireOldReservations(data);

    const user = data.users.find((u) => u.rfidUid === rfidUid);
    if (!user) return { error: 'Tarjeta RFID no reconocida.' };

    const spot = data.spots.find((s) => s.id === Number(spotId));
    if (!spot) return { error: 'Estacionamiento no encontrado.' };

    // Caso 1: el spot estaba reservado por este usuario -> se confirma el ingreso.
    const reservation = data.reservations.find(
      (r) => r.spotId === spot.id && r.status === 'activa' && r.userId === user.id
    );

    if (reservation) {
      reservation.status = 'confirmada';
      reservation.confirmedAt = new Date().toISOString();
      spot.status = 'ocupado';
      spot.ledColor = 'rojo';
      return { ok: true, message: `Ingreso confirmado para ${user.name} en ${spot.code}.` };
    }

    // Caso 2: ingreso directo (walk-in) a un spot libre, sin reserva previa.
    if (spot.status === 'libre') {
      spot.status = 'ocupado';
      spot.ledColor = 'rojo';
      return { ok: true, message: `Vehículo detectado en ${spot.code}. Estado actualizado a ocupado.` };
    }

    return { error: 'El estacionamiento no está disponible para este vehículo (reservado por otro usuario u ocupado).' };
  });

  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ message: result.message });
});

// POST /api/device/exit  { spotId }
// El sensor detecta que el vehículo salió del estacionamiento.
router.post('/exit', (req, res) => {
  const { spotId } = req.body;
  if (!spotId) return res.status(400).json({ error: 'spotId es obligatorio.' });

  const result = mutate((data) => {
    const spot = data.spots.find((s) => s.id === Number(spotId));
    if (!spot) return { error: 'Estacionamiento no encontrado.' };

    const reservation = data.reservations.find(
      (r) => r.spotId === spot.id && r.status === 'confirmada'
    );
    if (reservation) {
      reservation.status = 'finalizada';
      reservation.endedAt = new Date().toISOString();
    }

    spot.status = 'libre';
    spot.ledColor = 'verde';
    spot.currentReservationId = null;
    return { ok: true, message: `${spot.code} quedó libre nuevamente.` };
  });

  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ message: result.message });
});

module.exports = router;
