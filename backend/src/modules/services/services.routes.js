const express = require("express");
const { z } = require("zod");

const { loadDB, saveDB, addAuditLog } = require("../../utils/db");
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

function createSlug(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
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

// GET public active services
router.get("/public", function (req, res) {
  const db = loadDB();

  const services = db.services
    .filter(function (service) {
      return (
        service.status === "active" &&
        service.isPublicBookingEnabled === true
      );
    })
    .map(function (service) {
      return sanitizeService(service);
    });

  return res.json({
    success: true,
    count: services.length,
    services
  });
});

// GET all services
router.get(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const db = loadDB();

    const services = db.services.map(function (service) {
      return sanitizeService(service);
    });

    return res.json({
      success: true,
      count: services.length,
      services
    });
  }
);

// GET single service
router.get(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const db = loadDB();

    const service = db.services.find(function (item) {
      return item.id === req.params.id;
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
  }
);

// CREATE service
router.post(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = createServiceSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: result.error.flatten()
      });
    }

    const db = loadDB();

    const slug = createSlug(result.data.name);

    const duplicate = db.services.find(function (service) {
      return service.slug === slug;
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: "Service with this name already exists"
      });
    }

    const now = new Date().toISOString();

    const service = {
      id: Date.now().toString(),
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
      priceHistory: [
        {
          price: result.data.price,
          currency: result.data.currency || "USD",
          effectiveAt: now,
          changedBy: req.user.email,
          reason: "Initial service price"
        }
      ],
      createdAt: now,
      updatedAt: null
    };

    db.services.push(service);
    saveDB(db);

    addAuditLog(
      "SERVICE_CREATED",
      req.user.email,
      `Created service: ${service.name}`
    );

    return res.status(201).json({
      success: true,
      message: "Service created successfully",
      service: sanitizeService(service)
    });
  }
);

// UPDATE service details, not price
router.patch(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = updateServiceSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: result.error.flatten()
      });
    }

    const db = loadDB();

    const service = db.services.find(function (item) {
      return item.id === req.params.id;
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found"
      });
    }

    if (result.data.name) {
      const newSlug = createSlug(result.data.name);

      const duplicate = db.services.find(function (item) {
        return item.slug === newSlug && item.id !== service.id;
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: "Another service with this name already exists"
        });
      }

      service.name = result.data.name;
      service.slug = newSlug;
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
        service[field] = result.data[field];
      }
    });

    service.updatedAt = new Date().toISOString();

    saveDB(db);

    addAuditLog(
      "SERVICE_UPDATED",
      req.user.email,
      `Updated service: ${service.name}`
    );

    return res.json({
      success: true,
      message: "Service updated successfully",
      service: sanitizeService(service)
    });
  }
);

// UPDATE service price
router.patch(
  "/:id/price",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = updatePriceSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid price input",
        errors: result.error.flatten()
      });
    }

    const db = loadDB();

    const service = db.services.find(function (item) {
      return item.id === req.params.id;
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found"
      });
    }

    const oldPrice = service.currentPrice;
    const oldCurrency = service.currency;

    service.currentPrice = result.data.price;
    service.currency = result.data.currency || service.currency || "USD";
    service.updatedAt = new Date().toISOString();

    if (!service.priceHistory) service.priceHistory = [];

    service.priceHistory.push({
      oldPrice,
      oldCurrency,
      price: service.currentPrice,
      currency: service.currency,
      effectiveAt: new Date().toISOString(),
      changedBy: req.user.email,
      reason: result.data.reason || "Price updated"
    });

    saveDB(db);

    addAuditLog(
      "SERVICE_PRICE_UPDATED",
      req.user.email,
      `Changed price for ${service.name} from ${oldPrice} to ${service.currentPrice}`
    );

    return res.json({
      success: true,
      message: "Service price updated successfully",
      service: sanitizeService(service),
      priceHistory: service.priceHistory
    });
  }
);

// ACTIVE / INACTIVE / ARCHIVE service
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

    const service = db.services.find(function (item) {
      return item.id === req.params.id;
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found"
      });
    }

    service.status = result.data.status;
    service.updatedAt = new Date().toISOString();

    saveDB(db);

    addAuditLog(
      "SERVICE_STATUS_UPDATED",
      req.user.email,
      `Changed ${service.name} status to ${service.status}`
    );

    return res.json({
      success: true,
      message: "Service status updated successfully",
      service: sanitizeService(service)
    });
  }
);

module.exports = router;