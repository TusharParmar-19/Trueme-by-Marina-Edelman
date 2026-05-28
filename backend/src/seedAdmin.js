require("dotenv").config();

const bcrypt = require("bcryptjs");
const { loadDB, saveDB } = require("./utils/db");
const { USER_ROLES } = require("./modules/users/user.roles");

async function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME || "Admin";

  if (!adminEmail || !adminPassword) {
    console.error("ADMIN_EMAIL and ADMIN_PASSWORD are required in .env");
    process.exit(1);
  }

  if (adminPassword.length < 8) {
    console.error("ADMIN_PASSWORD must be at least 8 characters");
    process.exit(1);
  }

  const db = loadDB();

  const existingAdmin = db.users.find(function (user) {
    return user.email === adminEmail.toLowerCase();
  });

  if (existingAdmin) {
    console.log("Admin already exists:", adminEmail);
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const adminUser = {
    id: Date.now().toString(),
    name: adminName,
    email: adminEmail.toLowerCase(),
    password: hashedPassword,
    role: USER_ROLES.ADMIN,
    status: "active",
    createdAt: new Date().toISOString()
  };

  db.users.push(adminUser);
  saveDB(db);

  console.log("Admin created successfully:", adminEmail);
}

seedAdmin();