const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "../data/db.json");

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    const initialData = {
      users: [],
      therapists: [],
      services: [],
      locations: [],
      therapistAvailability: [],
      therapistTimeOff: [],
      therapistServices: [],
      appointments: [],
      waitlist: [],
      auditLogs: []
    };

    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
    return initialData;
  }

  const data = fs.readFileSync(DB_PATH, "utf8");
  const db = JSON.parse(data);

  if (!db.users) db.users = [];
  if (!db.therapists) db.therapists = [];
  if (!db.services) db.services = [];
  if (!db.locations) db.locations = [];
  if (!db.therapistAvailability) db.therapistAvailability = [];
  if (!db.therapistTimeOff) db.therapistTimeOff = [];
  if (!db.therapistServices) db.therapistServices = [];
  if (!db.appointments) db.appointments = [];
  if (!db.waitlist) db.waitlist = [];
  if (!db.auditLogs) db.auditLogs = [];

  return db;
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function addAuditLog(action, performedBy, details) {
  const db = loadDB();

  db.auditLogs.push({
    id: Date.now().toString(),
    action,
    performedBy,
    details,
    createdAt: new Date().toISOString()
  });

  saveDB(db);
}

module.exports = {
  loadDB,
  saveDB,
  addAuditLog
};