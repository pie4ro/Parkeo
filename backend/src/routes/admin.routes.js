const express = require('express');
const bcrypt = require('bcryptjs');
const { mutate, read } = require('../db/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { generateRfidUid } = require('../utils/ids');
const { expireOldReservations } = require('../services/expiry.service');

const router = express.Router();
router.use(requireAuth, requireAdmin);

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    rfidUid: u.rfidUid,
    createdAt: u.createdAt,
  };
}

// ---------- USUARIOS ----------

// GET /api/admin/users
router.get('/users', (req, res) => {
  const data = read();
  res.json({ users: data.users.map(publicUser) });
});

// PUT /api/admin/users/:id  { name, role }
router.put('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, role } = req.body;

  const result = mutate((data) => {
    const user = data.users.find((u) => u.id === id);
    if (!user) return { error: 'Usuario no encontrado.' };
    if (role && !['user', 'admin'].includes(role)) return { error: 'Rol inválido.' };
    if (name) user.name = name.trim();
    if (role) user.role = role;
    return { user };
  });

  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ user: publicUser(result.user) });
});

// POST /api/admin/users/:id/reset-rfid -> genera una nueva tarjeta RFID para el usuario
router.post('/users/:id/reset-rfid', (req, res) => {
  const id = Number(req.params.id);
  const result = mutate((data) => {
    const user = data.users.find((u) => u.id === id);
    if (!user) return { error: 'Usuario no encontrado.' };
    let rfidUid;
    do {
      rfidUid = generateRfidUid();
    } while (data.users.some((u) => u.rfidUid === rfidUid));
    user.rfidUid = rfidUid;
    return { user };
  });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ user: publicUser(result.user) });
});

// POST /api/admin/users/:id/reset-password { newPassword }
router.post('/users/:id/reset-password', (req, res) => {
  const id = Number(req.params.id);
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }
  const result = mutate((data) => {
    const user = data.users.find((u) => u.id === id);
    if (!user) return { error: 'Usuario no encontrado.' };
    user.passwordHash = bcrypt.hashSync(newPassword, 10);
    return { ok: true };
  });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ message: 'Contraseña restablecida por el administrador.' });
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta de administrador.' });
  }
  const result = mutate((data) => {
    const idx = data.users.findIndex((u) => u.id === id);
    if (idx === -1) return { error: 'Usuario no encontrado.' };
    data.users.splice(idx, 1);
    return { ok: true };
  });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ message: 'Usuario eliminado.' });
});

// ---------- ESTACIONAMIENTOS ----------

// GET /api/admin/spots
router.get('/spots', (req, res) => {
  mutate((data) => expireOldReservations(data));
  const data = read();
  res.json({ spots: data.spots.sort((a, b) => a.code.localeCompare(b.code)) });
});

// POST /api/admin/spots  { code }
router.post('/spots', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'El código del estacionamiento es obligatorio.' });

  const result = mutate((data) => {
    if (data.spots.some((s) => s.code.toLowerCase() === code.trim().toLowerCase())) {
      return { error: 'Ya existe un estacionamiento con ese código.' };
    }
    const spot = {
      id: data.meta.nextSpotId++,
      code: code.trim().toUpperCase(),
      status: 'libre',
      ledColor: 'verde',
      currentReservationId: null,
    };
    data.spots.push(spot);
    return { spot };
  });

  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json({ spot: result.spot });
});

// PUT /api/admin/spots/:id  { code, status } -> edición manual (incluye forzar estado)
router.put('/spots/:id', (req, res) => {
  const id = Number(req.params.id);
  const { code, status } = req.body;
  const validStatus = { libre: 'verde', ocupado: 'rojo', reservado: 'amarillo' };

  const result = mutate((data) => {
    const spot = data.spots.find((s) => s.id === id);
    if (!spot) return { error: 'Estacionamiento no encontrado.' };
    if (code) spot.code = code.trim().toUpperCase();
    if (status) {
      if (!validStatus[status]) return { error: 'Estado inválido.' };
      spot.status = status;
      spot.ledColor = validStatus[status];
      if (status === 'libre') spot.currentReservationId = null;
    }
    return { spot };
  });

  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ spot: result.spot });
});

// DELETE /api/admin/spots/:id
router.delete('/spots/:id', (req, res) => {
  const id = Number(req.params.id);
  const result = mutate((data) => {
    const idx = data.spots.findIndex((s) => s.id === id);
    if (idx === -1) return { error: 'Estacionamiento no encontrado.' };
    data.spots.splice(idx, 1);
    return { ok: true };
  });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ message: 'Estacionamiento eliminado.' });
});

// GET /api/admin/reservations -> historial global (para supervisión del admin)
router.get('/reservations', (req, res) => {
  mutate((data) => expireOldReservations(data));
  const data = read();
  const reservations = data.reservations
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((r) => {
      const user = data.users.find((u) => u.id === r.userId);
      return { ...r, userName: user ? user.name : 'Usuario eliminado', userEmail: user ? user.email : '-' };
    });
  res.json({ reservations });
});

module.exports = router;
