const prisma = require("../../config/prisma");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const crypto = require("crypto");

const { authMiddleware } = require("../../middleware/authMiddleware");
const { USER_ROLES } = require("../users/user.roles");

const router = express.Router();

const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "1d",
    }
  );
}

async function addPrismaAuditLog(action, performedBy, details) {
  try {
    await prisma.auditLog.create({
      data: {
        id: createId("audit"),
        action,
        performedBy: performedBy || "",
        details: details || "",
      },
    });
  } catch (error) {
    console.error("Prisma audit log failed:", error);
  }
}

// Client registration only
router.post("/register", async function (req, res) {
  try {
    const result = registerSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: result.error.flatten(),
      });
    }

    const { name, password } = result.data;
    const email = normalizeEmail(result.data.email);

    const existingUser = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        id: createId("user"),
        name,
        email,
        password: hashedPassword,
        role: USER_ROLES.CLIENT,
        status: "active",
      },
    });

    await addPrismaAuditLog(
      "CLIENT_REGISTERED",
      email,
      "New client account created"
    );

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
        status: user.status,
      },
    });
  } catch (error) {
    console.error("Register error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
});

router.post("/login", async function (req, res) {
  try {
    const result = loginSchema.safeParse(req.body);

    if (!result.success) {

      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: result.error.flatten(),
      });
    }

    const email = normalizeEmail(result.data.email);
    const password = result.data.password;

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "This account is not active",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

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
        status: user.status,
      },
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed",
      error: error.message,
    });
  }
});

router.get("/me", authMiddleware, function (req, res) {
  return res.json({
    success: true,
    user: req.user,
  });
});

module.exports = router;