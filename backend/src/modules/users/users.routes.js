const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");

const { loadDB, saveDB, addAuditLog } = require("../../utils/db");
const {
  authMiddleware,
  allowRoles
} = require("../../middleware/authMiddleware");

const { USER_ROLES, ALLOWED_ROLES } = require("./user.roles");

const router = express.Router();

const createUserSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  role: z.enum(ALLOWED_ROLES)
});

const updateUserSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  email: z.string().email().max(254).optional(),
  role: z.enum(ALLOWED_ROLES).optional()
});

const updateStatusSchema = z.object({
  status: z.enum(["active", "blocked", "archived"])
});

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt || null
  };
}

// GET all users
router.get(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const db = loadDB();

    const users = db.users.map(function (user) {
      return sanitizeUser(user);
    });

    return res.json({
      success: true,
      count: users.length,
      users
    });
  }
);

// GET users by role
router.get(
  "/role/:role",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const role = req.params.role;

    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role"
      });
    }

    const db = loadDB();

    const users = db.users
      .filter(function (user) {
        return user.role === role;
      })
      .map(function (user) {
        return sanitizeUser(user);
      });

    return res.json({
      success: true,
      count: users.length,
      users
    });
  }
);

// CREATE user
router.post(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    const result = createUserSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: result.error.flatten()
      });
    }

    const { name, password, role } = result.data;
    const email = normalizeEmail(result.data.email);

    // Office manager should not create admin or another office manager
    if (
      req.user.role === USER_ROLES.OFFICE_MANAGER &&
      [USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER].includes(role)
    ) {
      return res.status(403).json({
        success: false,
        message: "Office manager cannot create admin or office manager users"
      });
    }

    const db = loadDB();

    const existingUser = db.users.find(function (user) {
      return user.email === email;
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      id: Date.now().toString(),
      name,
      email,
      password: hashedPassword,
      role,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: null
    };

    db.users.push(newUser);
    saveDB(db);

    addAuditLog(
      "USER_CREATED",
      req.user.email,
      `Created ${role} account: ${email}`
    );

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      user: sanitizeUser(newUser)
    });
  }
);

// UPDATE user basic info
router.patch(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = updateUserSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: result.error.flatten()
      });
    }

    const db = loadDB();

    const user = db.users.find(function (item) {
      return item.id === req.params.id;
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Office manager cannot edit admin or office manager
    if (
      req.user.role === USER_ROLES.OFFICE_MANAGER &&
      [USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER].includes(user.role)
    ) {
      return res.status(403).json({
        success: false,
        message: "Office manager cannot edit admin or office manager users"
      });
    }

    // Office manager cannot change role to admin or office manager
    if (
      req.user.role === USER_ROLES.OFFICE_MANAGER &&
      result.data.role &&
      [USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER].includes(result.data.role)
    ) {
      return res.status(403).json({
        success: false,
        message: "Office manager cannot assign admin or office manager role"
      });
    }

    if (result.data.email) {
      const newEmail = normalizeEmail(result.data.email);

      const emailAlreadyUsed = db.users.find(function (item) {
        return item.email === newEmail && item.id !== user.id;
      });

      if (emailAlreadyUsed) {
        return res.status(400).json({
          success: false,
          message: "Email already exists"
        });
      }

      user.email = newEmail;
    }

    if (result.data.name) {
      user.name = result.data.name;
    }

    if (result.data.role) {
      user.role = result.data.role;
    }

    user.updatedAt = new Date().toISOString();

    saveDB(db);

    addAuditLog(
      "USER_UPDATED",
      req.user.email,
      `Updated user: ${user.email}`
    );

    return res.json({
      success: true,
      message: "User updated successfully",
      user: sanitizeUser(user)
    });
  }
);

// BLOCK / ACTIVATE / ARCHIVE user
router.patch(
  "/:id/status",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = updateStatusSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
        errors: result.error.flatten()
      });
    }

    const db = loadDB();

    const user = db.users.find(function (item) {
      return item.id === req.params.id;
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Do not let anyone block/archive themselves
    if (user.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "You cannot change your own status"
      });
    }

    // Office manager cannot block/archive admin or office manager
    if (
      req.user.role === USER_ROLES.OFFICE_MANAGER &&
      [USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER].includes(user.role)
    ) {
      return res.status(403).json({
        success: false,
        message: "Office manager cannot change admin or office manager status"
      });
    }

    user.status = result.data.status;
    user.updatedAt = new Date().toISOString();

    saveDB(db);

    addAuditLog(
      "USER_STATUS_UPDATED",
      req.user.email,
      `Changed ${user.email} status to ${user.status}`
    );

    return res.json({
      success: true,
      message: "User status updated successfully",
      user: sanitizeUser(user)
    });
  }
);

module.exports = router;