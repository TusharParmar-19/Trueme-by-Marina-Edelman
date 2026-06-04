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

function locationToJson(location) {
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
    country: location.country || "USA",
    timezone: location.timezone || "America/Los_Angeles",
    phone: location.phone || "",
    notes: location.notes || "",
    isPublicBookingEnabled: location.isPublicBookingEnabled || false,
    status: location.status || "active",
    createdAt: toIso(location.createdAt) || new Date().toISOString(),
    updatedAt: toIso(location.updatedAt)
  };
}

function upsertJsonLocation(location) {
  try {
    const db = loadDB();

    if (!db.locations) {
      db.locations = [];
    }

    const existingIndex = db.locations.findIndex(function (item) {
      return item.id === location.id;
    });

    const jsonLocation = locationToJson(location);

    if (existingIndex >= 0) {
      db.locations[existingIndex] = {
        ...db.locations[existingIndex],
        ...jsonLocation
      };
    } else {
      db.locations.push(jsonLocation);
    }

    saveDB(db);
  } catch (error) {
    console.error("Temporary db.json location sync failed:", error);
  }
}

function deleteJsonLocation(locationId) {
  try {
    const db = loadDB();

    if (!db.locations) {
      return;
    }

    db.locations = db.locations.filter(function (location) {
      return location.id !== locationId;
    });

    saveDB(db);
  } catch (error) {
    console.error("Temporary db.json location delete failed:", error);
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

// GET public active locations
router.get("/public", async function (req, res) {
  try {
    const locations = await prisma.location.findMany({
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
      count: locations.length,
      locations: locations.map(sanitizeLocation)
    });
  } catch (error) {
    console.error("Get public locations error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load public locations"
    });
  }
});

// GET all locations
router.get(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const locations = await prisma.location.findMany({
        orderBy: {
          createdAt: "desc"
        }
      });

      return res.json({
        success: true,
        count: locations.length,
        locations: locations.map(sanitizeLocation)
      });
    } catch (error) {
      console.error("Get locations error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load locations"
      });
    }
  }
);

// GET single location
router.get(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const location = await prisma.location.findUnique({
        where: {
          id: req.params.id
        }
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
    } catch (error) {
      console.error("Get single location error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load location"
      });
    }
  }
);

// CREATE location
router.post(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const result = createLocationSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: result.error.flatten()
        });
      }

      const slug = createSlug(result.data.name);

      const duplicate = await prisma.location.findFirst({
        where: {
          slug
        }
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: "Location with this name already exists"
        });
      }

      const location = await prisma.location.create({
        data: {
          id: createId("location"),
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
          status: "active"
        }
      });

      // Temporary sync while remaining scheduling modules still use db.json
      upsertJsonLocation(location);

      await addPrismaAuditLog(
        "LOCATION_CREATED",
        req.user.email,
        `Created location: ${location.name}`
      );

      return res.status(201).json({
        success: true,
        message: "Location created successfully",
        location: sanitizeLocation(location)
      });
    } catch (error) {
      console.error("Create location error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create location"
      });
    }
  }
);

// UPDATE location
router.patch(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const result = updateLocationSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: result.error.flatten()
        });
      }

      const location = await prisma.location.findUnique({
        where: {
          id: req.params.id
        }
      });

      if (!location) {
        return res.status(404).json({
          success: false,
          message: "Location not found"
        });
      }

      const updateData = {};

      if (result.data.name) {
        const newSlug = createSlug(result.data.name);

        const duplicate = await prisma.location.findFirst({
          where: {
            slug: newSlug,
            NOT: {
              id: location.id
            }
          }
        });

        if (duplicate) {
          return res.status(400).json({
            success: false,
            message: "Another location with this name already exists"
          });
        }

        updateData.name = result.data.name;
        updateData.slug = newSlug;
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
          updateData[field] = result.data[field];
        }
      });

      updateData.updatedAt = new Date();

      const updatedLocation = await prisma.location.update({
        where: {
          id: location.id
        },
        data: updateData
      });

      // Temporary sync while remaining scheduling modules still use db.json
      upsertJsonLocation(updatedLocation);

      await addPrismaAuditLog(
        "LOCATION_UPDATED",
        req.user.email,
        `Updated location: ${updatedLocation.name}`
      );

      return res.json({
        success: true,
        message: "Location updated successfully",
        location: sanitizeLocation(updatedLocation)
      });
    } catch (error) {
      console.error("Update location error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update location"
      });
    }
  }
);

// ACTIVE / INACTIVE / ARCHIVE location
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

      const location = await prisma.location.findUnique({
        where: {
          id: req.params.id
        }
      });

      if (!location) {
        return res.status(404).json({
          success: false,
          message: "Location not found"
        });
      }

      const updatedLocation = await prisma.location.update({
        where: {
          id: location.id
        },
        data: {
          status: result.data.status,
          updatedAt: new Date()
        }
      });

      // Temporary sync while remaining scheduling modules still use db.json
      upsertJsonLocation(updatedLocation);

      await addPrismaAuditLog(
        "LOCATION_STATUS_UPDATED",
        req.user.email,
        `Changed ${updatedLocation.name} status to ${updatedLocation.status}`
      );

      return res.json({
        success: true,
        message: "Location status updated successfully",
        location: sanitizeLocation(updatedLocation)
      });
    } catch (error) {
      console.error("Update location status error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update location status"
      });
    }
  }
);

// PATCH location public booking visibility
router.patch(
  "/:id/public",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const location = await prisma.location.findUnique({
        where: {
          id: req.params.id
        }
      });

      if (!location) {
        return res.status(404).json({
          success: false,
          message: "Location not found"
        });
      }

      const updatedLocation = await prisma.location.update({
        where: {
          id: location.id
        },
        data: {
          isPublicBookingEnabled: Boolean(req.body.isPublicBookingEnabled),
          updatedAt: new Date()
        }
      });

      // Temporary sync while remaining scheduling modules still use db.json
      upsertJsonLocation(updatedLocation);

      return res.json({
        success: true,
        message: updatedLocation.isPublicBookingEnabled
          ? "Location is now public"
          : "Location is now hidden from clients",
        location: sanitizeLocation(updatedLocation)
      });
    } catch (error) {
      console.error("Update location public visibility error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update location visibility"
      });
    }
  }
);

// DELETE location
router.delete(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const location = await prisma.location.findUnique({
        where: {
          id: req.params.id
        }
      });

      if (!location) {
        return res.status(404).json({
          success: false,
          message: "Location not found"
        });
      }

      const [
        appointmentCount,
        waitlistCount,
        therapistServiceCount,
        availabilityCount,
        roomCount
      ] = await Promise.all([
        prisma.appointment.count({
          where: {
            locationId: location.id
          }
        }),
        prisma.waitlist.count({
          where: {
            locationId: location.id
          }
        }),
        prisma.therapistService.count({
          where: {
            locationIds: {
              has: location.id
            }
          }
        }),
        prisma.therapistAvailability.count({
          where: {
            OR: [
              {
                locationId: location.id
              },
              {
                locationIds: {
                  has: location.id
                }
              }
            ]
          }
        }),
        prisma.room.count({
          where: {
            locationId: location.id
          }
        })
      ]);

      if (
        appointmentCount > 0 ||
        waitlistCount > 0 ||
        therapistServiceCount > 0 ||
        availabilityCount > 0 ||
        roomCount > 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This location is already used in appointments, waitlist, therapist assignments, availability, or rooms. Archive it instead of deleting."
        });
      }

      const deletedLocation = await prisma.location.delete({
        where: {
          id: location.id
        }
      });

      // Temporary sync while remaining scheduling modules still use db.json
      deleteJsonLocation(deletedLocation.id);

      await addPrismaAuditLog(
        "LOCATION_DELETED",
        req.user.email,
        `Deleted location: ${deletedLocation.name}`
      );

      return res.json({
        success: true,
        message: "Location deleted successfully",
        location: sanitizeLocation(deletedLocation)
      });
    } catch (error) {
      console.error("Delete location error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to delete location"
      });
    }
  }
);

module.exports = router;