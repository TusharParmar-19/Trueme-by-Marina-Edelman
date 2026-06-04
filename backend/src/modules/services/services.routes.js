const express = require("express");
const { z } = require("zod");
const crypto = require("crypto");

const prisma = require("../../config/prisma");
const { loadDB, saveDB } = require("../../utils/db");

const {
  authMiddleware,
  allowRoles
} = require("../../middleware/authMiddleware");

const { USER_ROLES } = require("../users/user.roles");

const router = express.Router();

const SERVICE_CATEGORIES = [
  "therapy",
  "consultation",
  "assessment",
  "intensive",
  "other"
];

const APPOINTMENT_TYPES = ["telehealth", "in_person"];

const createServiceSchema = z.object({
  name: z.string().min(2).max(120),
  category: z.enum(SERVICE_CATEGORIES),
  description: z.string().max(2000).optional(),
  durationMinutes: z.number().int().min(10).max(480),
  bufferBeforeMinutes: z.number().int().min(0).max(120).optional(),
  bufferAfterMinutes: z.number().int().min(0).max(120).optional(),
  price: z.number().min(0),
  currency: z.string().min(3).max(3).optional(),
  appointmentTypes: z.array(z.enum(APPOINTMENT_TYPES)).optional(),
  allowedLocations: z.array(z.string().min(1).max(100)).optional(),
  isPublicBookingEnabled: z.boolean().optional(),
  requiresCardOnFile: z.boolean().optional(),
  cancellationPolicy: z.string().max(2000).optional()
});

const updateServiceSchema = createServiceSchema.partial().omit({
  price: true,
  currency: true
});

const updatePriceSchema = z.object({
  price: z.number().min(0),
  currency: z.string().min(3).max(3).optional(),
  reason: z.string().max(500).optional()
});

const updateStatusSchema = z.object({
  status: z.enum(["active", "inactive", "archived"])
});

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function createSlug(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function toIso(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

function sanitizeService(service) {
  return {
    id: service.id,
    name: service.name,
    slug: service.slug,
    category: service.category,
    description: service.description,
    durationMinutes: service.durationMinutes,
    bufferBeforeMinutes: service.bufferBeforeMinutes || 0,
    bufferAfterMinutes: service.bufferAfterMinutes || 0,
    totalBlockedMinutes:
      service.durationMinutes +
      (service.bufferBeforeMinutes || 0) +
      (service.bufferAfterMinutes || 0),
    currentPrice: service.currentPrice,
    currency: service.currency,
    appointmentTypes: service.appointmentTypes || [],
    allowedLocations: service.allowedLocations || [],
    isPublicBookingEnabled: service.isPublicBookingEnabled || false,
    requiresCardOnFile: service.requiresCardOnFile || false,
    cancellationPolicy: service.cancellationPolicy || "",
    status: service.status,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt || null
  };
}

function serviceToJson(service) {
  return {
    id: service.id,
    name: service.name,
    slug: service.slug,
    category: service.category,
    description: service.description || "",
    durationMinutes: service.durationMinutes,
    bufferBeforeMinutes: service.bufferBeforeMinutes || 0,
    bufferAfterMinutes: service.bufferAfterMinutes || 0,
    currentPrice: service.currentPrice,
    currency: service.currency || "USD",
    appointmentTypes: service.appointmentTypes || [],
    allowedLocations: service.allowedLocations || [],
    isPublicBookingEnabled: service.isPublicBookingEnabled || false,
    requiresCardOnFile: service.requiresCardOnFile || false,
    cancellationPolicy: service.cancellationPolicy || "",
    status: service.status || "active",
    priceHistory: service.priceHistory || [],
    createdAt: toIso(service.createdAt) || new Date().toISOString(),
    updatedAt: toIso(service.updatedAt)
  };
}

function upsertJsonService(service) {
  try {
    const db = loadDB();

    if (!db.services) {
      db.services = [];
    }

    const existingIndex = db.services.findIndex(function (item) {
      return item.id === service.id;
    });

    const jsonService = serviceToJson(service);

    if (existingIndex >= 0) {
      db.services[existingIndex] = {
        ...db.services[existingIndex],
        ...jsonService
      };
    } else {
      db.services.push(jsonService);
    }

    saveDB(db);
  } catch (error) {
    console.error("Temporary db.json service sync failed:", error);
  }
}

function deleteJsonService(serviceId) {
  try {
    const db = loadDB();

    if (!db.services) {
      return;
    }

    db.services = db.services.filter(function (service) {
      return service.id !== serviceId;
    });

    saveDB(db);
  } catch (error) {
    console.error("Temporary db.json service delete failed:", error);
  }
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

// GET public active services
router.get("/public", async function (req, res) {
  try {
    const services = await prisma.service.findMany({
      where: {
        status: "active",
        isPublicBookingEnabled: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return res.json({
      success: true,
      count: services.length,
      services: services.map(sanitizeService)
    });
  } catch (error) {
    console.error("Get public services error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load public services"
    });
  }
});

// GET all services
router.get(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const services = await prisma.service.findMany({
        orderBy: {
          createdAt: "desc"
        }
      });

      return res.json({
        success: true,
        count: services.length,
        services: services.map(sanitizeService)
      });
    } catch (error) {
      console.error("Get services error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load services"
      });
    }
  }
);

// GET single service
router.get(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const service = await prisma.service.findUnique({
        where: {
          id: req.params.id
        }
      });

      if (!service) {
        return res.status(404).json({
          success: false,
          message: "Service not found"
        });
      }

      return res.json({
        success: true,
        service: sanitizeService(service),
        priceHistory: service.priceHistory || []
      });
    } catch (error) {
      console.error("Get single service error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load service"
      });
    }
  }
);

// CREATE service
router.post(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const result = createServiceSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: result.error.flatten()
        });
      }

      const slug = createSlug(result.data.name);

      const duplicate = await prisma.service.findFirst({
        where: {
          slug
        }
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: "Service with this name already exists"
        });
      }

      const now = new Date();

      const priceHistory = [
        {
          price: result.data.price,
          currency: result.data.currency || "USD",
          effectiveAt: now.toISOString(),
          changedBy: req.user.email,
          reason: "Initial service price"
        }
      ];

      const service = await prisma.service.create({
        data: {
          id: createId("service"),
          name: result.data.name,
          slug,
          category: result.data.category,
          description: result.data.description || "",
          durationMinutes: result.data.durationMinutes,
          bufferBeforeMinutes: result.data.bufferBeforeMinutes || 0,
          bufferAfterMinutes: result.data.bufferAfterMinutes || 0,
          currentPrice: result.data.price,
          currency: result.data.currency || "USD",
          appointmentTypes: result.data.appointmentTypes || [],
          allowedLocations: result.data.allowedLocations || [],
          isPublicBookingEnabled: result.data.isPublicBookingEnabled || false,
          requiresCardOnFile: result.data.requiresCardOnFile || false,
          cancellationPolicy: result.data.cancellationPolicy || "",
          status: "active",
          priceHistory
        }
      });

      // Temporary sync while remaining scheduling modules still use db.json
      upsertJsonService(service);

      await addPrismaAuditLog(
        "SERVICE_CREATED",
        req.user.email,
        `Created service: ${service.name}`
      );

      return res.status(201).json({
        success: true,
        message: "Service created successfully",
        service: sanitizeService(service)
      });
    } catch (error) {
      console.error("Create service error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create service"
      });
    }
  }
);

// UPDATE service details, not price
router.patch(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const result = updateServiceSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: result.error.flatten()
        });
      }

      const service = await prisma.service.findUnique({
        where: {
          id: req.params.id
        }
      });

      if (!service) {
        return res.status(404).json({
          success: false,
          message: "Service not found"
        });
      }

      const updateData = {};

      if (result.data.name) {
        const newSlug = createSlug(result.data.name);

        const duplicate = await prisma.service.findFirst({
          where: {
            slug: newSlug,
            NOT: {
              id: service.id
            }
          }
        });

        if (duplicate) {
          return res.status(400).json({
            success: false,
            message: "Another service with this name already exists"
          });
        }

        updateData.name = result.data.name;
        updateData.slug = newSlug;
      }

      const allowedFields = [
        "category",
        "description",
        "durationMinutes",
        "bufferBeforeMinutes",
        "bufferAfterMinutes",
        "appointmentTypes",
        "allowedLocations",
        "isPublicBookingEnabled",
        "requiresCardOnFile",
        "cancellationPolicy"
      ];

      allowedFields.forEach(function (field) {
        if (Object.prototype.hasOwnProperty.call(result.data, field)) {
          updateData[field] = result.data[field];
        }
      });

      updateData.updatedAt = new Date();

      const updatedService = await prisma.service.update({
        where: {
          id: service.id
        },
        data: updateData
      });

      // Temporary sync while remaining scheduling modules still use db.json
      upsertJsonService(updatedService);

      await addPrismaAuditLog(
        "SERVICE_UPDATED",
        req.user.email,
        `Updated service: ${updatedService.name}`
      );

      return res.json({
        success: true,
        message: "Service updated successfully",
        service: sanitizeService(updatedService)
      });
    } catch (error) {
      console.error("Update service error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update service"
      });
    }
  }
);

// UPDATE service price
router.patch(
  "/:id/price",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const result = updatePriceSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid price input",
          errors: result.error.flatten()
        });
      }

      const service = await prisma.service.findUnique({
        where: {
          id: req.params.id
        }
      });

      if (!service) {
        return res.status(404).json({
          success: false,
          message: "Service not found"
        });
      }

      const oldPrice = service.currentPrice;
      const oldCurrency = service.currency;

      const priceHistory = Array.isArray(service.priceHistory)
        ? [...service.priceHistory]
        : [];

      priceHistory.push({
        oldPrice,
        oldCurrency,
        price: result.data.price,
        currency: result.data.currency || service.currency || "USD",
        effectiveAt: new Date().toISOString(),
        changedBy: req.user.email,
        reason: result.data.reason || "Price updated"
      });

      const updatedService = await prisma.service.update({
        where: {
          id: service.id
        },
        data: {
          currentPrice: result.data.price,
          currency: result.data.currency || service.currency || "USD",
          priceHistory,
          updatedAt: new Date()
        }
      });

      // Temporary sync while remaining scheduling modules still use db.json
      upsertJsonService(updatedService);

      await addPrismaAuditLog(
        "SERVICE_PRICE_UPDATED",
        req.user.email,
        `Changed price for ${updatedService.name} from ${oldPrice} to ${updatedService.currentPrice}`
      );

      return res.json({
        success: true,
        message: "Service price updated successfully",
        service: sanitizeService(updatedService),
        priceHistory: updatedService.priceHistory || []
      });
    } catch (error) {
      console.error("Update service price error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update service price"
      });
    }
  }
);

// ACTIVE / INACTIVE / ARCHIVE service
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

      const service = await prisma.service.findUnique({
        where: {
          id: req.params.id
        }
      });

      if (!service) {
        return res.status(404).json({
          success: false,
          message: "Service not found"
        });
      }

      const updatedService = await prisma.service.update({
        where: {
          id: service.id
        },
        data: {
          status: result.data.status,
          updatedAt: new Date()
        }
      });

      // Temporary sync while remaining scheduling modules still use db.json
      upsertJsonService(updatedService);

      await addPrismaAuditLog(
        "SERVICE_STATUS_UPDATED",
        req.user.email,
        `Changed ${updatedService.name} status to ${updatedService.status}`
      );

      return res.json({
        success: true,
        message: "Service status updated successfully",
        service: sanitizeService(updatedService)
      });
    } catch (error) {
      console.error("Update service status error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update service status"
      });
    }
  }
);

// PATCH service public booking visibility
router.patch(
  "/:id/public",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const service = await prisma.service.findUnique({
        where: {
          id: req.params.id
        }
      });

      if (!service) {
        return res.status(404).json({
          success: false,
          message: "Service not found"
        });
      }

      const updatedService = await prisma.service.update({
        where: {
          id: service.id
        },
        data: {
          isPublicBookingEnabled: Boolean(req.body.isPublicBookingEnabled),
          updatedAt: new Date()
        }
      });

      // Temporary sync while remaining scheduling modules still use db.json
      upsertJsonService(updatedService);

      return res.json({
        success: true,
        message: updatedService.isPublicBookingEnabled
          ? "Service is now public"
          : "Service is now hidden from clients",
        service: sanitizeService(updatedService)
      });
    } catch (error) {
      console.error("Update service public visibility error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update service visibility"
      });
    }
  }
);

// DELETE service
router.delete(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const service = await prisma.service.findUnique({
        where: {
          id: req.params.id
        }
      });

      if (!service) {
        return res.status(404).json({
          success: false,
          message: "Service not found"
        });
      }

      const [
        appointmentCount,
        waitlistCount,
        therapistServiceCount
      ] = await Promise.all([
        prisma.appointment.count({
          where: {
            serviceId: service.id
          }
        }),
        prisma.waitlist.count({
          where: {
            serviceId: service.id
          }
        }),
        prisma.therapistService.count({
          where: {
            serviceId: service.id
          }
        })
      ]);

      if (
        appointmentCount > 0 ||
        waitlistCount > 0 ||
        therapistServiceCount > 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This service is already used in appointments, waitlist, or therapist assignments. Archive it instead of deleting."
        });
      }

      const deletedService = await prisma.service.delete({
        where: {
          id: service.id
        }
      });

      // Temporary sync while remaining scheduling modules still use db.json
      deleteJsonService(deletedService.id);

      await addPrismaAuditLog(
        "SERVICE_DELETED",
        req.user.email,
        `Deleted service: ${deletedService.name}`
      );

      return res.json({
        success: true,
        message: "Service deleted successfully",
        service: sanitizeService(deletedService)
      });
    } catch (error) {
      console.error("Delete service error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to delete service"
      });
    }
  }
);

module.exports = router;