# Smart Parking · Simulación IoT + Aplicación Web

Sistema de gestión de un estacionamiento inteligente simulado con dispositivos IoT
(ESP32, sensores, LEDs, tarjetas RFID) y una aplicación web para reservar y
administrar los espacios.

# Este proyecto està supervisado y visualizado por el equipo de IoT
- Zumaeta Rodriguez, Jeremy
- Valeriano Benitez, Juan
- Ramirez Castillo, Lizeth

## Estructura del proyecto

```
parking-system/
├── backend/     API REST en Node.js + Express (JWT, JSON como base de datos)
└── frontend/    Aplicación web en HTML + CSS + JavaScript (sin frameworks)
```

El backend y el frontend están completamente separados: el frontend solo consume
la API por HTTP, así que cada uno puede desplegarse de forma independiente.

## ¿Cómo simula el hardware IoT?

El backend expone dos endpoints que representan lo que el ESP32 enviaría en la
vida real:

- `POST /api/device/scan` — simula la lectura de la tarjeta RFID en la entrada.
- `POST /api/device/exit` — simula el sensor de presencia detectando la salida.

Como no siempre se cuenta con el hardware conectado, la carpeta `frontend`
incluye `simulator.html`, una pantalla para disparar estos eventos manualmente
y ver cómo cambian los LEDs (colores) del estacionamiento en tiempo real.

Cuando conectes el ESP32 real, solo tiene que hacer peticiones HTTP `POST` a
esas mismas rutas con el UID leído por el módulo RFID-RC522 y el número de
plaza correspondiente al sensor que se activó.

## Requisitos funcionales cubiertos

- Login y registro de usuarios (`login.html`, `register.html`).
- Recuperación de contraseña por pregunta de seguridad (`forgot-password.html`).
- Visualización del mapa completo del parking con estado en tiempo real
  (libre / ocupado / reservado) en `dashboard.html`.
- Selección de estacionamiento libre para reservarlo.
- Visualización de la reserva vigente con cuenta regresiva de vencimiento.
- Historial de reservas del usuario.
- Cambio de contraseña desde el panel de usuario.
- Panel de administrador (`admin.html`) para editar/eliminar usuarios,
  regenerar tarjetas RFID, restablecer contraseñas y gestionar estacionamientos
  (crear, forzar estado, eliminar), además del historial global de reservas.

## Requisitos no funcionales cubiertos

- Identificador único (RFID simulado) generado automáticamente al registrarse
  y vinculado al usuario.
- Usuario administrador creado automáticamente al iniciar el backend por
  primera vez (ver credenciales abajo).
- Tolerancia de 1 minuto: si nadie confirma el ingreso con la tarjeta RFID en
  ese lapso, la reserva expira sola y el LED vuelve a verde. Esto corre tanto
  al consultar datos como en un job en segundo plano cada 5 segundos.
- Paleta de colores tenue y consistente (verde/rojo/ámbar sutiles) pensada
  para que el estado del parking se lea de un vistazo.
- Dos vistas separadas: `dashboard.html` (usuario) y `admin.html` (admin).

## 1. Ejecutarlo en tu computadora

### Backend

```bash
cd backend
npm install
cp .env.example .env      # ajusta JWT_SECRET, ADMIN_EMAIL y ADMIN_PASSWORD si quieres
npm start
```

El servidor queda escuchando en `http://localhost:4000`. Al arrancar por
primera vez crea automáticamente:

- Un usuario **administrador**: `admin@parking.com` / `Admin123`
  (o los valores que hayas puesto en `.env`).
- Seis estacionamientos de ejemplo: A1, A2, A3, B1, B2, B3.

Los datos se guardan en `backend/data/db.json` (se crea solo). Bórralo si
quieres reiniciar el sistema desde cero.

### Frontend

El frontend es HTML/CSS/JS puro, no necesita build ni instalación. Solo
requiere que se sirva por HTTP (no abrir el archivo directamente con
`file://`, porque el navegador bloquea las peticiones a la API). La forma más
simple:

```bash
cd frontend
python3 -m http.server 8080
```

Luego abre `http://localhost:8080/login.html`.

Si tu backend corre en otra URL (por ejemplo cuando lo despliegues), edita la
constante al inicio de `frontend/js/api.js`:

```js
const API_BASE = window.PARKING_API_BASE || 'http://localhost:4000/api';
```

o agrega antes de cargar `api.js` en cada HTML:

```html
<script>window.PARKING_API_BASE = 'https://tu-backend-desplegado.com/api';</script>
```

## 2. Despliegue en producción

Puedes usar cualquier proveedor que corra Node.js para el backend y cualquier
hosting estático para el frontend. Una combinación gratuita y sencilla:

### Backend → Render (o Railway)

1. Sube la carpeta `backend/` a un repositorio de GitHub.
2. En [Render](https://render.com) crea un **Web Service** nuevo apuntando a
   ese repositorio.
3. Configura:
   - Build command: `npm install`
   - Start command: `npm start`
4. En "Environment Variables" agrega `JWT_SECRET`, `ADMIN_EMAIL`,
   `ADMIN_PASSWORD` (los mismos nombres del `.env.example`).
5. Al desplegar, Render te da una URL pública, por ejemplo
   `https://parking-backend.onrender.com`.

> Nota: como este proyecto usa un archivo JSON como base de datos para
> mantenerlo simple, en planes gratuitos con disco efímero los datos se
> reinician con cada redeploy. Para producción real, lo ideal es migrar
> `backend/src/db/db.js` a una base de datos administrada (PostgreSQL, MySQL,
> MongoDB Atlas, etc.), manteniendo la misma interfaz de funciones
> (`read`, `write`, `mutate`) para no tocar el resto del código.

### Frontend → Netlify, Vercel o GitHub Pages

1. Sube la carpeta `frontend/` a un repositorio (puede ser el mismo, en una
   subcarpeta).
2. En [Netlify](https://netlify.com): "Add new site" → "Import from Git" →
   selecciona el repositorio y define `frontend` como directorio publicado
   (no requiere build command).
3. Antes de desplegar, añade en cada HTML (o en un `config.js` incluido antes
   de `api.js`) la URL real del backend:
   ```html
   <script>window.PARKING_API_BASE = 'https://parking-backend.onrender.com/api';</script>
   <script src="js/api.js"></script>
   ```
4. Netlify te da una URL pública, por ejemplo
   `https://smart-parking.netlify.app`.

### CORS

El backend ya tiene `cors()` habilitado para todos los orígenes, así que no
necesitas configurar nada adicional para que el frontend desplegado hable con
el backend desplegado.

### ESP32 real

Cuando conectes el hardware físico, el firmware del ESP32 solo necesita hacer
peticiones HTTP (con la librería `HTTPClient.h` de Arduino) a:

```
POST https://tu-backend.onrender.com/api/device/scan
Content-Type: application/json
{ "rfidUid": "RFID-XXXXXXXXXX", "spotId": 1 }
```

```
POST https://tu-backend.onrender.com/api/device/exit
Content-Type: application/json
{ "spotId": 1 }
```

El `rfidUid` es el que el sistema genera automáticamente para cada usuario al
registrarse (visible en su panel, sección "Mi tarjeta RFID", y en el panel de
administrador).

## Credenciales de prueba

| Rol   | Correo             | Contraseña |
|-------|---------------------|------------|
| Admin | admin@parking.com   | Admin123   |

Registra tu propio usuario desde `register.html` para probar el flujo
completo de reserva.
