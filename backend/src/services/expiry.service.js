const RESERVATION_TOLERANCE_MS = 60 * 1000; // 1 minuto de tolerancia

// Recorre las reservas activas y libera los estacionamientos cuyo tiempo
// de tolerancia venció sin que el sensor haya confirmado el ingreso del vehículo.
function expireOldReservations(data) {
  const now = Date.now();
  let changed = false;

  for (const r of data.reservations) {
    if (r.status === 'activa' && new Date(r.expiresAt).getTime() <= now) {
      r.status = 'expirada';
      r.endedAt = new Date().toISOString();
      const spot = data.spots.find((s) => s.id === r.spotId);
      if (spot && spot.status === 'reservado') {
        spot.status = 'libre';
        spot.ledColor = 'verde';
        spot.currentReservationId = null;
      }
      changed = true;
    }
  }
  return changed;
}

module.exports = { expireOldReservations, RESERVATION_TOLERANCE_MS };
