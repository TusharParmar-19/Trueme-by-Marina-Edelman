const express = require("express");
const { z } = require("zod");

const { loadDB, saveDB, addAuditLog } = require("../../utils/db");
const {
  authMiddleware,
  allowRoles
} = require("../../middleware/authMiddleware");

const { USER_ROLES } = require("../users/user.roles");

const router = express.Router();

const LOCATION_TYPES = ["office", "virtual", "client_location"];

const createLocationSchema = z.object({
  name: z.string().min(2).max(120),
  locationType: z.enum(LOCATION_TYPES),
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(30).optional(),
  country: z.string().max(100).optional(),
  timezone: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
  notes: z.string().max(1000).optional(),
  isPublicBookingEnabled: z.boolean().optional()
});

const updateLocationSchema = createLocationSchema.partial();

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

function sanitizeLocation(location) {
  return {
    id: location.id,
    name: location.name,
    slug: location.slug,
    locationType: location.locationType,
    addressLine1: location.addressLine1 || "",
    addressLine2: location.addressLine2 || "",
    city: location.city || "",
    state: location.state || "",
    postalCode: location.postalCode || "",
    country: location.country || "",
    timezone: location.timezone || "America/Los_Angeles",
    phone: location.phone || "",
    notes: location.notes || "",
    isPublicBookingEnabled: location.isPublicBookingEnabled || false,
    status: location.status,
    createdAt: location.createdAt,
    updatedAt: location.updatedAt || null
  };
}

// GET public active locations
router.get("/public", function (req, res) {
  const db = loadDB();

  const locations = db.locations
    .filter(function (location) {
      return (
        location.status === "active" &&
        location.isPublicBookingEnabled === true
      );
    })
    .map(function (location) {
      return sanitizeLocation(location);
    });

  return res.json({
    success: true,
    count: locations.length,
    locations
  });
});

// GET all locations
router.get(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const db = loadDB();

    const locations = db.locations.map(function (location) {
      return sanitizeLocation(location);
    });

    return res.json({
      success: true,
      count: locations.length,
      locations
    });
  }
);

// GET single location
router.get(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const db = loadDB();

    const location = db.locations.find(function (item) {
      return item.id === req.params.id;
    });

    if (!location) {
      return res.status(404).json({
        success: false,
        message: "Location not found"
      });
    }

    return res.json({
      success: true,
      location: sanitizeLocation(location)
    });
  }
);

// CREATE location
router.post(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = createLocationSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: result.error.flatten()
      });
    }

    const db = loadDB();

    const slug = createSlug(result.data.name);

    const duplicate = db.locations.find(function (location) {
      return location.slug === slug;
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: "Location with this name already exists"
      });
    }

    const now = new Date().toISOString();

    const location = {
      id: Date.now().toString(),
      name: result.data.name,
      slug,
      locationType: result.data.locationType,
      addressLine1: result.data.addressLine1 || "",
      addressLine2: result.data.addressLine2 || "",
      city: result.data.city || "",
      state: result.data.state || "",
      postalCode: result.data.postalCode || "",
      country: result.data.country || "USA",
      timezone: result.data.timezone || "America/Los_Angeles",
      phone: result.data.phone || "",
      notes: result.data.notes || "",
      isPublicBookingEnabled: result.data.isPublicBookingEnabled || false,
      status: "active",
      createdAt: now,
      updatedAt: null
    };

    db.locations.push(location);
    saveDB(db);

    addAuditLog(
      "LOCATION_CREATED",
      req.user.email,
      `Created location: ${location.name}`
    );

    return res.status(201).json({
      success: true,
      message: "Location created successfully",
      location: sanitizeLocation(location)
    });
  }
);

// UPDATE location
router.patch(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = updateLocationSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: result.error.flatten()
      });
    }

    const db = loadDB();

    const location = db.locations.find(function (item) {
      return item.id === req.params.id;
    });

    if (!location) {
      return res.status(404).json({
        success: false,
        message: "Location not found"
      });
    }

    if (result.data.name) {
      const newSlug = createSlug(result.data.name);

      const duplicate = db.locations.find(function (item) {
        return item.slug === newSlug && item.id !== location.id;
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: "Another location with this name already exists"
        });
      }

      location.name = result.data.name;
      location.slug = newSlug;
    }

    const allowedFields = [
      "locationType",
      "addressLine1",
      "addressLine2",
      "city",
      "state",
      "postalCode",
      "country",
      "timezone",
      "phone",
      "notes",
      "isPublicBookingEnabled"
    ];

    allowedFields.forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(result.data, field)) {
        location[field] = result.data[field];
      }
    });

    location.updatedAt = new Date().toISOString();

    saveDB(db);

    addAuditLog(
      "LOCATION_UPDATED",
      req.user.email,
      `Updated location: ${location.name}`
    );

    return res.json({
      success: true,
      message: "Location updated successfully",
      location: sanitizeLocation(location)
    });
  }
);

// ACTIVE / INACTIVE / ARCHIVE location
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

    const location = db.locations.find(function (item) {
      return item.id === req.params.id;
    });

    if (!location) {
      return res.status(404).json({
        success: false,
        message: "Location not found"
      });
    }

    location.status = result.data.status;
    location.updatedAt = new Date().toISOString();

    saveDB(db);

    addAuditLog(
      "LOCATION_STATUS_UPDATED",
      req.user.email,
      `Changed ${location.name} status to ${location.status}`
    );

    return res.json({
      success: true,
      message: "Location status updated successfully",
      location: sanitizeLocation(location)
    });
  }
);

// PATCH location public booking visibility
router.patch(
  "/:id/public",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const db = loadDB();

    const location = db.locations.find(function (item) {
      return item.id === req.params.id;
    });

    if (!location) {
      return res.status(404).json({
        success: false,
        message: "Location not found"
      });
    }

    location.isPublicBookingEnabled = Boolean(req.body.isPublicBookingEnabled);
    location.updatedAt = new Date().toISOString();

    saveDB(db);

    return res.json({
      success: true,
      message: location.isPublicBookingEnabled
        ? "Location is now public"
        : "Location is now hidden from clients",
      location
    });
  }
);

// DELETE location
router.delete(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const db = loadDB();

    const locationIndex = db.locations.findIndex(function (item) {
      return item.id === req.params.id;
    });

    if (locationIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Location not found"
      });
    }

    const isUsedInAppointments = (db.appointments || []).some(function (
      appointment
    ) {
      return appointment.locationId === req.params.id;
    });

    const isUsedInWaitlist = (db.waitlist || []).some(function (entry) {
      return entry.locationId === req.params.id;
    });

    const isUsedInTherapistServices = (db.therapistServices || []).some(
      function (assignment) {
        return (assignment.locationIds || []).includes(req.params.id);
      }
    );

    const isUsedInAvailability = (db.therapistAvailability || []).some(function (
      rule
    ) {
      return (rule.locationIds || []).includes(req.params.id);
    });

    if (
      isUsedInAppointments ||
      isUsedInWaitlist ||
      isUsedInTherapistServices ||
      isUsedInAvailability
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This location is already used in appointments, waitlist, therapist assignments, or availability. Archive it instead of deleting."
      });
    }

    const deletedLocation = db.locations.splice(locationIndex, 1)[0];

    saveDB(db);

    return res.json({
      success: true,
      message: "Location deleted successfully",
      location: deletedLocation
    });
  }
);

module.exports = router;