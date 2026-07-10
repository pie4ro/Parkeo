// Ajusta esta URL cuando despliegues el backend (ver README para producción).
const API_BASE = window.PARKING_API_BASE || 'https://iot-95oj.onrender.com/api';

function getToken() {
  return localStorage.getItem('parking_token');
}
function setToken(token) {
  localStorage.setItem('parking_token', token);
}
function clearSession() {
  localStorage.removeItem('parking_token');
  localStorage.removeItem('parking_user');
}
function getUser() {
  const raw = localStorage.getItem('parking_user');
  return raw ? JSON.parse(raw) : null;
}
function setUser(user) {
  localStorage.setItem('parking_user', JSON.stringify(user));
}

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
  }
  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = {};
  try { data = await res.json(); } catch (e) { /* respuesta vacía */ }

  if (!res.ok) {
    if (res.status === 401 && auth) {
      clearSession();
      window.location.href = 'login.html';
    }
    throw new Error(data.error || 'Ocurrió un error inesperado.');
  }
  return data;
}

function requireSession(requiredRole) {
  const token = getToken();
  const user = getUser();
  if (!token || !user) {
    window.location.href = 'login.html';
    return null;
  }
  if (requiredRole && user.role !== requiredRole) {
    window.location.href = user.role === 'admin' ? 'admin.html' : 'dashboard.html';
    return null;
  }
  return user;
}

function logout() {
  clearSession();
  window.location.href = 'login.html';
}

function showAlert(container, message, type = 'error') {
  container.innerHTML = `<div class="alert alert-${type}">${escapeHtml(message)}</div>`;
  container.classList.remove('hidden');
}
function hideAlert(container) {
  container.classList.add('hidden');
  container.innerHTML = '';
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function formatDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
}
