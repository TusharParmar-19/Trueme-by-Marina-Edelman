const express = require("express");

const prisma = require("../../config/prisma");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { USER_ROLES } = require("../users/user.roles");

const router = express.Router();

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

async function loadCalendarSnapshot() {
    const users = await prisma.user.findMany();
    const therapists = await prisma.therapist.findMany();
    const services = await prisma.service.findMany();
    const locations = await prisma.location.findMany();
    const rooms = await prisma.room.findMany();
    const appointments = await prisma.appointment.findMany();

    return {
        users: users.map(serializePrismaRecord),
        therapists: therapists.map(serializePrismaRecord),
        services: services.map(serializePrismaRecord),
        locations: locations.map(serializePrismaRecord),
        rooms: rooms.map(serializePrismaRecord),
        appointments: appointments.map(serializePrismaRecord)
    };
}

function getUserById(db, userId) {
    return (db.users || []).find(function (user) {
        return user.id === userId;
    });
}

function getTherapistProfileByUserId(db, userId) {
    return (db.therapists || []).find(function (therapist) {
        return therapist.userId === userId;
    });
}

function getTherapistUser(db, therapistId) {
    const therapistProfile = (db.therapists || []).find(function (therapist) {
        return therapist.id === therapistId;
    });

    if (!therapistProfile) {
        return null;
    }

    return getUserById(db, therapistProfile.userId);
}

function getServiceById(db, serviceId) {
    return (db.services || []).find(function (service) {
        return service.id === serviceId;
    });
}

function getLocationById(db, locationId) {
    return (db.locations || []).find(function (location) {
        return location.id === locationId;
    });
}

function getRoomById(db, roomId) {
    return (db.rooms || []).find(function (room) {
        return room.id === roomId;
    });
}

function isDateInRange(date, startDate, endDate) {
    if (startDate && date < startDate) {
        return false;
    }

    if (endDate && date > endDate) {
        return false;
    }

    return true;
}

function buildCalendarEvent(appointment, db) {
    const client = getUserById(db, appointment.clientId);
    const therapistUser = getTherapistUser(db, appointment.therapistId);
    const service = getServiceById(db, appointment.serviceId);
    const location = getLocationById(db, appointment.locationId);
    const room = getRoomById(db, appointment.roomId);

    const clientName = client ? client.name : "Client";
    const therapistName = therapistUser ? therapistUser.name : "Therapist";
    const serviceName = service ? service.name : "Appointment";
    const locationName = location ? location.name : "";

    const roomName =
        appointment.appointmentType === "telehealth"
            ? "Online"
            : room
                ? room.name
                : "";

    return {
        id: appointment.id,
        title: `${clientName} - ${serviceName}`,
        date: appointment.date,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        start: `${appointment.date}T${appointment.startTime}:00`,
        end: `${appointment.date}T${appointment.endTime}:00`,
        status: appointment.status,
        appointmentType: appointment.appointmentType,

        clientId: appointment.clientId,
        clientName,
        clientEmail: client ? client.email : "",

        therapistId: appointment.therapistId,
        therapistName,
        therapistEmail: therapistUser ? therapistUser.email : "",

        serviceId: appointment.serviceId,
        serviceName,

        locationId: appointment.locationId,
        locationName,

        roomId: appointment.roomId || null,
        roomName,

        notes: appointment.notes || ""
    };
}

router.get("/", authMiddleware, async function (req, res) {
    try {
        const db = await loadCalendarSnapshot();

        const user = req.user;
        const startDate = req.query.startDate || "";
        const endDate = req.query.endDate || "";
        const therapistId = req.query.therapistId || "";

        if (
            user.role !== USER_ROLES.ADMIN &&
            user.role !== USER_ROLES.OFFICE_MANAGER &&
            user.role !== USER_ROLES.CLIENT &&
            user.role !== USER_ROLES.THERAPIST
        ) {
            return res.status(403).json({
                success: false,
                message: "You are not allowed to view calendar events."
            });
        }

        let appointments = (db.appointments || []).filter(function (appointment) {
            return appointment.status !== "cancelled";
        });

        appointments = appointments.filter(function (appointment) {
            return isDateInRange(appointment.date, startDate, endDate);
        });

        // Admin and office manager can optionally filter by therapist
        if (
            (user.role === USER_ROLES.ADMIN ||
                user.role === USER_ROLES.OFFICE_MANAGER) &&
            therapistId
        ) {
            appointments = appointments.filter(function (appointment) {
                return appointment.therapistId === therapistId;
            });
        }

        // Client can only see own appointments
        if (user.role === USER_ROLES.CLIENT) {
            appointments = appointments.filter(function (appointment) {
                return appointment.clientId === user.id;
            });
        }

        // Therapist can only see own therapist-profile appointments
        if (user.role === USER_ROLES.THERAPIST) {
            const therapistProfile = getTherapistProfileByUserId(db, user.id);

            if (!therapistProfile) {
                return res.json({
                    success: true,
                    count: 0,
                    events: []
                });
            }

            appointments = appointments.filter(function (appointment) {
                return appointment.therapistId === therapistProfile.id;
            });
        }

        const events = appointments
            .map(function (appointment) {
                return buildCalendarEvent(appointment, db);
            })
            .sort(function (a, b) {
                return `${a.date} ${a.startTime}`.localeCompare(
                    `${b.date} ${b.startTime}`
                );
            });

        return res.json({
            success: true,
            count: events.length,
            events
        });
    } catch (error) {
        console.error("Calendar route error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load calendar events"
        });
    }
});

module.exports = router;