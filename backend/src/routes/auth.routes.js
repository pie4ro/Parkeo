const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { mutate, read } = require('../db/db');
const { generateRfidUid } = require('../utils/ids');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

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

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { name, email, password, securityQuestion, securityAnswer } = req.body;

  if (!name || !email || !password || !securityQuestion || !securityAnswer) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios, incluida la pregunta de seguridad.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const result = mutate((data) => {
    const exists = data.users.find((u) => u.email === normalizedEmail);
    if (exists) return { error: 'Ya existe una cuenta registrada con ese correo.' };

    let rfidUid;
    do {
      rfidUid = generateRfidUid();
    } while (data.users.some((u) => u.rfidUid === rfidUid));

    const user = {
      id: data.meta.nextUserId++,
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: bcrypt.hashSync(password, 10),
      role: 'user',
      rfidUid,
      securityQuestion: securityQuestion.trim(),
      securityAnswerHash: bcrypt.hashSync(securityAnswer.trim().toLowerCase(), 10),
      createdAt: new Date().toISOString(),
    };
    data.users.push(user);
    return { user };
  });

  if (result.error) return res.status(409).json({ error: result.error });

  const token = jwt.sign(
    { id: result.user.id, email: result.user.email, role: result.user.role, name: result.user.name },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.status(201).json({ token, user: publicUser(result.user) });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
  }
  const data = read();
  const user = data.users.find((u) => u.email === email.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
  res.json({ token, user: publicUser(user) });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const data = read();
  const user = data.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json({ user: publicUser(user) });
});

// POST /api/auth/change-password  (usuario ya autenticado)
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Debes indicar la contraseña actual y la nueva.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }

  const result = mutate((data) => {
    const user = data.users.find((u) => u.id === req.user.id);
    if (!user) return { error: 'Usuario no encontrado.' };
    if (!bcrypt.compareSync(currentPassword, user.passwordHash)) {
      return { error: 'La contraseña actual no es correcta.' };
    }
    user.passwordHash = bcrypt.hashSync(newPassword, 10);
    return { ok: true };
  });

  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ message: 'Contraseña actualizada correctamente.' });
});

// POST /api/auth/forgot-password/question  -> obtiene la pregunta de seguridad
router.post('/forgot-password/question', (req, res) => {
  const { email } = req.body;
  const data = read();
  const user = data.users.find((u) => u.email === (email || '').trim().toLowerCase());
  if (!user) return res.status(404).json({ error: 'No existe una cuenta con ese correo.' });
  res.json({ securityQuestion: user.securityQuestion });
});

// POST /api/auth/forgot-password/reset -> valida respuesta y cambia contraseña
router.post('/forgot-password/reset', (req, res) => {
  const { email, securityAnswer, newPassword } = req.body;
  if (!email || !securityAnswer || !newPassword) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }

  const result = mutate((data) => {
    const user = data.users.find((u) => u.email === email.trim().toLowerCase());
    if (!user) return { error: 'No existe una cuenta con ese correo.' };
    if (!bcrypt.compareSync(securityAnswer.trim().toLowerCase(), user.securityAnswerHash)) {
      return { error: 'La respuesta de seguridad no es correcta.' };
    }
    user.passwordHash = bcrypt.hashSync(newPassword, 10);
    return { ok: true };
  });

  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ message: 'Contraseña restablecida correctamente. Ya puedes iniciar sesión.' });
});

module.exports = router;
