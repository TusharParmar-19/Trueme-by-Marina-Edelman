const express = require("express");

const { loadDB } = require("../../utils/db");
const {
  authMiddleware,
  allowRoles
} = require("../../middleware/authMiddleware");

const { USER_ROLES } = require("../users/user.roles");

const router = express.Router();

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function isActiveAppointment(appointment) {
  return !["cancelled", "no_show"].includes(appointment.status);
}

function getUserById(db, userId) {
  return db.users.find(function (user) {
    return user.id === userId;
  });
}

function getTherapistUser(db, therapistId) {
  const therapist = db.therapists.find(function (item) {
    return item.id === therapistId;
  });

  if (!therapist) return null;

  return db.users.find(function (user) {
    return user.id === therapist.userId;
  });
}

function getServiceById(db, serviceId) {
  return db.services.find(function (service) {
    return service.id === serviceId;
  });
}

function getLocationById(db, locationId) {
  return db.locations.find(function (location) {
    return location.id === locationId;
  });
}

function appointmentSummary(appointment, db) {
  const client = getUserById(db, appointment.clientId);
  const therapistUser = getTherapistUser(db, appointment.therapistId);
  const service = getServiceById(db, appointment.serviceId);
  const location = getLocationById(db, appointment.locationId);

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
    status: appointment.status,
    priceSnapshot: appointment.priceSnapshot,
    currencySnapshot: appointment.currencySnapshot
  };
}

function waitlistSummary(entry, db) {
  const service = getServiceById(db, entry.serviceId);
  const location = getLocationById(db, entry.locationId);

  return {
    id: entry.id,
    clientId: entry.clientId,
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
    updatedAt: entry.updatedAt || null
  };
}

function sortAppointments(a, b) {
  const aValue = a.date + " " + a.startTime;
  const bValue = b.date + " " + b.startTime;

  if (aValue < bValue) return -1;
  if (aValue > bValue) return 1;
  return 0;
}

function getAppointmentList(db, appointments, limit) {
  return appointments
    .slice()
    .sort(sortAppointments)
    .slice(0, limit || 20)
    .map(function (appointment) {
      return appointmentSummary(appointment, db);
    });
}

// ADMIN / OFFICE MANAGER DASHBOARD
router.get(
  "/admin",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const db = loadDB();

    const date = req.query.date || getToday();

    const activeUsers = db.users.filter(function (user) {
      return user.status === "active";
    });

    const todayAppointments = db.appointments.filter(function (appointment) {
      return appointment.date === date && isActiveAppointment(appointment);
    });

    const upcomingAppointments = db.appointments.filter(function (appointment) {
      return appointment.date >= date && isActiveAppointment(appointment);
    });

    const activeWaitlist = db.waitlist.filter(function (entry) {
      return entry.status === "active";
    });

    const therapistWorkload = db.therapists.map(function (therapist) {
      const therapistUser = getUserById(db, therapist.userId);

      const todayCount = todayAppointments.filter(function (appointment) {
        return appointment.therapistId === therapist.id;
      }).length;

      const upcomingCount = upcomingAppointments.filter(function (appointment) {
        return appointment.therapistId === therapist.id;
      }).length;

      return {
        therapistId: therapist.id,
        therapistName: therapistUser ? therapistUser.name : null,
        therapistEmail: therapistUser ? therapistUser.email : null,
        profileStatus: therapist.profileStatus,
        todayAppointments: todayCount,
        upcomingAppointments: upcomingCount
      };
    });

    return res.json({
      success: true,
      date,
      summary: {
        totalUsers: db.users.length,
        activeUsers: activeUsers.length,
        totalClients: db.users.filter(function (user) {
          return user.role === USER_ROLES.CLIENT;
        }).length,
        totalTherapistUsers: db.users.filter(function (user) {
          return user.role === USER_ROLES.THERAPIST;
        }).length,
        totalOfficeManagers: db.users.filter(function (user) {
          return user.role === USER_ROLES.OFFICE_MANAGER;
        }).length,
        totalTherapistProfiles: db.therapists.length,
        activeTherapistProfiles: db.therapists.filter(function (therapist) {
          return therapist.profileStatus === "active";
        }).length,
        activeServices: db.services.filter(function (service) {
          return service.status === "active";
        }).length,
        activeLocations: db.locations.filter(function (location) {
          return location.status === "active";
        }).length,
        todayAppointments: todayAppointments.length,
        upcomingAppointments: upcomingAppointments.length,
        activeWaitlist: activeWaitlist.length
      },
      todayAppointments: getAppointmentList(db, todayAppointments, 20),
      upcomingAppointments: getAppointmentList(db, upcomingAppointments, 20),
      therapistWorkload
    });
  }
);

// THERAPIST DASHBOARD
router.get(
  "/therapist",
  authMiddleware,
  allowRoles(USER_ROLES.THERAPIST),
  function (req, res) {
    const db = loadDB();

    const date = req.query.date || getToday();

    const therapistProfile = db.therapists.find(function (therapist) {
      return therapist.userId === req.user.id;
    });

    if (!therapistProfile) {
      return res.status(404).json({
        success: false,
        message: "Therapist profile not found"
      });
    }

    const therapistAppointments = db.appointments.filter(function (appointment) {
      return (
        appointment.therapistId === therapistProfile.id &&
        isActiveAppointment(appointment)
      );
    });

    const todayAppointments = therapistAppointments.filter(function (
      appointment
    ) {
      return appointment.date === date;
    });

    const upcomingAppointments = therapistAppointments.filter(function (
      appointment
    ) {
      return appointment.date >= date;
    });

    const assignedClientIds = Array.from(
      new Set(
        therapistAppointments.map(function (appointment) {
          return appointment.clientId;
        })
      )
    );

    const assignedClients = assignedClientIds
      .map(function (clientId) {
        const client = getUserById(db, clientId);

        if (!client) return null;

        return {
          id: client.id,
          name: client.name,
          email: client.email,
          status: client.status
        };
      })
      .filter(Boolean);

    return res.json({
      success: true,
      date,
      therapist: {
        id: therapistProfile.id,
        userId: therapistProfile.userId,
        title: therapistProfile.title,
        profileStatus: therapistProfile.profileStatus
      },
      summary: {
        todayAppointments: todayAppointments.length,
        upcomingAppointments: upcomingAppointments.length,
        assignedClients: assignedClients.length
      },
      todayAppointments: getAppointmentList(db, todayAppointments, 20),
      upcomingAppointments: getAppointmentList(db, upcomingAppointments, 20),
      assignedClients
    });
  }
);

// CLIENT DASHBOARD
router.get(
  "/client",
  authMiddleware,
  allowRoles(USER_ROLES.CLIENT),
  function (req, res) {
    const db = loadDB();

    const date = req.query.date || getToday();

    const clientAppointments = db.appointments.filter(function (appointment) {
      return appointment.clientId === req.user.id;
    });

    const upcomingAppointments = clientAppointments.filter(function (
      appointment
    ) {
      return appointment.date >= date && isActiveAppointment(appointment);
    });

    const pastAppointments = clientAppointments.filter(function (appointment) {
      return appointment.date < date || appointment.status === "completed";
    });

    const waitlistEntries = db.waitlist.filter(function (entry) {
      return entry.clientId === req.user.id;
    });

    return res.json({
  success: true,
  date,
  summary: {
    upcomingAppointments: upcomingAppointments.length,
    pastAppointments: pastAppointments.length,
    activeWaitlist: waitlistEntries.filter(function (entry) {
      return entry.status === "active";
    }).length
  },
  upcomingAppointments: getAppointmentList(db, upcomingAppointments, 10),
  pastAppointments: getAppointmentList(db, pastAppointments, 10),
  waitlist: waitlistEntries.map(function (entry) {
    return waitlistSummary(entry, db);
  })
});
  }
);

module.exports = router;