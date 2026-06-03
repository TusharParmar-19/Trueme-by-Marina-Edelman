const express = require("express");
const { z } = require("zod");

const { loadDB, saveDB, addAuditLog } = require("../../utils/db");
const {
  authMiddleware,
  allowRoles,
} = require("../../middleware/authMiddleware");

const { USER_ROLES } = require("../users/user.roles");

const router = express.Router();

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const DAY_NAMES = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

const TIME_OFF_TYPES = [
  "sick_leave",
  "vacation",
  "personal",
  "blocked_time",
  "holiday",
  "other",
];

const createWeeklyAvailabilitySchema = z.object({
  therapistId: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(TIME_REGEX, "Use HH:MM format"),
  endTime: z.string().regex(TIME_REGEX, "Use HH:MM format"),
  locationId: z.string().min(1).optional(),
  locationIds: z.array(z.string().min(1)).optional(),
  appointmentTypes: z.array(z.enum(["telehealth", "in_person"])).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  notes: z.string().max(1000).optional(),
});

const updateWeeklyAvailabilitySchema = createWeeklyAvailabilitySchema
  .omit({
    therapistId: true,
  })
  .partial();

const updateWeeklyStatusSchema = z.object({
  status: z.enum(["active", "inactive"]),
});

const createTimeOffSchema = z.object({
  therapistId: z.string().min(1),
  startDateTime: z.string().min(1),
  endDateTime: z.string().min(1),
  type: z.enum(TIME_OFF_TYPES),
  reason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

const updateTimeOffSchema = createTimeOffSchema
  .omit({
    therapistId: true,
  })
  .partial();

const updateTimeOffStatusSchema = z.object({
  status: z.enum(["active", "cancelled"]),
});

function timeToMinutes(time) {
  const parts = time.split(":");
  return Number(parts[0]) * 60 + Number(parts[1]);
}

function isValidDateTime(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function sanitizeAvailability(rule) {
  return {
    id: rule.id,
    therapistId: rule.therapistId,
    dayOfWeek: rule.dayOfWeek,
    dayName: DAY_NAMES[rule.dayOfWeek],
    startTime: rule.startTime,
    endTime: rule.endTime,
    locationId: rule.locationId || (rule.locationIds || [])[0] || null,
    locationIds: rule.locationIds || (rule.locationId ? [rule.locationId] : []),
    appointmentTypes: rule.appointmentTypes || [],
    notes: rule.notes || "",
    status: rule.status,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt || null,
  };
}

function sanitizeTimeOff(block) {
  return {
    id: block.id,
    therapistId: block.therapistId,
    startDateTime: block.startDateTime,
    endDateTime: block.endDateTime,
    type: block.type,
    reason: block.reason || "",
    notes: block.notes || "",
    status: block.status,
    createdAt: block.createdAt,
    updatedAt: block.updatedAt || null,
  };
}

function findTherapistProfile(db, therapistId) {
  return db.therapists.find(function (therapist) {
    return therapist.id === therapistId;
  });
}

function canTherapistAccessProfile(req, therapistProfile) {
  if (req.user.role !== USER_ROLES.THERAPIST) return true;
  return therapistProfile && therapistProfile.userId === req.user.id;
}

function validateTimeRange(startTime, endTime) {
  return timeToMinutes(endTime) > timeToMinutes(startTime);
}

function validateDateTimeRange(startDateTime, endDateTime) {
  if (!isValidDateTime(startDateTime) || !isValidDateTime(endDateTime)) {
    return false;
  }

  return new Date(endDateTime).getTime() > new Date(startDateTime).getTime();
}

function getLocationIdsFromData(data, fallbackRule) {
  if (data.locationId) {
    return [data.locationId];
  }

  if (Array.isArray(data.locationIds)) {
    return data.locationIds;
  }

  if (fallbackRule) {
    if (fallbackRule.locationId) {
      return [fallbackRule.locationId];
    }

    if (Array.isArray(fallbackRule.locationIds)) {
      return fallbackRule.locationIds;
    }
  }

  return [];
}

function findDifferentLocationRuleForDay(
  db,
  therapistId,
  dayOfWeek,
  locationIds,
  excludeRuleId,
) {
  if (!locationIds || locationIds.length === 0) {
    return null;
  }

  return (db.therapistAvailability || []).find(function (rule) {
    if (excludeRuleId && rule.id === excludeRuleId) {
      return false;
    }

    const existingLocationIds = getLocationIdsFromData({}, rule);

    const hasDifferentLocation =
      existingLocationIds.length > 0 &&
      !locationIds.every(function (locationId) {
        return existingLocationIds.includes(locationId);
      });

    return (
      rule.therapistId === therapistId &&
      Number(rule.dayOfWeek) === Number(dayOfWeek) &&
      rule.status !== "inactive" &&
      rule.status !== "archived" &&
      hasDifferentLocation
    );
  });
}

function buildAvailabilityWithNames(db, rule) {
  const therapist = (db.therapists || []).find(function (item) {
    return item.id === rule.therapistId;
  });

  const therapistUser = therapist
    ? (db.users || []).find(function (user) {
        return user.id === therapist.userId;
      })
    : null;

  const locationIds = getLocationIdsFromData({}, rule);

  const locations = locationIds
    .map(function (locationId) {
      return (db.locations || []).find(function (location) {
        return location.id === locationId;
      });
    })
    .filter(Boolean)
    .map(function (location) {
      return {
        id: location.id,
        name: location.name,
        locationType: location.locationType,
      };
    });

  return {
    ...sanitizeAvailability(rule),
    therapistName: therapistUser ? therapistUser.name : null,
    therapistEmail: therapistUser ? therapistUser.email : null,
    locations,
  };
}

function getLocationIdsFromData(data, fallbackRule) {
  if (data.locationId) {
    return [data.locationId];
  }

  if (Array.isArray(data.locationIds)) {
    return data.locationIds;
  }

  if (fallbackRule) {
    if (fallbackRule.locationId) {
      return [fallbackRule.locationId];
    }

    if (Array.isArray(fallbackRule.locationIds)) {
      return fallbackRule.locationIds;
    }
  }

  return [];
}

function findDifferentLocationRuleForDay(
  db,
  therapistId,
  dayOfWeek,
  locationIds,
  excludeRuleId,
) {
  if (!locationIds || locationIds.length === 0) {
    return null;
  }

  return db.therapistAvailability.find(function (rule) {
    if (excludeRuleId && rule.id === excludeRuleId) {
      return false;
    }

    const existingLocationIds = getLocationIdsFromData({}, rule);

    const hasDifferentLocation =
      existingLocationIds.length > 0 &&
      !locationIds.every(function (locationId) {
        return existingLocationIds.includes(locationId);
      });

    return (
      rule.therapistId === therapistId &&
      Number(rule.dayOfWeek) === Number(dayOfWeek) &&
      rule.status !== "inactive" &&
      rule.status !== "archived" &&
      hasDifferentLocation
    );
  });
}

// GET all weekly availability for admin table
router.get(
  "/weekly",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const db = loadDB();

    if (!db.therapistAvailability) {
      db.therapistAvailability = [];
    }

    let rules = db.therapistAvailability;

    if (req.query.therapistId) {
      rules = rules.filter(function (rule) {
        return rule.therapistId === req.query.therapistId;
      });
    }

    const availability = rules.map(function (rule) {
      return buildAvailabilityWithNames(db, rule);
    });

    return res.json({
      success: true,
      count: availability.length,
      availability,
    });
  },
);

// GET therapist full availability summary
router.get(
  "/therapists/:therapistId/summary",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER, USER_ROLES.THERAPIST),
  function (req, res) {
    const db = loadDB();

    const therapistProfile = findTherapistProfile(db, req.params.therapistId);

    if (!therapistProfile) {
      return res.status(404).json({
        success: false,
        message: "Therapist profile not found",
      });
    }

    if (!canTherapistAccessProfile(req, therapistProfile)) {
      return res.status(403).json({
        success: false,
        message: "You can only view your own availability",
      });
    }

    const weeklyAvailability = db.therapistAvailability
      .filter(function (rule) {
        return rule.therapistId === req.params.therapistId;
      })
      .map(function (rule) {
        return sanitizeAvailability(rule);
      });

    const timeOff = db.therapistTimeOff
      .filter(function (block) {
        return block.therapistId === req.params.therapistId;
      })
      .map(function (block) {
        return sanitizeTimeOff(block);
      });

    return res.json({
      success: true,
      therapistId: req.params.therapistId,
      weeklyAvailability,
      timeOff,
    });
  },
);

// GET weekly availability for therapist
router.get(
  "/therapists/:therapistId/weekly",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER, USER_ROLES.THERAPIST),
  function (req, res) {
    const db = loadDB();

    const therapistProfile = findTherapistProfile(db, req.params.therapistId);

    if (!therapistProfile) {
      return res.status(404).json({
        success: false,
        message: "Therapist profile not found",
      });
    }

    if (!canTherapistAccessProfile(req, therapistProfile)) {
      return res.status(403).json({
        success: false,
        message: "You can only view your own availability",
      });
    }

    const availability = db.therapistAvailability
      .filter(function (rule) {
        return rule.therapistId === req.params.therapistId;
      })
      .map(function (rule) {
        return sanitizeAvailability(rule);
      });

    return res.json({
      success: true,
      count: availability.length,
      availability,
    });
  },
);

// GET all weekly availability for admin table
router.get(
  "/weekly",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const db = loadDB();

    if (!db.therapistAvailability) {
      db.therapistAvailability = [];
    }

    let rules = db.therapistAvailability;

    if (req.query.therapistId) {
      rules = rules.filter(function (rule) {
        return rule.therapistId === req.query.therapistId;
      });
    }

    const availability = rules.map(function (rule) {
      const therapist = db.therapists.find(function (item) {
        return item.id === rule.therapistId;
      });

      const therapistUser = therapist
        ? db.users.find(function (user) {
            return user.id === therapist.userId;
          })
        : null;

      const locationIds = getLocationIdsFromData({}, rule);

      const locations = locationIds
        .map(function (locationId) {
          return db.locations.find(function (location) {
            return location.id === locationId;
          });
        })
        .filter(Boolean);

      return {
        ...sanitizeAvailability(rule),
        therapistName: therapistUser ? therapistUser.name : null,
        therapistEmail: therapistUser ? therapistUser.email : null,
        locations: locations.map(function (location) {
          return {
            id: location.id,
            name: location.name,
            locationType: location.locationType,
          };
        }),
      };
    });

    return res.json({
      success: true,
      count: availability.length,
      availability,
    });
  },
);

// CREATE weekly availability
router.post(
  "/weekly",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = createWeeklyAvailabilitySchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: result.error.flatten(),
      });
    }

    if (!validateTimeRange(result.data.startTime, result.data.endTime)) {
      return res.status(400).json({
        success: false,
        message: "End time must be after start time",
      });
    }

    const db = loadDB();

    if (!db.therapistAvailability) {
      db.therapistAvailability = [];
    }

    const therapistProfile = findTherapistProfile(db, result.data.therapistId);

    if (!therapistProfile) {
      return res.status(404).json({
        success: false,
        message: "Therapist profile not found",
      });
    }

    const incomingLocationIds = getLocationIdsFromData(result.data);

    const existingRule = db.therapistAvailability.find(function (rule) {
      return (
        rule.therapistId === result.data.therapistId &&
        Number(rule.dayOfWeek) === Number(result.data.dayOfWeek) &&
        rule.startTime === result.data.startTime &&
        rule.endTime === result.data.endTime &&
        rule.status !== "archived"
      );
    });

    const conflictingLocationRule = findDifferentLocationRuleForDay(
      db,
      result.data.therapistId,
      result.data.dayOfWeek,
      incomingLocationIds,
      existingRule ? existingRule.id : null,
    );

    if (conflictingLocationRule) {
      return res.status(400).json({
        success: false,
        message:
          "This therapist already has availability at another location for this day. A therapist can be available at only one location per day.",
      });
    }

    if (existingRule) {
      existingRule.locationId = incomingLocationIds[0] || null;
      existingRule.locationIds = incomingLocationIds;
      existingRule.appointmentTypes =
        result.data.appointmentTypes || existingRule.appointmentTypes || [];
      existingRule.notes = result.data.notes || existingRule.notes || "";
      existingRule.startTime = result.data.startTime;
      existingRule.endTime = result.data.endTime;
      existingRule.status = result.data.status || "active";
      existingRule.updatedAt = new Date().toISOString();

      saveDB(db);

      return res.json({
        success: true,
        message: "Availability rule updated successfully",
        availability: sanitizeAvailability(existingRule),
      });
    }

    const now = new Date().toISOString();

    const availabilityRule = {
      id: Date.now().toString(),
      therapistId: result.data.therapistId,
      dayOfWeek: result.data.dayOfWeek,
      startTime: result.data.startTime,
      endTime: result.data.endTime,
      locationId: incomingLocationIds[0] || null,
      locationIds: incomingLocationIds,
      appointmentTypes: result.data.appointmentTypes || [],
      notes: result.data.notes || "",
      status: result.data.status || "active",
      createdAt: now,
      updatedAt: null,
    };

    db.therapistAvailability.push(availabilityRule);
    saveDB(db);

    addAuditLog(
      "THERAPIST_AVAILABILITY_CREATED",
      req.user.email,
      `Created availability for therapist profile ${result.data.therapistId}`,
    );

    return res.status(201).json({
      success: true,
      message: "Therapist availability created successfully",
      availability: sanitizeAvailability(availabilityRule),
    });
  },
);

// UPDATE weekly availability
router.patch(
  "/weekly/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = updateWeeklyAvailabilitySchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: result.error.flatten(),
      });
    }

    const db = loadDB();

    if (!db.therapistAvailability) {
      db.therapistAvailability = [];
    }

    const rule = db.therapistAvailability.find(function (item) {
      return item.id === req.params.id;
    });

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Availability rule not found",
      });
    }

    const newStartTime = result.data.startTime || rule.startTime;
    const newEndTime = result.data.endTime || rule.endTime;
    const newDayOfWeek =
      result.data.dayOfWeek !== undefined
        ? result.data.dayOfWeek
        : rule.dayOfWeek;

    if (!validateTimeRange(newStartTime, newEndTime)) {
      return res.status(400).json({
        success: false,
        message: "End time must be after start time",
      });
    }

    const newLocationIds = getLocationIdsFromData(result.data, rule);

    if (newLocationIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select a location for this availability rule",
      });
    }

    const conflictingLocationRule = findDifferentLocationRuleForDay(
      db,
      rule.therapistId,
      newDayOfWeek,
      newLocationIds,
      rule.id,
    );

    if (conflictingLocationRule) {
      return res.status(400).json({
        success: false,
        message:
          "This therapist already has availability at another location for this day. A therapist can be available at only one location per day.",
      });
    }

    rule.dayOfWeek = newDayOfWeek;
    rule.startTime = newStartTime;
    rule.endTime = newEndTime;
    rule.locationId = newLocationIds[0] || null;
    rule.locationIds = newLocationIds;

    if (Object.prototype.hasOwnProperty.call(result.data, "appointmentTypes")) {
      rule.appointmentTypes = result.data.appointmentTypes || [];
    }

    if (Object.prototype.hasOwnProperty.call(result.data, "notes")) {
      rule.notes = result.data.notes || "";
    }

    rule.updatedAt = new Date().toISOString();

    saveDB(db);

    addAuditLog(
      "THERAPIST_AVAILABILITY_UPDATED",
      req.user.email,
      `Updated availability rule ${rule.id}`,
    );

    return res.json({
      success: true,
      message: "Therapist availability updated successfully",
      availability: buildAvailabilityWithNames(db, rule),
    });
  },
);

// ACTIVE / INACTIVE weekly availability
router.patch(
  "/weekly/:id/status",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = updateWeeklyStatusSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
        errors: result.error.flatten(),
      });
    }

    const db = loadDB();

    const rule = db.therapistAvailability.find(function (item) {
      return item.id === req.params.id;
    });

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Availability rule not found",
      });
    }

    rule.status = result.data.status;
    rule.updatedAt = new Date().toISOString();

    saveDB(db);

    addAuditLog(
      "THERAPIST_AVAILABILITY_STATUS_UPDATED",
      req.user.email,
      `Changed availability rule ${rule.id} status to ${rule.status}`,
    );

    return res.json({
      success: true,
      message: "Availability status updated successfully",
      availability: sanitizeAvailability(rule),
    });
  },
);

// GET time off for therapist
router.get(
  "/therapists/:therapistId/time-off",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER, USER_ROLES.THERAPIST),
  function (req, res) {
    const db = loadDB();

    const therapistProfile = findTherapistProfile(db, req.params.therapistId);

    if (!therapistProfile) {
      return res.status(404).json({
        success: false,
        message: "Therapist profile not found",
      });
    }

    if (!canTherapistAccessProfile(req, therapistProfile)) {
      return res.status(403).json({
        success: false,
        message: "You can only view your own time off",
      });
    }

    const timeOff = db.therapistTimeOff
      .filter(function (block) {
        return block.therapistId === req.params.therapistId;
      })
      .map(function (block) {
        return sanitizeTimeOff(block);
      });

    return res.json({
      success: true,
      count: timeOff.length,
      timeOff,
    });
  },
);

// CREATE time off / sick leave / blocked time
router.post(
  "/time-off",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = createTimeOffSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: result.error.flatten(),
      });
    }

    if (
      !validateDateTimeRange(result.data.startDateTime, result.data.endDateTime)
    ) {
      return res.status(400).json({
        success: false,
        message: "End date/time must be after start date/time",
      });
    }

    const db = loadDB();

    const therapistProfile = findTherapistProfile(db, result.data.therapistId);

    if (!therapistProfile) {
      return res.status(404).json({
        success: false,
        message: "Therapist profile not found",
      });
    }

    const now = new Date().toISOString();

    const timeOffBlock = {
      id: Date.now().toString(),
      therapistId: result.data.therapistId,
      startDateTime: result.data.startDateTime,
      endDateTime: result.data.endDateTime,
      type: result.data.type,
      reason: result.data.reason || "",
      notes: result.data.notes || "",
      status: "active",
      createdAt: now,
      updatedAt: null,
    };

    db.therapistTimeOff.push(timeOffBlock);
    saveDB(db);

    addAuditLog(
      "THERAPIST_TIME_OFF_CREATED",
      req.user.email,
      `Created ${result.data.type} block for therapist profile ${result.data.therapistId}`,
    );

    return res.status(201).json({
      success: true,
      message: "Therapist time off created successfully",
      timeOff: sanitizeTimeOff(timeOffBlock),
    });
  },
);

// UPDATE time off
router.patch(
  "/time-off/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = updateTimeOffSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: result.error.flatten(),
      });
    }

    const db = loadDB();

    const block = db.therapistTimeOff.find(function (item) {
      return item.id === req.params.id;
    });

    if (!block) {
      return res.status(404).json({
        success: false,
        message: "Time off block not found",
      });
    }

    const newStartDateTime = result.data.startDateTime || block.startDateTime;
    const newEndDateTime = result.data.endDateTime || block.endDateTime;

    if (!validateDateTimeRange(newStartDateTime, newEndDateTime)) {
      return res.status(400).json({
        success: false,
        message: "End date/time must be after start date/time",
      });
    }

    const allowedFields = [
      "startDateTime",
      "endDateTime",
      "type",
      "reason",
      "notes",
    ];

    allowedFields.forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(result.data, field)) {
        block[field] = result.data[field];
      }
    });

    block.updatedAt = new Date().toISOString();

    saveDB(db);

    addAuditLog(
      "THERAPIST_TIME_OFF_UPDATED",
      req.user.email,
      `Updated time off block ${block.id}`,
    );

    return res.json({
      success: true,
      message: "Therapist time off updated successfully",
      timeOff: sanitizeTimeOff(block),
    });
  },
);

// ACTIVE / CANCELLED time off
router.patch(
  "/time-off/:id/status",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = updateTimeOffStatusSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
        errors: result.error.flatten(),
      });
    }

    const db = loadDB();

    const block = db.therapistTimeOff.find(function (item) {
      return item.id === req.params.id;
    });

    if (!block) {
      return res.status(404).json({
        success: false,
        message: "Time off block not found",
      });
    }

    block.status = result.data.status;
    block.updatedAt = new Date().toISOString();

    saveDB(db);

    addAuditLog(
      "THERAPIST_TIME_OFF_STATUS_UPDATED",
      req.user.email,
      `Changed time off block ${block.id} status to ${block.status}`,
    );

    return res.json({
      success: true,
      message: "Time off status updated successfully",
      timeOff: sanitizeTimeOff(block),
    });
  },
);

module.exports = router;
