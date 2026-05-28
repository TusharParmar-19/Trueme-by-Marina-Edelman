const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");

const { loadDB, saveDB, addAuditLog } = require("../../utils/db");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { USER_ROLES } = require("../users/user.roles");

const router = express.Router();

const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "1d"
    }
  );
}

// Client registration only
router.post("/register", async function (req, res) {
  const result = registerSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid input",
      errors: result.error.flatten()
    });
  }

  const { name, password } = result.data;
  const email = normalizeEmail(result.data.email);

  const db = loadDB();

  const existingUser = db.users.find(function (user) {
    return user.email === email;
  });

  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: "Email already registered"
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = {
    id: Date.now().toString(),
    name,
    email,
    password: hashedPassword,
    role: USER_ROLES.CLIENT,
    status: "active",
    createdAt: new Date().toISOString()
  };

  db.users.push(user);
  saveDB(db);

  addAuditLog("CLIENT_REGISTERED", email, "New client account created");

  const token = createToken(user);

  return res.status(201).json({
    success: true,
    message: "Account created successfully",
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status
    }
  });
});

router.post("/login", async function (req, res) {
  const result = loginSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid input",
      errors: result.error.flatten()
    });
  }

  const email = normalizeEmail(result.data.email);
  const password = result.data.password;

  const db = loadDB();

  const user = db.users.find(function (item) {
    return item.email === email;
  });

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Invalid email or password"
    });
  }

  if (user.status !== "active") {
    return res.status(403).json({
      success: false,
      message: "This account is not active"
    });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      message: "Invalid email or password"
    });
  }

  addAuditLog("LOGIN", email, `${user.role} logged in`);

  const token = createToken(user);

  return res.json({
    success: true,
    message: "Login successful",
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status
    }
  });
});

router.get("/me", authMiddleware, function (req, res) {
  return res.json({
    success: true,
    user: req.user
  });
});

module.exports = router;