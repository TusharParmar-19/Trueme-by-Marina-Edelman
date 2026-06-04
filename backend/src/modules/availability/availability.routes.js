const express = require("express");
const { z } = require("zod");
const crypto = require("crypto");

const prisma = require("../../config/prisma");
const { loadDB, saveDB } = require("../../utils/db");

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

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function timeToMinutes(time) {
  const parts = time.split(":");
  return Number(parts[0]) * 60 + Number(parts[1]);
}

function isValidDateTime(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
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
  if (data && data.locationId) {
    return [data.locationId];
  }

  if (data && Array.isArray(data.locationIds)) {
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

function sanitizeAvailability(rule) {
  const locationIds = getLocationIdsFromData({}, rule);

  return {
    id: rule.id,
    therapistId: rule.therapistId,
    dayOfWeek: rule.dayOfWeek,
    dayName: DAY_NAMES[rule.dayOfWeek],
    startTime: rule.startTime,
    endTime: rule.endTime,
    locationId: rule.locationId || locationIds[0] || null,
    locationIds,
    appointmentTypes: rule.appointmentTypes || [],
    notes: rule.notes || "",
    status: rule.status,
    createdAt: toIso(rule.createdAt),
    updatedAt: toIso(rule.updatedAt),
  };
}

function sanitizeTimeOff(block) {
  return {
    id: block.id,
    therapistId: block.therapistId,
    startDateTime: toIso(block.startDateTime),
    endDateTime: toIso(block.endDateTime),
    type: block.type,
    reason: block.reason || "",
    notes: block.notes || "",
    status: block.status,
    createdAt: toIso(block.createdAt),
    updatedAt: toIso(block.updatedAt),
  };
}

function availabilityToJson(rule) {
  const locationIds = getLocationIdsFromData({}, rule);

  return {
    id: rule.id,
    therapistId: rule.therapistId,
    dayOfWeek: rule.dayOfWeek,
    startTime: rule.startTime,
    endTime: rule.endTime,
    locationId: rule.locationId || locationIds[0] || null,
    locationIds,
    appointmentTypes: rule.appointmentTypes || [],
    notes: rule.notes || "",
    status: rule.status || "active",
    createdAt: toIso(rule.createdAt) || new Date().toISOString(),
    updatedAt: toIso(rule.updatedAt),
  };
}

function timeOffToJson(block) {
  return {
    id: block.id,
    therapistId: block.therapistId,
    startDateTime: toIso(block.startDateTime),
    endDateTime: toIso(block.endDateTime),
    type: block.type,
    reason: block.reason || "",
    notes: block.notes || "",
    status: block.status || "active",
    createdAt: toIso(block.createdAt) || new Date().toISOString(),
    updatedAt: toIso(block.updatedAt),
  };
}

function upsertJsonAvailability(rule) {
  try {
    const db = loadDB();

    if (!db.therapistAvailability) {
      db.therapistAvailability = [];
    }

    const existingIndex = db.therapistAvailability.findIndex(function (item) {
      return item.id === rule.id;
    });

    const jsonRule = availabilityToJson(rule);

    if (existingIndex >= 0) {
      db.therapistAvailability[existingIndex] = {
        ...db.therapistAvailability[existingIndex],
        ...jsonRule,
      };
    } else {
      db.therapistAvailability.push(jsonRule);
    }

    saveDB(db);
  } catch (error) {
    console.error("Temporary db.json availability sync failed:", error);
  }
}

function upsertJsonTimeOff(block) {
  try {
    const db = loadDB();

    if (!db.therapistTimeOff) {
      db.therapistTimeOff = [];
    }

    const existingIndex = db.therapistTimeOff.findIndex(function (item) {
      return item.id === block.id;
    });

    const jsonBlock = timeOffToJson(block);

    if (existingIndex >= 0) {
      db.therapistTimeOff[existingIndex] = {
        ...db.therapistTimeOff[existingIndex],
        ...jsonBlock,
      };
    } else {
      db.therapistTimeOff.push(jsonBlock);
    }

    saveDB(db);
  } catch (error) {
    console.error("Temporary db.json time-off sync failed:", error);
  }
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

async function findTherapistProfile(therapistId) {
  return prisma.therapist.findUnique({
    where: {
      id: therapistId,
    },
    include: {
      user: true,
    },
  });
}

function canTherapistAccessProfile(req, therapistProfile) {
  if (req.user.role !== USER_ROLES.THERAPIST) {
    return true;
  }

  return therapistProfile && therapistProfile.userId === req.user.id;
}

async function getLocationNameMap(locationIds) {
  const uniqueIds = Array.from(new Set((locationIds || []).filter(Boolean)));

  if (uniqueIds.length === 0) {
    return {};
  }

  const locations = await prisma.location.findMany({
    where: {
      id: {
        in: uniqueIds,
      },
    },
    select: {
      id: true,
      name: true,
      locationType: true,
    },
  });

  return locations.reduce(function (map, location) {
    map[location.id] = location;
    return map;
  }, {});
}

async function buildAvailabilityWithNames(rule) {
  const therapistProfile = await findTherapistProfile(rule.therapistId);
  const locationIds = getLocationIdsFromData({}, rule);
  const locationMap = await getLocationNameMap(locationIds);

  const locations = locationIds.map(function (locationId) {
    const location = locationMap[locationId];

    return {
      id: locationId,
      name: location ? location.name : locationId,
      locationType: location ? location.locationType : null,
    };
  });

  return {
    ...sanitizeAvailability(rule),
    therapistName:
      therapistProfile && therapistProfile.user
        ? therapistProfile.user.name
        : null,
    therapistEmail:
      therapistProfile && therapistProfile.user
        ? therapistProfile.user.email
        : null,
    locations,
  };
}

async function findDifferentLocationRuleForDay(
  therapistId,
  dayOfWeek,
  locationIds,
  excludeRuleId
) {
  if (!locationIds || locationIds.length === 0) {
    return null;
  }

  const rules = await prisma.therapistAvailability.findMany({
    where: {
      therapistId,
      dayOfWeek: Number(dayOfWeek),
      status: {
        notIn: ["inactive", "archived"],
      },
    },
  });

  return rules.find(function (rule) {
    if (excludeRuleId && rule.id === excludeRuleId) {
      return false;
    }

    const existingLocationIds = getLocationIdsFromData({}, rule);

    const hasDifferentLocation =
      existingLocationIds.length > 0 &&
      !locationIds.every(function (locationId) {
        return existingLocationIds.includes(locationId);
      });

    return hasDifferentLocation;
  });
}

// GET all weekly availability for admin table
router.get(
  "/weekly",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const where = {};

      if (req.query.therapistId) {
        where.therapistId = req.query.therapistId;
      }

      const rules = await prisma.therapistAvailability.findMany({
        where,
        orderBy: [
          {
            dayOfWeek: "asc",
          },
          {
            startTime: "asc",
          },
        ],
      });

      const availability = await Promise.all(
        rules.map(function (rule) {
          return buildAvailabilityWithNames(rule);
        })
      );

      return res.json({
        success: true,
        count: availability.length,
        availability,
      });
    } catch (error) {
      console.error("Get weekly availability error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load availability",
      });
    }
  }
);

// GET therapist full availability summary
router.get(
  "/therapists/:therapistId/summary",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER, USER_ROLES.THERAPIST),
  async function (req, res) {
    try {
      const therapistProfile = await findTherapistProfile(req.params.therapistId);

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

      const weeklyRules = await prisma.therapistAvailability.findMany({
        where: {
          therapistId: req.params.therapistId,
        },
        orderBy: [
          {
            dayOfWeek: "asc",
          },
          {
            startTime: "asc",
          },
        ],
      });

      const blocks = await prisma.therapistTimeOff.findMany({
        where: {
          therapistId: req.params.therapistId,
        },
        orderBy: {
          startDateTime: "asc",
        },
      });

      return res.json({
        success: true,
        therapistId: req.params.therapistId,
        weeklyAvailability: weeklyRules.map(sanitizeAvailability),
        timeOff: blocks.map(sanitizeTimeOff),
      });
    } catch (error) {
      console.error("Get therapist availability summary error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load therapist availability summary",
      });
    }
  }
);

// GET weekly availability for therapist
router.get(
  "/therapists/:therapistId/weekly",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER, USER_ROLES.THERAPIST),
  async function (req, res) {
    try {
      const therapistProfile = await findTherapistProfile(req.params.therapistId);

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

      const rules = await prisma.therapistAvailability.findMany({
        where: {
          therapistId: req.params.therapistId,
        },
        orderBy: [
          {
            dayOfWeek: "asc",
          },
          {
            startTime: "asc",
          },
        ],
      });

      return res.json({
        success: true,
        count: rules.length,
        availability: rules.map(sanitizeAvailability),
      });
    } catch (error) {
      console.error("Get therapist weekly availability error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load therapist weekly availability",
      });
    }
  }
);

// CREATE weekly availability
router.post(
  "/weekly",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
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

      const therapistProfile = await findTherapistProfile(
        result.data.therapistId
      );

      if (!therapistProfile) {
        return res.status(404).json({
          success: false,
          message: "Therapist profile not found",
        });
      }

      const incomingLocationIds = getLocationIdsFromData(result.data);

      const existingRule = await prisma.therapistAvailability.findFirst({
        where: {
          therapistId: result.data.therapistId,
          dayOfWeek: Number(result.data.dayOfWeek),
          startTime: result.data.startTime,
          endTime: result.data.endTime,
          status: {
            not: "archived",
          },
        },
      });

      const conflictingLocationRule = await findDifferentLocationRuleForDay(
        result.data.therapistId,
        result.data.dayOfWeek,
        incomingLocationIds,
        existingRule ? existingRule.id : null
      );

      if (conflictingLocationRule) {
        return res.status(400).json({
          success: false,
          message:
            "This therapist already has availability at another location for this day. A therapist can be available at only one location per day.",
        });
      }

      if (existingRule) {
        const updatedRule = await prisma.therapistAvailability.update({
          where: {
            id: existingRule.id,
          },
          data: {
            locationId: incomingLocationIds[0] || null,
            locationIds: incomingLocationIds,
            appointmentTypes:
              result.data.appointmentTypes ||
              existingRule.appointmentTypes ||
              [],
            notes: result.data.notes || existingRule.notes || "",
            startTime: result.data.startTime,
            endTime: result.data.endTime,
            status: result.data.status || "active",
            updatedAt: new Date(),
          },
        });

        upsertJsonAvailability(updatedRule);

        return res.json({
          success: true,
          message: "Availability rule updated successfully",
          availability: await buildAvailabilityWithNames(updatedRule),
        });
      }

      const availabilityRule = await prisma.therapistAvailability.create({
        data: {
          id: createId("availability"),
          therapistId: result.data.therapistId,
          dayOfWeek: result.data.dayOfWeek,
          startTime: result.data.startTime,
          endTime: result.data.endTime,
          locationId: incomingLocationIds[0] || null,
          locationIds: incomingLocationIds,
          appointmentTypes: result.data.appointmentTypes || [],
          notes: result.data.notes || "",
          status: result.data.status || "active",
        },
      });

      upsertJsonAvailability(availabilityRule);

      await addPrismaAuditLog(
        "THERAPIST_AVAILABILITY_CREATED",
        req.user.email,
        `Created availability for therapist profile ${result.data.therapistId}`
      );

      return res.status(201).json({
        success: true,
        message: "Therapist availability created successfully",
        availability: await buildAvailabilityWithNames(availabilityRule),
      });
    } catch (error) {
      console.error("Create weekly availability error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create therapist availability",
      });
    }
  }
);

// UPDATE weekly availability
router.patch(
  "/weekly/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const result = updateWeeklyAvailabilitySchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: result.error.flatten(),
        });
      }

      const rule = await prisma.therapistAvailability.findUnique({
        where: {
          id: req.params.id,
        },
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

      const conflictingLocationRule = await findDifferentLocationRuleForDay(
        rule.therapistId,
        newDayOfWeek,
        newLocationIds,
        rule.id
      );

      if (conflictingLocationRule) {
        return res.status(400).json({
          success: false,
          message:
            "This therapist already has availability at another location for this day. A therapist can be available at only one location per day.",
        });
      }

      const updateData = {
        dayOfWeek: newDayOfWeek,
        startTime: newStartTime,
        endTime: newEndTime,
        locationId: newLocationIds[0] || null,
        locationIds: newLocationIds,
        updatedAt: new Date(),
      };

      if (Object.prototype.hasOwnProperty.call(result.data, "appointmentTypes")) {
        updateData.appointmentTypes = result.data.appointmentTypes || [];
      }

      if (Object.prototype.hasOwnProperty.call(result.data, "notes")) {
        updateData.notes = result.data.notes || "";
      }

      if (Object.prototype.hasOwnProperty.call(result.data, "status")) {
        updateData.status = result.data.status;
      }

      const updatedRule = await prisma.therapistAvailability.update({
        where: {
          id: rule.id,
        },
        data: updateData,
      });

      upsertJsonAvailability(updatedRule);

      await addPrismaAuditLog(
        "THERAPIST_AVAILABILITY_UPDATED",
        req.user.email,
        `Updated availability rule ${updatedRule.id}`
      );

      return res.json({
        success: true,
        message: "Therapist availability updated successfully",
        availability: await buildAvailabilityWithNames(updatedRule),
      });
    } catch (error) {
      console.error("Update weekly availability error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update therapist availability",
      });
    }
  }
);

// ACTIVE / INACTIVE weekly availability
router.patch(
  "/weekly/:id/status",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const result = updateWeeklyStatusSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid status",
          errors: result.error.flatten(),
        });
      }

      const rule = await prisma.therapistAvailability.findUnique({
        where: {
          id: req.params.id,
        },
      });

      if (!rule) {
        return res.status(404).json({
          success: false,
          message: "Availability rule not found",
        });
      }

      const updatedRule = await prisma.therapistAvailability.update({
        where: {
          id: rule.id,
        },
        data: {
          status: result.data.status,
          updatedAt: new Date(),
        },
      });

      upsertJsonAvailability(updatedRule);

      await addPrismaAuditLog(
        "THERAPIST_AVAILABILITY_STATUS_UPDATED",
        req.user.email,
        `Changed availability rule ${updatedRule.id} status to ${updatedRule.status}`
      );

      return res.json({
        success: true,
        message: "Availability status updated successfully",
        availability: await buildAvailabilityWithNames(updatedRule),
      });
    } catch (error) {
      console.error("Update weekly availability status error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update availability status",
      });
    }
  }
);

// GET time off for therapist
router.get(
  "/therapists/:therapistId/time-off",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER, USER_ROLES.THERAPIST),
  async function (req, res) {
    try {
      const therapistProfile = await findTherapistProfile(req.params.therapistId);

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

      const blocks = await prisma.therapistTimeOff.findMany({
        where: {
          therapistId: req.params.therapistId,
        },
        orderBy: {
          startDateTime: "asc",
        },
      });

      return res.json({
        success: true,
        count: blocks.length,
        timeOff: blocks.map(sanitizeTimeOff),
      });
    } catch (error) {
      console.error("Get therapist time off error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load therapist time off",
      });
    }
  }
);

// CREATE time off / sick leave / blocked time
router.post(
  "/time-off",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
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

      const therapistProfile = await findTherapistProfile(
        result.data.therapistId
      );

      if (!therapistProfile) {
        return res.status(404).json({
          success: false,
          message: "Therapist profile not found",
        });
      }

      const timeOffBlock = await prisma.therapistTimeOff.create({
        data: {
          id: createId("time-off"),
          therapistId: result.data.therapistId,
          startDateTime: new Date(result.data.startDateTime),
          endDateTime: new Date(result.data.endDateTime),
          type: result.data.type,
          reason: result.data.reason || "",
          notes: result.data.notes || "",
          status: "active",
        },
      });

      upsertJsonTimeOff(timeOffBlock);

      await addPrismaAuditLog(
        "THERAPIST_TIME_OFF_CREATED",
        req.user.email,
        `Created ${result.data.type} block for therapist profile ${result.data.therapistId}`
      );

      return res.status(201).json({
        success: true,
        message: "Therapist time off created successfully",
        timeOff: sanitizeTimeOff(timeOffBlock),
      });
    } catch (error) {
      console.error("Create therapist time off error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create therapist time off",
      });
    }
  }
);

// UPDATE time off
router.patch(
  "/time-off/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const result = updateTimeOffSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: result.error.flatten(),
        });
      }

      const block = await prisma.therapistTimeOff.findUnique({
        where: {
          id: req.params.id,
        },
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

      const updateData = {
        updatedAt: new Date(),
      };

      if (Object.prototype.hasOwnProperty.call(result.data, "startDateTime")) {
        updateData.startDateTime = new Date(result.data.startDateTime);
      }

      if (Object.prototype.hasOwnProperty.call(result.data, "endDateTime")) {
        updateData.endDateTime = new Date(result.data.endDateTime);
      }

      if (Object.prototype.hasOwnProperty.call(result.data, "type")) {
        updateData.type = result.data.type;
      }

      if (Object.prototype.hasOwnProperty.call(result.data, "reason")) {
        updateData.reason = result.data.reason || "";
      }

      if (Object.prototype.hasOwnProperty.call(result.data, "notes")) {
        updateData.notes = result.data.notes || "";
      }

      const updatedBlock = await prisma.therapistTimeOff.update({
        where: {
          id: block.id,
        },
        data: updateData,
      });

      upsertJsonTimeOff(updatedBlock);

      await addPrismaAuditLog(
        "THERAPIST_TIME_OFF_UPDATED",
        req.user.email,
        `Updated time off block ${updatedBlock.id}`
      );

      return res.json({
        success: true,
        message: "Therapist time off updated successfully",
        timeOff: sanitizeTimeOff(updatedBlock),
      });
    } catch (error) {
      console.error("Update therapist time off error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update therapist time off",
      });
    }
  }
);

// ACTIVE / CANCELLED time off
router.patch(
  "/time-off/:id/status",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const result = updateTimeOffStatusSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid status",
          errors: result.error.flatten(),
        });
      }

      const block = await prisma.therapistTimeOff.findUnique({
        where: {
          id: req.params.id,
        },
      });

      if (!block) {
        return res.status(404).json({
          success: false,
          message: "Time off block not found",
        });
      }

      const updatedBlock = await prisma.therapistTimeOff.update({
        where: {
          id: block.id,
        },
        data: {
          status: result.data.status,
          updatedAt: new Date(),
        },
      });

      upsertJsonTimeOff(updatedBlock);

      await addPrismaAuditLog(
        "THERAPIST_TIME_OFF_STATUS_UPDATED",
        req.user.email,
        `Changed time off block ${updatedBlock.id} status to ${updatedBlock.status}`
      );

      return res.json({
        success: true,
        message: "Time off status updated successfully",
        timeOff: sanitizeTimeOff(updatedBlock),
      });
    } catch (error) {
      console.error("Update therapist time off status error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update time off status",
      });
    }
  }
);

module.exports = router;