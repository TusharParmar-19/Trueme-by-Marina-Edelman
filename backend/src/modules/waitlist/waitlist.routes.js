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

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const createWaitlistSchema = z.object({
  clientId: z.string().optional(),
  serviceId: z.string().min(1),
  locationId: z.string().min(1),
  appointmentType: z.enum(["telehealth", "in_person"]),
  preferredDate: z.string().regex(DATE_REGEX, "Use YYYY-MM-DD format"),
  preferredStartTime: z.string().regex(TIME_REGEX, "Use HH:MM format").optional(),
  preferredEndTime: z.string().regex(TIME_REGEX, "Use HH:MM format").optional(),
  therapistId: z.string().optional(),
  notes: z.string().max(1000).optional()
});

const updateWaitlistStatusSchema = z.object({
  status: z.enum(["active", "notified", "booked", "cancelled"]),
  notes: z.string().max(1000).optional()
});

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
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

function serializePrismaRecord(record) {
  const output = {};

  Object.keys(record).forEach(function (key) {
    output[key] = toIso(record[key]);
  });

  return output;
}

async function loadWaitlistSnapshot() {
  const [users, services, locations, therapists, waitlist] = await Promise.all([
    prisma.user.findMany(),
    prisma.service.findMany(),
    prisma.location.findMany(),
    prisma.therapist.findMany(),
    prisma.waitlist.findMany()
  ]);

  return {
    users: users.map(serializePrismaRecord),
    services: services.map(serializePrismaRecord),
    locations: locations.map(serializePrismaRecord),
    therapists: therapists.map(serializePrismaRecord),
    waitlist: waitlist.map(serializePrismaRecord)
  };
}

function sanitizeWaitlistEntry(entry, db) {
  const client = db.users.find(function (user) {
    return user.id === entry.clientId;
  });

  const service = db.services.find(function (service) {
    return service.id === entry.serviceId;
  });

  const location = db.locations.find(function (location) {
    return location.id === entry.locationId;
  });

  const therapist = db.therapists.find(function (item) {
    return item.id === entry.therapistId;
  });

  const therapistUser = therapist
    ? db.users.find(function (user) {
      return user.id === therapist.userId;
    })
    : null;

  return {
    id: entry.id,
    clientId: entry.clientId,
    clientName: client ? client.name : null,
    clientEmail: client ? client.email : null,
    serviceId: entry.serviceId,
    serviceName: service ? service.name : null,
    locationId: entry.locationId,
    locationName: location ? location.name : null,
    appointmentType: entry.appointmentType,
    preferredDate: entry.preferredDate,
    preferredStartTime: entry.preferredStartTime || "",
    preferredEndTime: entry.preferredEndTime || "",
    therapistId: entry.therapistId || null,
    therapistName: therapistUser ? therapistUser.name : null,
    status: entry.status,
    notes: entry.notes || "",
    createdBy: entry.createdBy,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt || null
  };
}

function getActiveClient(db, clientId) {
  return db.users.find(function (user) {
    return (
      user.id === clientId &&
      user.role === USER_ROLES.CLIENT &&
      user.status === "active"
    );
  });
}

function getActiveService(db, serviceId) {
  return db.services.find(function (service) {
    return service.id === serviceId && service.status === "active";
  });
}

function getActiveLocation(db, locationId) {
  return db.locations.find(function (location) {
    return location.id === locationId && location.status === "active";
  });
}

function waitlistToJson(entry) {
  return {
    id: entry.id,
    clientId: entry.clientId,
    serviceId: entry.serviceId,
    locationId: entry.locationId,
    appointmentType: entry.appointmentType,
    preferredDate: entry.preferredDate,
    preferredStartTime: entry.preferredStartTime || "",
    preferredEndTime: entry.preferredEndTime || "",
    therapistId: entry.therapistId || null,
    status: entry.status || "active",
    notes: entry.notes || "",
    createdBy: entry.createdBy || "",
    createdAt: toIso(entry.createdAt) || new Date().toISOString(),
    updatedAt: toIso(entry.updatedAt)
  };
}

function upsertJsonWaitlist(entry) {
  try {
    const db = loadDB();

    if (!db.waitlist) {
      db.waitlist = [];
    }

    const existingIndex = db.waitlist.findIndex(function (item) {
      return item.id === entry.id;
    });

    const jsonEntry = waitlistToJson(entry);

    if (existingIndex >= 0) {
      db.waitlist[existingIndex] = {
        ...db.waitlist[existingIndex],
        ...jsonEntry
      };
    } else {
      db.waitlist.push(jsonEntry);
    }

    saveDB(db);
  } catch (error) {
    console.error("Temporary db.json waitlist sync failed:", error);
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

// CREATE waitlist entry
router.post(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER, USER_ROLES.CLIENT),
  async function (req, res) {
    try {
      const result = createWaitlistSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid waitlist input",
          errors: result.error.flatten()
        });
      }

      const db = await loadWaitlistSnapshot();

      let clientId = result.data.clientId;

      if (req.user.role === USER_ROLES.CLIENT) {
        clientId = req.user.id;
      }

      if (!clientId) {
        return res.status(400).json({
          success: false,
          message: "clientId is required for admin or office manager"
        });
      }

      const client = getActiveClient(db, clientId);

      if (!client) {
        return res.status(404).json({
          success: false,
          message: "Active client user not found"
        });
      }

      const service = getActiveService(db, result.data.serviceId);

      if (!service) {
        return res.status(404).json({
          success: false,
          message: "Active service not found"
        });
      }

      const location = getActiveLocation(db, result.data.locationId);

      if (!location) {
        return res.status(404).json({
          success: false,
          message: "Active location not found"
        });
      }

      if (result.data.therapistId) {
        const therapist = db.therapists.find(function (item) {
          return item.id === result.data.therapistId;
        });

        if (!therapist || therapist.profileStatus !== "active") {
          return res.status(404).json({
            success: false,
            message: "Active therapist profile not found"
          });
        }
      }

      const duplicate = await prisma.waitlist.findFirst({
        where: {
          clientId,
          serviceId: result.data.serviceId,
          locationId: result.data.locationId,
          appointmentType: result.data.appointmentType,
          preferredDate: result.data.preferredDate,
          status: "active"
        }
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: "Client is already active on waitlist for this date/service/location"
        });
      }

      const waitlistEntry = await prisma.waitlist.create({
        data: {
          id: createId("waitlist"),
          clientId,
          serviceId: result.data.serviceId,
          locationId: result.data.locationId,
          appointmentType: result.data.appointmentType,
          preferredDate: result.data.preferredDate,
          preferredStartTime: result.data.preferredStartTime || "",
          preferredEndTime: result.data.preferredEndTime || "",
          therapistId: result.data.therapistId || null,
          status: "active",
          notes: result.data.notes || "",
          createdBy: req.user.email
        }
      });

      upsertJsonWaitlist(waitlistEntry);

      await addPrismaAuditLog(
        "WAITLIST_CREATED",
        req.user.email,
        `Waitlist entry created for client ${client.email}`
      );

      const responseDb = await loadWaitlistSnapshot();

      return res.status(201).json({
        success: true,
        message: "Waitlist entry created successfully",
        waitlist: sanitizeWaitlistEntry(
          serializePrismaRecord(waitlistEntry),
          responseDb
        )
      });
    } catch (error) {
      console.error("Create waitlist error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create waitlist entry"
      });
    }
  }
);

// GET all waitlist entries
router.get(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const where = {};

      if (req.query.status) {
        where.status = req.query.status;
      }

      if (req.query.date) {
        where.preferredDate = req.query.date;
      }

      if (req.query.serviceId) {
        where.serviceId = req.query.serviceId;
      }

      const entries = await prisma.waitlist.findMany({
        where,
        orderBy: {
          createdAt: "desc"
        }
      });

      const db = await loadWaitlistSnapshot();

      const waitlist = entries.map(function (entry) {
        return sanitizeWaitlistEntry(serializePrismaRecord(entry), db);
      });

      return res.json({
        success: true,
        count: waitlist.length,
        waitlist
      });
    } catch (error) {
      console.error("Get waitlist error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load waitlist"
      });
    }
  }
);

// GET my waitlist entries
router.get(
  "/me",
  authMiddleware,
  allowRoles(USER_ROLES.CLIENT),
  async function (req, res) {
    try {
      const entries = await prisma.waitlist.findMany({
        where: {
          clientId: req.user.id
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      const db = await loadWaitlistSnapshot();

      const waitlist = entries.map(function (entry) {
        return sanitizeWaitlistEntry(serializePrismaRecord(entry), db);
      });

      return res.json({
        success: true,
        count: waitlist.length,
        waitlist
      });
    } catch (error) {
      console.error("Get my waitlist error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load your waitlist entries"
      });
    }
  }
);

// GET matching active waitlist entries
router.get(
  "/matches",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const serviceId = req.query.serviceId;
      const locationId = req.query.locationId;
      const appointmentType = req.query.appointmentType;
      const date = req.query.date;

      if (!serviceId || !locationId || !appointmentType || !date) {
        return res.status(400).json({
          success: false,
          message: "serviceId, locationId, appointmentType, and date are required"
        });
      }

      const entries = await prisma.waitlist.findMany({
        where: {
          status: "active",
          serviceId,
          locationId,
          appointmentType,
          preferredDate: date
        },
        orderBy: {
          createdAt: "asc"
        }
      });

      const db = await loadWaitlistSnapshot();

      const matches = entries.map(function (entry) {
        return sanitizeWaitlistEntry(serializePrismaRecord(entry), db);
      });

      return res.json({
        success: true,
        count: matches.length,
        matches
      });
    } catch (error) {
      console.error("Get matching waitlist error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load matching waitlist entries"
      });
    }
  }
);

// UPDATE waitlist status
router.patch(
  "/:id/status",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER, USER_ROLES.CLIENT),
  async function (req, res) {
    try {
      const result = updateWaitlistStatusSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid waitlist status",
          errors: result.error.flatten()
        });
      }

      const entry = await prisma.waitlist.findUnique({
        where: {
          id: req.params.id
        }
      });

      if (!entry) {
        return res.status(404).json({
          success: false,
          message: "Waitlist entry not found"
        });
      }

      if (req.user.role === USER_ROLES.CLIENT && entry.clientId !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: "You can only update your own waitlist entry"
        });
      }

      if (
        req.user.role === USER_ROLES.CLIENT &&
        result.data.status !== "cancelled"
      ) {
        return res.status(403).json({
          success: false,
          message: "Client can only cancel their waitlist entry"
        });
      }

      const updatedEntry = await prisma.waitlist.update({
        where: {
          id: entry.id
        },
        data: {
          status: result.data.status,
          notes: result.data.notes || entry.notes || "",
          updatedAt: new Date()
        }
      });

      upsertJsonWaitlist(updatedEntry);

      await addPrismaAuditLog(
        "WAITLIST_STATUS_UPDATED",
        req.user.email,
        `Waitlist entry ${updatedEntry.id} changed to ${updatedEntry.status}`
      );

      const db = await loadWaitlistSnapshot();

      return res.json({
        success: true,
        message: "Waitlist status updated successfully",
        waitlist: sanitizeWaitlistEntry(serializePrismaRecord(updatedEntry), db)
      });
    } catch (error) {
      console.error("Update waitlist status error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update waitlist status"
      });
    }
  }
);

module.exports = router;