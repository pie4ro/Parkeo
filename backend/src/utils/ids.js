const crypto = require('crypto');

// Genera un identificador único hexadecimal para vincular con una tarjeta RFID simulada.
function generateRfidUid() {
  return 'RFID-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

function generateToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = { generateRfidUid, generateToken };
