const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'db.json');

function defaultData() {
  return {
    users: [],
    spots: [],
    reservations: [],
    meta: { nextUserId: 1, nextSpotId: 1, nextReservationId: 1 },
  };
}

function ensureFile() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultData(), null, 2));
  }
}

function read() {
  ensureFile();
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    return defaultData();
  }
}

function write(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Simple synchronous "transaction" helper: read, mutate, write.
function mutate(fn) {
  const data = read();
  const result = fn(data);
  write(data);
  return result;
}

module.exports = { read, write, mutate };
