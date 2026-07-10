require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const { read, write, mutate } = require('./db/db');
const { expireOldReservations } = require('./services/expiry.service');
const { generateRfidUid } = require('./utils/ids');

const authRoutes = require('./routes/auth.routes');
const parkingRoutes = require('./routes/parking.routes');
const reservationRoutes = require('./routes/reservation.routes');
const adminRoutes = require('./routes/admin.routes');
const deviceRoutes = require('./routes/device.routes');

const PORT = process.env.PORT || 4000;

function seed() {
  const data = read();

  // Crea el usuario administrador si todavía no existe (requisito no funcional).
  if (!data.users.some((u) => u.role === 'admin')) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@parking.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123';
    data.users.push({
      id: data.meta.nextUserId++,
      name: 'Administrador',
      email: adminEmail,
      passwordHash: bcrypt.hashSync(adminPassword, 10),
      role: 'admin',
      rfidUid: generateRfidUid(),
      securityQuestion: '¿Cuál es el nombre del sistema?',
      securityAnswerHash: bcrypt.hashSync('parking', 10),
      createdAt: new Date().toISOString(),
    });
    console.log(`Usuario admin creado -> ${adminEmail} / ${adminPassword}`);
  }

  // Crea estacionamientos de ejemplo si la base está vacía.
  if (data.spots.length === 0) {
    ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'].forEach((code) => {
      data.spots.push({
        id: data.meta.nextSpotId++,
        code,
        status: 'libre',
        ledColor: 'verde',
        currentReservationId: null,
      });
    });
  }

  write(data);
}

seed();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/parking', parkingRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/device', deviceRoutes);

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// Manejador de errores general.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// Revisa cada 5 segundos si alguna reserva superó el minuto de tolerancia.
setInterval(() => {
  try {
    mutate((data) => expireOldReservations(data));
  } catch (e) {
    console.error('Error al expirar reservas:', e);
  }
}, 5000);

app.listen(PORT, () => {
  console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});
