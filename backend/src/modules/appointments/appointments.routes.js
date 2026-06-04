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
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// For MVP/demo we use California offset.
// Later we will replace this with proper timezone library like luxon/date-fns-tz.
const DEFAULT_TIMEZONE_OFFSET = "-07:00";

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

async function loadSchedulingSnapshot() {
  const [
    users,
    therapists,
    services,
    locations,
    rooms,
    therapistServices,
    therapistAvailability,
    therapistTimeOff,
    appointments,
    waitlist
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.therapist.findMany(),
    prisma.service.findMany(),
    prisma.location.findMany(),
    prisma.room.findMany(),
    prisma.therapistService.findMany(),
    prisma.therapistAvailability.findMany(),
    prisma.therapistTimeOff.findMany(),
    prisma.appointment.findMany(),
    prisma.waitlist.findMany()
  ]);

  return {
    users: users.map(serializePrismaRecord),
    therapists: therapists.map(serializePrismaRecord),
    services: services.map(serializePrismaRecord),
    locations: locations.map(serializePrismaRecord),
    rooms: rooms.map(serializePrismaRecord),
    therapistServices: therapistServices.map(serializePrismaRecord),
    therapistAvailability: therapistAvailability.map(serializePrismaRecord),
    therapistTimeOff: therapistTimeOff.map(serializePrismaRecord),
    appointments: appointments.map(serializePrismaRecord),
    waitlist: waitlist.map(serializePrismaRecord)
  };
}

function appointmentToJson(appointment) {
  return {
    id: appointment.id,
    clientId: appointment.clientId,
    therapistId: appointment.therapistId,
    serviceId: appointment.serviceId,
    locationId: appointment.locationId,
    roomId: appointment.roomId || null,
    appointmentType: appointment.appointmentType,
    date: appointment.date,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    blockedStartTime: appointment.blockedStartTime || null,
    blockedEndTime: appointment.blockedEndTime || null,
    startDateTime: appointment.startDateTime || null,
    endDateTime: appointment.endDateTime || null,
    status: appointment.status,
    priceSnapshot: appointment.priceSnapshot || 0,
    currencySnapshot: appointment.currencySnapshot || "USD",
    notes: appointment.notes || "",
    createdBy: appointment.createdBy || "",
    createdAt: toIso(appointment.createdAt) || new Date().toISOString(),
    updatedAt: toIso(appointment.updatedAt)
  };
}

function upsertJsonAppointment(appointment) {
  try {
    const db = loadDB();

    if (!db.appointments) {
      db.appointments = [];
    }

    const existingIndex = db.appointments.findIndex(function (item) {
      return item.id === appointment.id;
    });

    const jsonAppointment = appointmentToJson(appointment);

    if (existingIndex >= 0) {
      db.appointments[existingIndex] = {
        ...db.appointments[existingIndex],
        ...jsonAppointment
      };
    } else {
      db.appointments.push(jsonAppointment);
    }

    saveDB(db);
  } catch (error) {
    console.error("Temporary db.json appointment sync failed:", error);
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

const slotQuerySchema = z.object({
  date: z.string().regex(DATE_REGEX, "Use YYYY-MM-DD format"),
  serviceId: z.string().min(1),
  locationId: z.string().min(1),
  appointmentType: z.enum(["telehealth", "in_person"]),
  therapistId: z.string().optional(),
  slotIntervalMinutes: z
    .string()
    .optional()
    .transform(function (value) {
      return value ? Number(value) : 30;
    }),
});

const createAppointmentSchema = z.object({
  clientId: z.string().optional(),
  serviceId: z.string().min(1),
  locationId: z.string().min(1),
  appointmentType: z.enum(["telehealth", "in_person"]),
  date: z.string().regex(DATE_REGEX, "Use YYYY-MM-DD format"),
  startTime: z.string().regex(TIME_REGEX, "Use HH:MM format"),
  therapistId: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

const updateAppointmentStatusSchema = z.object({
  status: z.enum(["confirmed", "cancelled", "completed", "no_show"]),
  reason: z.string().max(500).optional(),
});

const rescheduleAppointmentSchema = z.object({
  date: z.string().regex(DATE_REGEX, "Use YYYY-MM-DD format"),
  startTime: z.string().regex(TIME_REGEX, "Use HH:MM format"),
  therapistId: z.string().optional(),
  allowDifferentTherapist: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
});

function timeToMinutes(time) {
  const parts = time.split(":");
  return Number(parts[0]) * 60 + Number(parts[1]);
}

function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return String(hours).padStart(2, "0") + ":" + String(mins).padStart(2, "0");
}

function addMinutesToTime(time, minutesToAdd) {
  return minutesToTime(timeToMinutes(time) + minutesToAdd);
}

function getDayOfWeek(dateString) {
  return new Date(dateString + "T00:00:00Z").getUTCDay();
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function createDateTime(date, time) {
  return date + "T" + time + ":00" + DEFAULT_TIMEZONE_OFFSET;
}

function sanitizeAppointment(appointment, db) {
  const client = db.users.find(function (user) {
    return user.id === appointment.clientId;
  });

  const therapist = db.therapists.find(function (item) {
    return item.id === appointment.therapistId;
  });

  const therapistUser = therapist
    ? db.users.find(function (user) {
      return user.id === therapist.userId;
    })
    : null;

  const service = db.services.find(function (item) {
    return item.id === appointment.serviceId;
  });

  const location = db.locations.find(function (item) {
    return item.id === appointment.locationId;
  });

  const room = (db.rooms || []).find(function (item) {
    return item.id === appointment.roomId;
  });

  return {
    id: appointment.id,
    clientId: appointment.clientId,
    clientName: client ? client.name : null,
    clientEmail: client ? client.email : null,
    therapistId: appointment.therapistId,
    therapistName: therapistUser ? therapistUser.name : null,
    serviceId: appointment.serviceId,
    serviceName: service ? service.name : null,
    locationId: appointment.locationId,
    locationName: location ? location.name : null,
    roomId: appointment.roomId || null,
    roomName: room ? room.name : null,
    appointmentType: appointment.appointmentType,
    date: appointment.date,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    blockedStartTime: appointment.blockedStartTime,
    blockedEndTime: appointment.blockedEndTime,
    priceSnapshot: appointment.priceSnapshot,
    currencySnapshot: appointment.currencySnapshot,
    status: appointment.status,
    notes: appointment.notes || "",
    createdBy: appointment.createdBy,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt || null,
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
    status: entry.status,
    notes: entry.notes || "",
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt || null,
  };
}

function waitlistTimeMatches(entry, startTime) {
  if (!entry.preferredStartTime && !entry.preferredEndTime) {
    return true;
  }

  const slotMinutes = timeToMinutes(startTime);

  if (entry.preferredStartTime && entry.preferredEndTime) {
    return (
      slotMinutes >= timeToMinutes(entry.preferredStartTime) &&
      slotMinutes < timeToMinutes(entry.preferredEndTime)
    );
  }

  if (entry.preferredStartTime) {
    return slotMinutes >= timeToMinutes(entry.preferredStartTime);
  }

  if (entry.preferredEndTime) {
    return slotMinutes < timeToMinutes(entry.preferredEndTime);
  }

  return true;
}

function getMatchingWaitlistForSlot(db, slotData) {
  if (!db.waitlist) return [];

  return db.waitlist
    .filter(function (entry) {
      return (
        entry.status === "active" &&
        entry.serviceId === slotData.serviceId &&
        entry.locationId === slotData.locationId &&
        entry.appointmentType === slotData.appointmentType &&
        entry.preferredDate === slotData.date &&
        waitlistTimeMatches(entry, slotData.startTime)
      );
    })
    .map(function (entry) {
      return sanitizeWaitlistEntry(entry, db);
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

function getActiveClient(db, clientId) {
  return db.users.find(function (user) {
    return (
      user.id === clientId &&
      user.role === USER_ROLES.CLIENT &&
      user.status === "active"
    );
  });
}

function matchesOptionalList(list, value) {
  if (!list || !Array.isArray(list) || list.length === 0) {
    return true;
  }

  return list.includes(value);
}

function getEligibleTherapists(
  db,
  serviceId,
  locationId,
  appointmentType,
  specificTherapistId,
) {
  const assignments = db.therapistServices.filter(function (assignment) {
    return (
      assignment.serviceId === serviceId &&
      assignment.status === "active" &&
      matchesOptionalList(assignment.locationIds, locationId) &&
      matchesOptionalList(assignment.appointmentTypes, appointmentType)
    );
  });

  const therapistIds = Array.from(
    new Set(
      assignments.map(function (assignment) {
        return assignment.therapistId;
      }),
    ),
  );

  return therapistIds
    .map(function (therapistId) {
      return db.therapists.find(function (therapist) {
        return therapist.id === therapistId;
      });
    })
    .filter(Boolean)
    .filter(function (therapist) {
      if (specificTherapistId && therapist.id !== specificTherapistId) {
        return false;
      }

      if (therapist.profileStatus !== "active") {
        return false;
      }

      if (!matchesOptionalList(therapist.appointmentTypes, appointmentType)) {
        return false;
      }

      const therapistUser = db.users.find(function (user) {
        return user.id === therapist.userId;
      });

      return therapistUser && therapistUser.status === "active";
    });
}

function getServiceBlockedMinutes(service) {
  return (
    service.durationMinutes +
    (service.bufferBeforeMinutes || 0) +
    (service.bufferAfterMinutes || 0)
  );
}

function computeAppointmentTimes(service, startTime) {
  const bufferBefore = service.bufferBeforeMinutes || 0;
  const bufferAfter = service.bufferAfterMinutes || 0;
  const duration = service.durationMinutes;

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = startMinutes + duration;
  const blockedStartMinutes = startMinutes - bufferBefore;
  const blockedEndMinutes = endMinutes + bufferAfter;

  return {
    startMinutes,
    endMinutes,
    blockedStartMinutes,
    blockedEndMinutes,
    endTime: minutesToTime(endMinutes),
    blockedStartTime: minutesToTime(blockedStartMinutes),
    blockedEndTime: minutesToTime(blockedEndMinutes),
  };
}

function therapistHasWeeklyAvailability(
  db,
  therapistId,
  date,
  service,
  startTime,
  locationId,
  appointmentType,
) {
  const dayOfWeek = getDayOfWeek(date);
  const times = computeAppointmentTimes(service, startTime);

  if (times.blockedStartMinutes < 0 || times.blockedEndMinutes > 24 * 60) {
    return false;
  }

  return db.therapistAvailability.some(function (rule) {
    if (rule.status !== "active") return false;
    if (rule.therapistId !== therapistId) return false;
    if (rule.dayOfWeek !== dayOfWeek) return false;

    if (!matchesOptionalList(rule.locationIds, locationId)) return false;
    if (!matchesOptionalList(rule.appointmentTypes, appointmentType))
      return false;

    const ruleStart = timeToMinutes(rule.startTime);
    const ruleEnd = timeToMinutes(rule.endTime);

    return (
      times.blockedStartMinutes >= ruleStart &&
      times.blockedEndMinutes <= ruleEnd
    );
  });
}

function therapistHasTimeOff(db, therapistId, date, service, startTime) {
  const times = computeAppointmentTimes(service, startTime);

  const slotStartDateTime = new Date(
    createDateTime(date, times.blockedStartTime),
  ).getTime();

  const slotEndDateTime = new Date(
    createDateTime(date, times.blockedEndTime),
  ).getTime();

  return db.therapistTimeOff.some(function (block) {
    if (block.status !== "active") return false;
    if (block.therapistId !== therapistId) return false;

    const blockStart = new Date(block.startDateTime).getTime();
    const blockEnd = new Date(block.endDateTime).getTime();

    return slotStartDateTime < blockEnd && slotEndDateTime > blockStart;
  });
}

function therapistHasAppointmentConflict(
  db,
  therapistId,
  date,
  service,
  startTime,
) {
  const times = computeAppointmentTimes(service, startTime);

  return db.appointments.some(function (appointment) {
    if (appointment.therapistId !== therapistId) return false;
    if (appointment.date !== date) return false;
    if (["cancelled", "no_show"].includes(appointment.status)) return false;

    const existingStart = timeToMinutes(
      appointment.blockedStartTime || appointment.startTime,
    );

    const existingEnd = timeToMinutes(
      appointment.blockedEndTime || appointment.endTime,
    );

    return rangesOverlap(
      times.blockedStartMinutes,
      times.blockedEndMinutes,
      existingStart,
      existingEnd,
    );
  });
}

function isTherapistAvailableForSlot(
  db,
  therapistId,
  date,
  service,
  locationId,
  appointmentType,
  startTime,
) {
  const hasWeeklyAvailability = therapistHasWeeklyAvailability(
    db,
    therapistId,
    date,
    service,
    startTime,
    locationId,
    appointmentType,
  );

  if (!hasWeeklyAvailability) return false;

  const hasTimeOff = therapistHasTimeOff(
    db,
    therapistId,
    date,
    service,
    startTime,
  );

  if (hasTimeOff) return false;

  const hasConflict = therapistHasAppointmentConflict(
    db,
    therapistId,
    date,
    service,
    startTime,
  );

  if (hasConflict) return false;

  return true;
}

function countTherapistAppointments(db, therapistId, date) {
  return db.appointments.filter(function (appointment) {
    return (
      appointment.therapistId === therapistId &&
      appointment.date === date &&
      !["cancelled", "no_show"].includes(appointment.status)
    );
  }).length;
}

function chooseTherapist(db, availableTherapists, date) {
  const sorted = availableTherapists.slice().sort(function (a, b) {
    const countA = countTherapistAppointments(db, a.id, date);
    const countB = countTherapistAppointments(db, b.id, date);

    return countA - countB;
  });

  return sorted[0];
}

function getActiveRoomsForLocation(db, locationId) {
  return (db.rooms || []).filter(function (room) {
    return room.locationId === locationId && room.status === "active";
  });
}

function roomHasAppointmentConflict(db, roomId, date, service, startTime) {
  const times = computeAppointmentTimes(service, startTime);

  return (db.appointments || []).some(function (appointment) {
    if (appointment.roomId !== roomId) return false;
    if (appointment.date !== date) return false;
    if (["cancelled", "no_show"].includes(appointment.status)) return false;

    const existingStart = timeToMinutes(
      appointment.blockedStartTime || appointment.startTime,
    );

    const existingEnd = timeToMinutes(
      appointment.blockedEndTime || appointment.endTime,
    );

    return rangesOverlap(
      times.blockedStartMinutes,
      times.blockedEndMinutes,
      existingStart,
      existingEnd,
    );
  });
}

function getAvailableRoomsForSlot(db, locationId, date, service, startTime) {
  const activeRooms = getActiveRoomsForLocation(db, locationId);

  return activeRooms.filter(function (room) {
    return !roomHasAppointmentConflict(db, room.id, date, service, startTime);
  });
}

function chooseRoom(availableRooms) {
  return availableRooms[0];
}

function buildAvailableSlots(db, options) {
  const service = getActiveService(db, options.serviceId);
  const location = getActiveLocation(db, options.locationId);

  if (!service || !location) {
    return [];
  }

  const eligibleTherapists = getEligibleTherapists(
    db,
    options.serviceId,
    options.locationId,
    options.appointmentType,
    options.therapistId,
  );

  const slotMap = new Map();
  const dayOfWeek = getDayOfWeek(options.date);
  const slotIntervalMinutes = options.slotIntervalMinutes || 30;

  eligibleTherapists.forEach(function (therapist) {
    const rules = db.therapistAvailability.filter(function (rule) {
      return (
        rule.status === "active" &&
        rule.therapistId === therapist.id &&
        rule.dayOfWeek === dayOfWeek &&
        matchesOptionalList(rule.locationIds, options.locationId) &&
        matchesOptionalList(rule.appointmentTypes, options.appointmentType)
      );
    });

    rules.forEach(function (rule) {
      const ruleStart = timeToMinutes(rule.startTime);
      const ruleEnd = timeToMinutes(rule.endTime);

      const bufferBefore = service.bufferBeforeMinutes || 0;
      const totalBlocked = getServiceBlockedMinutes(service);

      const firstStart = ruleStart + bufferBefore;
      const lastStart = ruleEnd - totalBlocked + bufferBefore;

      for (
        let current = firstStart;
        current <= lastStart;
        current += slotIntervalMinutes
      ) {
        const startTime = minutesToTime(current);

        const isAvailable = isTherapistAvailableForSlot(
          db,
          therapist.id,
          options.date,
          service,
          options.locationId,
          options.appointmentType,
          startTime,
        );

        if (!isAvailable) continue;

        if (!slotMap.has(startTime)) {
          const appointmentTimes = computeAppointmentTimes(service, startTime);

          slotMap.set(startTime, {
            date: options.date,
            startTime,
            endTime: appointmentTimes.endTime,
            serviceId: service.id,
            serviceName: service.name,
            locationId: location.id,
            locationName: location.name,
            appointmentType: options.appointmentType,
            availableTherapistIds: [],
          });
        }

        slotMap.get(startTime).availableTherapistIds.push(therapist.id);
      }
    });
  });

  return Array.from(slotMap.values())
    .map(function (slot) {
      let availableRooms = [];

      if (slot.appointmentType === "in_person") {
        availableRooms = getAvailableRoomsForSlot(
          db,
          slot.locationId,
          slot.date,
          service,
          slot.startTime,
        );

        if (availableRooms.length === 0) {
          return null;
        }
      }

      const availableRoomIds = availableRooms.map(function (room) {
        return room.id;
      });

      const availableRoomCount =
        slot.appointmentType === "in_person" ? availableRooms.length : null;

      const maxBookableCount =
        slot.appointmentType === "in_person"
          ? Math.min(slot.availableTherapistIds.length, availableRooms.length)
          : slot.availableTherapistIds.length;

      if (maxBookableCount <= 0) {
        return null;
      }

      return {
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        serviceId: slot.serviceId,
        serviceName: slot.serviceName,
        locationId: slot.locationId,
        locationName: slot.locationName,
        appointmentType: slot.appointmentType,
        availableTherapistCount: slot.availableTherapistIds.length,
        availableTherapistIds: slot.availableTherapistIds,
        availableRoomCount,
        availableRoomIds,
        maxBookableCount,
      };
    })
    .filter(Boolean)
    .sort(function (a, b) {
      return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    });
}

// GET available appointment slots
router.get(
  "/slots",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER, USER_ROLES.CLIENT),
  async function (req, res) {
    const result = slotQuerySchema.safeParse(req.query);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid query",
        errors: result.error.flatten(),
      });
    }

    const db = await loadSchedulingSnapshot();

    const service = getActiveService(db, result.data.serviceId);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Active service not found",
      });
    }

    const location = getActiveLocation(db, result.data.locationId);
    if (!location) {
      return res.status(404).json({
        success: false,
        message: "Active location not found",
      });
    }

    const slots = buildAvailableSlots(db, result.data);

    return res.json({
      success: true,
      count: slots.length,
      slots,
    });
  },
);

// CREATE appointment
router.post(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER, USER_ROLES.CLIENT),
  async function (req, res) {
    const result = createAppointmentSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: result.error.flatten(),
      });
    }

    
    const db = await loadSchedulingSnapshot();

    const service = getActiveService(db, result.data.serviceId);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Active service not found",
      });
    }

    const location = getActiveLocation(db, result.data.locationId);
    if (!location) {
      return res.status(404).json({
        success: false,
        message: "Active location not found",
      });
    }

    let clientId = result.data.clientId;

    if (req.user.role === USER_ROLES.CLIENT) {
      clientId = req.user.id;
    }

    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: "clientId is required for admin or office manager booking",
      });
    }

    const client = getActiveClient(db, clientId);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Active client user not found",
      });
    }

    const eligibleTherapists = getEligibleTherapists(
      db,
      result.data.serviceId,
      result.data.locationId,
      result.data.appointmentType,
      result.data.therapistId,
    );

    const availableTherapists = eligibleTherapists.filter(function (therapist) {
      return isTherapistAvailableForSlot(
        db,
        therapist.id,
        result.data.date,
        service,
        result.data.locationId,
        result.data.appointmentType,
        result.data.startTime,
      );
    });

    if (!availableTherapists.length) {
      return res.status(409).json({
        success: false,
        message: "No therapist available for this slot",
      });
    }

    const assignedTherapist = result.data.therapistId
      ? availableTherapists[0]
      : chooseTherapist(db, availableTherapists, result.data.date);

    let assignedRoom = null;

    if (result.data.appointmentType === "in_person") {
      const availableRooms = getAvailableRoomsForSlot(
        db,
        result.data.locationId,
        result.data.date,
        service,
        result.data.startTime,
      );

      if (!availableRooms.length) {
        return res.status(409).json({
          success: false,
          message: "No room available for this slot",
        });
      }

      assignedRoom = chooseRoom(availableRooms);
    }

    const appointmentTimes = computeAppointmentTimes(
      service,
      result.data.startTime,
    );

    const now = new Date().toISOString();

    const appointment = {
      id: createId("appointment"),
      clientId,
      therapistId: assignedTherapist.id,
      serviceId: service.id,
      locationId: location.id,
      roomId: assignedRoom ? assignedRoom.id : null,
      appointmentType: result.data.appointmentType,
      date: result.data.date,
      startTime: result.data.startTime,
      endTime: appointmentTimes.endTime,
      blockedStartTime: appointmentTimes.blockedStartTime,
      blockedEndTime: appointmentTimes.blockedEndTime,
      startDateTime: createDateTime(result.data.date, result.data.startTime),
      endDateTime: createDateTime(result.data.date, appointmentTimes.endTime),
      status: "confirmed",
      priceSnapshot: service.currentPrice,
      currencySnapshot: service.currency || "USD",
      notes: result.data.notes || "",
      createdBy: req.user.email,
      createdAt: now,
      updatedAt: null,
    };

    const savedAppointment = await prisma.appointment.create({
      data: {
        id: appointment.id,
        clientId: appointment.clientId,
        therapistId: appointment.therapistId,
        serviceId: appointment.serviceId,
        locationId: appointment.locationId,
        roomId: appointment.roomId,
        appointmentType: appointment.appointmentType,
        date: appointment.date,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        blockedStartTime: appointment.blockedStartTime,
        blockedEndTime: appointment.blockedEndTime,
        startDateTime: appointment.startDateTime,
        endDateTime: appointment.endDateTime,
        status: appointment.status,
        priceSnapshot: appointment.priceSnapshot,
        currencySnapshot: appointment.currencySnapshot,
        notes: appointment.notes,
        createdBy: appointment.createdBy
      }
    });

    appointment.createdAt = toIso(savedAppointment.createdAt);
    appointment.updatedAt = toIso(savedAppointment.updatedAt);

    db.appointments.push(appointment);
    upsertJsonAppointment(savedAppointment);

    await addPrismaAuditLog(
      "APPOINTMENT_CREATED",
      req.user.email,
      `Appointment booked for client ${client.email} with therapist profile ${assignedTherapist.id}`
    );

    return res.status(201).json({
      success: true,
      message: "Appointment booked successfully",
      appointment: sanitizeAppointment(appointment, db),
    });
  },
);

// GET all appointments for admin / office manager
router.get(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    const db = await loadSchedulingSnapshot();

    let appointments = db.appointments;

    if (req.query.date) {
      appointments = appointments.filter(function (appointment) {
        return appointment.date === req.query.date;
      });
    }

    if (req.query.therapistId) {
      appointments = appointments.filter(function (appointment) {
        return appointment.therapistId === req.query.therapistId;
      });
    }

    if (req.query.clientId) {
      appointments = appointments.filter(function (appointment) {
        return appointment.clientId === req.query.clientId;
      });
    }

    const result = appointments.map(function (appointment) {
      return sanitizeAppointment(appointment, db);
    });

    return res.json({
      success: true,
      count: result.length,
      appointments: result,
    });
  },
);

// GET my appointments
router.get(
  "/me",
  authMiddleware,
  allowRoles(USER_ROLES.CLIENT, USER_ROLES.THERAPIST),
  async function (req, res) {
    const db = await loadSchedulingSnapshot();

    let appointments = [];

    if (req.user.role === USER_ROLES.CLIENT) {
      appointments = db.appointments.filter(function (appointment) {
        return appointment.clientId === req.user.id;
      });
    }

    if (req.user.role === USER_ROLES.THERAPIST) {
      const therapistProfile = db.therapists.find(function (therapist) {
        return therapist.userId === req.user.id;
      });

      if (!therapistProfile) {
        return res.status(404).json({
          success: false,
          message: "Therapist profile not found",
        });
      }

      appointments = db.appointments.filter(function (appointment) {
        return appointment.therapistId === therapistProfile.id;
      });
    }

    const result = appointments.map(function (appointment) {
      return sanitizeAppointment(appointment, db);
    });

    return res.json({
      success: true,
      count: result.length,
      appointments: result,
    });
  },
);

router.get(
  "/debug-slots",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    const db = await loadSchedulingSnapshot();

    const date = req.query.date;
    const serviceId = req.query.serviceId;
    const locationId = req.query.locationId;
    const appointmentType = req.query.appointmentType;

    const service = (db.services || []).find(function (item) {
      return item.id === serviceId;
    });

    const location = (db.locations || []).find(function (item) {
      return item.id === locationId;
    });

    const rooms = (db.rooms || []).filter(function (room) {
      return room.locationId === locationId;
    });

    const activeRooms = rooms.filter(function (room) {
      return room.status === "active";
    });

    const therapistAssignments = (db.therapistServices || []).filter(
      function (assignment) {
        return (
          assignment.serviceId === serviceId &&
          assignment.status === "active" &&
          (assignment.locationIds || []).includes(locationId) &&
          (assignment.appointmentTypes || []).includes(appointmentType)
        );
      },
    );

    const therapistIdsFromAssignments = therapistAssignments.map(
      function (assignment) {
        return assignment.therapistId;
      },
    );

    const therapists = (db.therapists || []).filter(function (therapist) {
      return therapistIdsFromAssignments.includes(therapist.id);
    });

    const jsDate = new Date(date + "T00:00:00");
    const dayOfWeek = jsDate.getDay();

    const weeklyAvailability = (
      db.weeklyAvailability ||
      db.availability ||
      db.therapistAvailability ||
      []
    ).filter(function (availability) {
      return (
        therapistIdsFromAssignments.includes(availability.therapistId) &&
        Number(availability.dayOfWeek) === dayOfWeek &&
        availability.status === "active"
      );
    });

    const matchingAvailabilityForLocationAndType = weeklyAvailability.filter(
      function (availability) {
        const locationMatches =
          availability.locationId === locationId ||
          (availability.locationIds || []).includes(locationId);

        const typeMatches =
          !availability.appointmentTypes ||
          availability.appointmentTypes.length === 0 ||
          availability.appointmentTypes.includes(appointmentType);

        return locationMatches && typeMatches;
      },
    );

    return res.json({
      success: true,
      request: {
        date,
        dayOfWeek,
        serviceId,
        locationId,
        appointmentType,
      },
      checks: {
        serviceFound: Boolean(service),
        serviceStatus: service ? service.status : null,
        serviceAppointmentTypes: service ? service.appointmentTypes : null,

        locationFound: Boolean(location),
        locationName: location ? location.name : null,
        locationStatus: location ? location.status : null,
        locationType: location ? location.locationType : null,

        totalRoomsForLocation: rooms.length,
        activeRoomsForLocation: activeRooms.length,
        rooms,

        matchingTherapistAssignments: therapistAssignments.length,
        therapistAssignments,

        matchingTherapists: therapists.length,
        therapists,

        weeklyAvailabilityForDay: weeklyAvailability.length,
        weeklyAvailability,

        matchingAvailabilityForLocationAndType:
          matchingAvailabilityForLocationAndType.length,
        matchingAvailabilityForLocationAndType,
      },
    });
  },
);

// GET single appointment by id
router.get(
  "/:id",
  authMiddleware,
  allowRoles(
    USER_ROLES.ADMIN,
    USER_ROLES.OFFICE_MANAGER,
    USER_ROLES.CLIENT,
    USER_ROLES.THERAPIST,
  ),
  async function (req, res) {
    const db = await loadSchedulingSnapshot();

    const appointment = db.appointments.find(function (item) {
      return item.id === req.params.id;
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    if (
      req.user.role === USER_ROLES.CLIENT &&
      appointment.clientId !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "You can only view your own appointment",
      });
    }

    if (req.user.role === USER_ROLES.THERAPIST) {
      const therapistProfile = db.therapists.find(function (therapist) {
        return therapist.userId === req.user.id;
      });

      if (
        !therapistProfile ||
        appointment.therapistId !== therapistProfile.id
      ) {
        return res.status(403).json({
          success: false,
          message: "You can only view your own therapist appointments",
        });
      }
    }

    return res.json({
      success: true,
      appointment: sanitizeAppointment(appointment, db),
      rescheduleHistory: appointment.rescheduleHistory || [],
    });
  },
);

// RESCHEDULE appointment
router.patch(
  "/:id/reschedule",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER, USER_ROLES.CLIENT),
  async function (req, res) {
    const result = rescheduleAppointmentSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid reschedule input",
        errors: result.error.flatten(),
      });
    }

    const db = await loadSchedulingSnapshot();

    const appointment = db.appointments.find(function (item) {
      return item.id === req.params.id;
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    if (
      req.user.role === USER_ROLES.CLIENT &&
      appointment.clientId !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "You can only reschedule your own appointment",
      });
    }

    if (["cancelled", "completed", "no_show"].includes(appointment.status)) {
      return res.status(400).json({
        success: false,
        message: "Only confirmed appointments can be rescheduled",
      });
    }

    const service = getActiveService(db, appointment.serviceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Active service not found",
      });
    }

    const location = getActiveLocation(db, appointment.locationId);

    if (!location) {
      return res.status(404).json({
        success: false,
        message: "Active location not found",
      });
    }

    // Important:
    // While checking availability, temporarily remove this appointment
    // so it does not conflict with itself.
    const tempDb = {
      ...db,
      appointments: db.appointments.filter(function (item) {
        return item.id !== appointment.id;
      }),
    };

    const allowDifferentTherapist =
      result.data.allowDifferentTherapist !== false;

    let assignedTherapist = null;

    // Case 1: Admin/client selected specific therapist
    if (result.data.therapistId) {
      const eligibleTherapists = getEligibleTherapists(
        tempDb,
        appointment.serviceId,
        appointment.locationId,
        appointment.appointmentType,
        result.data.therapistId,
      );

      const availableTherapists = eligibleTherapists.filter(
        function (therapist) {
          return isTherapistAvailableForSlot(
            tempDb,
            therapist.id,
            result.data.date,
            service,
            appointment.locationId,
            appointment.appointmentType,
            result.data.startTime,
          );
        },
      );

      if (!availableTherapists.length) {
        return res.status(409).json({
          success: false,
          message: "Selected therapist is not available for this new slot",
        });
      }

      assignedTherapist = availableTherapists[0];
    }

    // Case 2: No therapist selected, try same therapist first
    if (!assignedTherapist) {
      const currentTherapistEligible = getEligibleTherapists(
        tempDb,
        appointment.serviceId,
        appointment.locationId,
        appointment.appointmentType,
        appointment.therapistId,
      );

      const currentTherapistAvailable = currentTherapistEligible.find(
        function (therapist) {
          return isTherapistAvailableForSlot(
            tempDb,
            therapist.id,
            result.data.date,
            service,
            appointment.locationId,
            appointment.appointmentType,
            result.data.startTime,
          );
        },
      );

      if (currentTherapistAvailable) {
        assignedTherapist = currentTherapistAvailable;
      }
    }

    // Case 3: Same therapist not available, assign another therapist if allowed
    if (!assignedTherapist && allowDifferentTherapist) {
      const eligibleTherapists = getEligibleTherapists(
        tempDb,
        appointment.serviceId,
        appointment.locationId,
        appointment.appointmentType,
      );

      const availableTherapists = eligibleTherapists.filter(
        function (therapist) {
          return isTherapistAvailableForSlot(
            tempDb,
            therapist.id,
            result.data.date,
            service,
            appointment.locationId,
            appointment.appointmentType,
            result.data.startTime,
          );
        },
      );

      if (availableTherapists.length) {
        assignedTherapist = chooseTherapist(
          tempDb,
          availableTherapists,
          result.data.date,
        );
      }
    }

    if (!assignedTherapist) {
      return res.status(409).json({
        success: false,
        message: "No therapist available for the new slot",
      });
    }

    const oldSchedule = {
      therapistId: appointment.therapistId,
      roomId: appointment.roomId || null,
      serviceId: appointment.serviceId,
      locationId: appointment.locationId,
      appointmentType: appointment.appointmentType,
      date: appointment.date,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
    };

    let assignedRoom = null;

    if (appointment.appointmentType === "in_person") {
      const availableRooms = getAvailableRoomsForSlot(
        tempDb,
        appointment.locationId,
        result.data.date,
        service,
        result.data.startTime,
      );

      if (!availableRooms.length) {
        return res.status(409).json({
          success: false,
          message: "No room available for the new slot",
        });
      }

      assignedRoom = chooseRoom(availableRooms);
    }

    const appointmentTimes = computeAppointmentTimes(
      service,
      result.data.startTime,
    );

    if (!appointment.rescheduleHistory) {
      appointment.rescheduleHistory = [];
    }

    appointment.rescheduleHistory.push({
      oldSchedule,
      changedBy: req.user.email,
      changedAt: new Date().toISOString(),
    });

    appointment.therapistId = assignedTherapist.id;
    appointment.roomId = assignedRoom ? assignedRoom.id : null;
    appointment.date = result.data.date;
    appointment.startTime = result.data.startTime;
    appointment.endTime = appointmentTimes.endTime;
    appointment.blockedStartTime = appointmentTimes.blockedStartTime;
    appointment.blockedEndTime = appointmentTimes.blockedEndTime;
    appointment.startDateTime = createDateTime(
      result.data.date,
      result.data.startTime,
    );
    appointment.endDateTime = createDateTime(
      result.data.date,
      appointmentTimes.endTime,
    );
    appointment.status = "confirmed";
    appointment.updatedAt = new Date().toISOString();

    if (result.data.notes) {
      appointment.notes = result.data.notes;
    }

    const savedAppointment = await prisma.appointment.update({
      where: {
        id: appointment.id
      },
      data: {
        therapistId: appointment.therapistId,
        roomId: appointment.roomId || null,
        date: appointment.date,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        blockedStartTime: appointment.blockedStartTime,
        blockedEndTime: appointment.blockedEndTime,
        startDateTime: appointment.startDateTime,
        endDateTime: appointment.endDateTime,
        status: appointment.status,
        notes: appointment.notes || "",
        updatedAt: new Date()
      }
    });

    appointment.updatedAt = toIso(savedAppointment.updatedAt);

    upsertJsonAppointment(savedAppointment);

    await addPrismaAuditLog(
      "APPOINTMENT_RESCHEDULED",
      req.user.email,
      `Appointment ${appointment.id} rescheduled from ${oldSchedule.date} ${oldSchedule.startTime} to ${appointment.date} ${appointment.startTime}`
    );

    const matchingWaitlist = getMatchingWaitlistForSlot(db, oldSchedule);

    return res.json({
      success: true,
      message: "Appointment rescheduled successfully",
      appointment: sanitizeAppointment(appointment, db),
      oldSchedule,
      matchingWaitlistCount: matchingWaitlist.length,
      matchingWaitlist,
    });
  },
);

// UPDATE appointment status
router.patch(
  "/:id/status",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER, USER_ROLES.CLIENT),
  async function (req, res) {
    const result = updateAppointmentStatusSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
        errors: result.error.flatten(),
      });
    }

    const db = await loadSchedulingSnapshot();

    const appointment = db.appointments.find(function (item) {
      return item.id === req.params.id;
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    if (
      req.user.role === USER_ROLES.CLIENT &&
      appointment.clientId !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own appointment",
      });
    }

    if (
      req.user.role === USER_ROLES.CLIENT &&
      !["cancelled"].includes(result.data.status)
    ) {
      return res.status(403).json({
        success: false,
        message: "Client can only cancel appointment from this endpoint",
      });
    }

    const oldSlot = {
      serviceId: appointment.serviceId,
      locationId: appointment.locationId,
      appointmentType: appointment.appointmentType,
      date: appointment.date,
      startTime: appointment.startTime,
    };

    appointment.status = result.data.status;
    appointment.statusReason = result.data.reason || "";
    appointment.updatedAt = new Date().toISOString();

    const savedAppointment = await prisma.appointment.update({
      where: {
        id: appointment.id
      },
      data: {
        status: appointment.status,
        notes: appointment.notes || "",
        updatedAt: new Date()
      }
    });

    appointment.updatedAt = toIso(savedAppointment.updatedAt);

    upsertJsonAppointment(savedAppointment);

    await addPrismaAuditLog(
      "APPOINTMENT_STATUS_UPDATED",
      req.user.email,
      `Appointment ${appointment.id} status changed to ${appointment.status}`
    );

    let matchingWaitlist = [];

    if (result.data.status === "cancelled") {
      matchingWaitlist = getMatchingWaitlistForSlot(db, oldSlot);
    }

    return res.json({
      success: true,
      message: "Appointment status updated successfully",
      appointment: sanitizeAppointment(appointment, db),
      matchingWaitlistCount: matchingWaitlist.length,
      matchingWaitlist,
    });
  },
);

module.exports = router;