const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const crypto = require("crypto");

const prisma = require("../../config/prisma");
const { loadDB, saveDB } = require("../../utils/db");

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

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
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

async function addPrismaAuditLog(action, performedBy, details) {
  try {
    await prisma.auditLog.create({
      data: {
        id: createId("audit"),
        action,
        performedBy: performedBy || "",
        details: details || ""
      }
    });
  } catch (error) {
    console.error("Prisma audit log failed:", error);
  }
}

function upsertJsonUser(user) {
  try {
    const db = loadDB();

    const existingIndex = db.users.findIndex(function (item) {
      return item.id === user.id;
    });

    const jsonUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      password: user.password,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt
        ? new Date(user.createdAt).toISOString()
        : new Date().toISOString(),
      updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : null
    };

    if (existingIndex >= 0) {
      db.users[existingIndex] = {
        ...db.users[existingIndex],
        ...jsonUser
      };
    } else {
      db.users.push(jsonUser);
    }

    saveDB(db);
  } catch (error) {
    console.error("Temporary db.json user sync failed:", error);
  }
}

function updateJsonUser(id, updates) {
  try {
    const db = loadDB();

    const user = db.users.find(function (item) {
      return item.id === id;
    });

    if (!user) {
      return;
    }

    Object.assign(user, updates, {
      updatedAt: new Date().toISOString()
    });

    saveDB(db);
  } catch (error) {
    console.error("Temporary db.json user update failed:", error);
  }
}

// GET all users
router.get(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const users = await prisma.user.findMany({
        orderBy: {
          createdAt: "desc"
        }
      });

      const sanitizedUsers = users.map(function (user) {
        return sanitizeUser(user);
      });

      return res.json({
        success: true,
        count: sanitizedUsers.length,
        users: sanitizedUsers
      });
    } catch (error) {
      console.error("Get users error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load users"
      });
    }
  }
);

// GET users by role
router.get(
  "/role/:role",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const role = req.params.role;

      if (!ALLOWED_ROLES.includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role"
        });
      }

      const users = await prisma.user.findMany({
        where: {
          role
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      const sanitizedUsers = users.map(function (user) {
        return sanitizeUser(user);
      });

      return res.json({
        success: true,
        count: sanitizedUsers.length,
        users: sanitizedUsers
      });
    } catch (error) {
      console.error("Get users by role error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load users"
      });
    }
  }
);

// CREATE user
router.post(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
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

      const existingUser = await prisma.user.findUnique({
        where: {
          email
        }
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Email already exists"
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = await prisma.user.create({
        data: {
          id: createId("user"),
          name,
          email,
          password: hashedPassword,
          role,
          status: "active"
        }
      });

      // Temporary sync while appointment/availability modules still use db.json
      upsertJsonUser(newUser);

      await addPrismaAuditLog(
        "USER_CREATED",
        req.user.email,
        `Created ${role} account: ${email}`
      );

      return res.status(201).json({
        success: true,
        message: "User created successfully",
        user: sanitizeUser(newUser)
      });
    } catch (error) {
      console.error("Create user error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create user"
      });
    }
  }
);

// UPDATE user basic info
router.patch(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const result = updateUserSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: result.error.flatten()
        });
      }

      const user = await prisma.user.findUnique({
        where: {
          id: req.params.id
        }
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

      const updateData = {};

      if (result.data.email) {
        const newEmail = normalizeEmail(result.data.email);

        const emailAlreadyUsed = await prisma.user.findFirst({
          where: {
            email: newEmail,
            NOT: {
              id: user.id
            }
          }
        });

        if (emailAlreadyUsed) {
          return res.status(400).json({
            success: false,
            message: "Email already exists"
          });
        }

        updateData.email = newEmail;
      }

      if (result.data.name) {
        updateData.name = result.data.name;
      }

      if (result.data.role) {
        updateData.role = result.data.role;
      }

      updateData.updatedAt = new Date();

      const updatedUser = await prisma.user.update({
        where: {
          id: user.id
        },
        data: updateData
      });

      // Temporary sync while other modules still use db.json
      updateJsonUser(updatedUser.id, {
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        status: updatedUser.status
      });

      await addPrismaAuditLog(
        "USER_UPDATED",
        req.user.email,
        `Updated user: ${updatedUser.email}`
      );

      return res.json({
        success: true,
        message: "User updated successfully",
        user: sanitizeUser(updatedUser)
      });
    } catch (error) {
      console.error("Update user error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update user"
      });
    }
  }
);

// BLOCK / ACTIVATE / ARCHIVE user
router.patch(
  "/:id/status",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const result = updateStatusSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid status",
          errors: result.error.flatten()
        });
      }

      const user = await prisma.user.findUnique({
        where: {
          id: req.params.id
        }
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

      const updatedUser = await prisma.user.update({
        where: {
          id: user.id
        },
        data: {
          status: result.data.status,
          updatedAt: new Date()
        }
      });

      // Temporary sync while other modules still use db.json
      updateJsonUser(updatedUser.id, {
        status: updatedUser.status
      });

      await addPrismaAuditLog(
        "USER_STATUS_UPDATED",
        req.user.email,
        `Changed ${updatedUser.email} status to ${updatedUser.status}`
      );

      return res.json({
        success: true,
        message: "User status updated successfully",
        user: sanitizeUser(updatedUser)
      });
    } catch (error) {
      console.error("Update user status error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update user status"
      });
    }
  }
);

module.exports = router;