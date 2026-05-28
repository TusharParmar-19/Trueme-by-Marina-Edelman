const express = require("express");
const { z } = require("zod");

const { loadDB, saveDB, addAuditLog } = require("../../utils/db");
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

// CREATE waitlist entry
router.post(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER, USER_ROLES.CLIENT),
  function (req, res) {
    const result = createWaitlistSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid waitlist input",
        errors: result.error.flatten()
      });
    }

    const db = loadDB();

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

    const duplicate = db.waitlist.find(function (entry) {
      return (
        entry.clientId === clientId &&
        entry.serviceId === result.data.serviceId &&
        entry.locationId === result.data.locationId &&
        entry.appointmentType === result.data.appointmentType &&
        entry.preferredDate === result.data.preferredDate &&
        entry.status === "active"
      );
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: "Client is already active on waitlist for this date/service/location"
      });
    }

    const now = new Date().toISOString();

    const waitlistEntry = {
      id: Date.now().toString(),
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
      createdBy: req.user.email,
      createdAt: now,
      updatedAt: null
    };

    db.waitlist.push(waitlistEntry);
    saveDB(db);

    addAuditLog(
      "WAITLIST_CREATED",
      req.user.email,
      `Waitlist entry created for client ${client.email}`
    );

    return res.status(201).json({
      success: true,
      message: "Waitlist entry created successfully",
      waitlist: sanitizeWaitlistEntry(waitlistEntry, db)
    });
  }
);

// GET all waitlist entries
router.get(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const db = loadDB();

    let entries = db.waitlist;

    if (req.query.status) {
      entries = entries.filter(function (entry) {
        return entry.status === req.query.status;
      });
    }

    if (req.query.date) {
      entries = entries.filter(function (entry) {
        return entry.preferredDate === req.query.date;
      });
    }

    if (req.query.serviceId) {
      entries = entries.filter(function (entry) {
        return entry.serviceId === req.query.serviceId;
      });
    }

    const waitlist = entries.map(function (entry) {
      return sanitizeWaitlistEntry(entry, db);
    });

    return res.json({
      success: true,
      count: waitlist.length,
      waitlist
    });
  }
);

// GET my waitlist entries
router.get(
  "/me",
  authMiddleware,
  allowRoles(USER_ROLES.CLIENT),
  function (req, res) {
    const db = loadDB();

    const waitlist = db.waitlist
      .filter(function (entry) {
        return entry.clientId === req.user.id;
      })
      .map(function (entry) {
        return sanitizeWaitlistEntry(entry, db);
      });

    return res.json({
      success: true,
      count: waitlist.length,
      waitlist
    });
  }
);

// GET matching active waitlist entries
router.get(
  "/matches",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const db = loadDB();

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

    const matches = db.waitlist
      .filter(function (entry) {
        return (
          entry.status === "active" &&
          entry.serviceId === serviceId &&
          entry.locationId === locationId &&
          entry.appointmentType === appointmentType &&
          entry.preferredDate === date
        );
      })
      .map(function (entry) {
        return sanitizeWaitlistEntry(entry, db);
      });

    return res.json({
      success: true,
      count: matches.length,
      matches
    });
  }
);

// UPDATE waitlist status
router.patch(
  "/:id/status",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER, USER_ROLES.CLIENT),
  function (req, res) {
    const result = updateWaitlistStatusSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid waitlist status",
        errors: result.error.flatten()
      });
    }

    const db = loadDB();

    const entry = db.waitlist.find(function (item) {
      return item.id === req.params.id;
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

    entry.status = result.data.status;
    entry.updatedAt = new Date().toISOString();

    if (result.data.notes) {
      entry.notes = result.data.notes;
    }

    saveDB(db);

    addAuditLog(
      "WAITLIST_STATUS_UPDATED",
      req.user.email,
      `Waitlist entry ${entry.id} changed to ${entry.status}`
    );

    return res.json({
      success: true,
      message: "Waitlist status updated successfully",
      waitlist: sanitizeWaitlistEntry(entry, db)
    });
  }
);

module.exports = router;