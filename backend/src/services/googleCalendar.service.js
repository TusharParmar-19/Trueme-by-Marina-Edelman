const { google } = require("googleapis");
const prisma = require("../config/prisma");

const DEFAULT_TIMEZONE = "America/Los_Angeles";
const DEFAULT_TIMEZONE_OFFSET = "-07:00";

function isGoogleCalendarEnabled() {
    return process.env.GOOGLE_CALENDAR_ENABLED === "true";
}

function hasGoogleCalendarConfig() {
    return Boolean(
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.GOOGLE_REFRESH_TOKEN &&
        process.env.GOOGLE_ADMIN_CALENDAR_ID
    );
}

function getCalendarClient() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/oauth2callback"
    );

    oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    return google.calendar({
        version: "v3",
        auth: oauth2Client,
    });
}

function createDateTime(date, time) {
    return date + "T" + time + ":00" + DEFAULT_TIMEZONE_OFFSET;
}

function getAppointmentDateTime(appointment, fieldName, fallbackTime) {
    return appointment[fieldName] || createDateTime(appointment.date, fallbackTime);
}

async function getAppointmentForCalendar(appointmentId) {
    return prisma.appointment.findUnique({
        where: {
            id: appointmentId,
        },
        include: {
            client: true,
            therapist: {
                include: {
                    user: true,
                },
            },
            service: true,
            location: true,
            room: true,
        },
    });
}

function buildAppointmentEvent(appointment, options) {
    const isAdminEvent = options && options.isAdminEvent;

    const clientName = appointment.client ? appointment.client.name : "Client";
    const clientEmail = appointment.client ? appointment.client.email : "";
    const therapistName =
        appointment.therapist && appointment.therapist.user
            ? appointment.therapist.user.name
            : "Therapist";
    const therapistEmail =
        appointment.therapist && appointment.therapist.user
            ? appointment.therapist.user.email
            : "";

    const serviceName = appointment.service ? appointment.service.name : "Session";
    const locationName = appointment.location ? appointment.location.name : "";
    const roomName = appointment.room ? appointment.room.name : "";

    const summary = isAdminEvent
        ? `${therapistName} - ${clientName} - ${serviceName}`
        : `${clientName} - ${serviceName}`;

    const locationText =
        appointment.appointmentType === "telehealth"
            ? "Virtual Session"
            : [locationName, roomName].filter(Boolean).join(" - ");

    const description = [
        "TrueMe Scheduling Demo",
        "",
        `Client: ${clientName}${clientEmail ? " (" + clientEmail + ")" : ""}`,
        `Therapist: ${therapistName}${therapistEmail ? " (" + therapistEmail + ")" : ""
        }`,
        `Service: ${serviceName}`,
        `Appointment Type: ${appointment.appointmentType}`,
        `Status: ${appointment.status}`,
        appointment.notes ? `Notes: ${appointment.notes}` : "",
    ]
        .filter(Boolean)
        .join("\n");

    return {
        summary,
        description,
        location: locationText,
        start: {
            dateTime: getAppointmentDateTime(
                appointment,
                "startDateTime",
                appointment.startTime
            ),
            timeZone: DEFAULT_TIMEZONE,
        },
        end: {
            dateTime: getAppointmentDateTime(
                appointment,
                "endDateTime",
                appointment.endTime
            ),
            timeZone: DEFAULT_TIMEZONE,
        },
        reminders: {
            useDefault: true,
        },
    };
}

async function markGoogleSync(appointmentId, data) {
    try {
        await prisma.appointment.update({
            where: {
                id: appointmentId,
            },
            data,
        });
    } catch (error) {
        console.error("Failed to update Google sync fields:", error);
    }
}

function getErrorMessage(error) {
    if (!error) return "Unknown Google Calendar error";

    if (error.response && error.response.data) {
        return JSON.stringify(error.response.data).slice(0, 1000);
    }

    if (error.message) {
        return error.message.slice(0, 1000);
    }

    return String(error).slice(0, 1000);
}

async function safeDeleteEvent(calendar, calendarId, eventId) {
    if (!calendarId || !eventId) return;

    try {
        await calendar.events.delete({
            calendarId,
            eventId,
            sendUpdates: "none",
        });
    } catch (error) {
        const status = error && error.code;

        if (status === 404 || status === 410) {
            return;
        }

        throw error;
    }
}

async function syncAppointmentToGoogle(appointmentId, options) {
    options = options || {};

    if (!isGoogleCalendarEnabled()) {
        return {
            success: true,
            skipped: true,
            reason: "Google Calendar sync is disabled",
        };
    }

    if (!hasGoogleCalendarConfig()) {
        await markGoogleSync(appointmentId, {
            googleSyncStatus: "failed",
            googleSyncError: "Missing Google Calendar environment configuration",
        });

        return {
            success: false,
            error: "Missing Google Calendar environment configuration",
        };
    }

    const appointment = await getAppointmentForCalendar(appointmentId);

    if (!appointment) {
        return {
            success: false,
            error: "Appointment not found",
        };
    }

    if (appointment.status === "cancelled") {
        return cancelAppointmentCalendarEvents(appointmentId, options);
    }

    const therapistCalendarId =
        appointment.therapist && appointment.therapist.googleCalendarId;

    if (!therapistCalendarId) {
        await markGoogleSync(appointmentId, {
            googleSyncStatus: "failed",
            googleSyncError:
                "Assigned therapist does not have googleCalendarId configured",
        });

        return {
            success: false,
            error: "Assigned therapist does not have googleCalendarId configured",
        };
    }

    const adminCalendarId = process.env.GOOGLE_ADMIN_CALENDAR_ID;
    const calendar = getCalendarClient();

    try {
        let therapistEventId = appointment.googleCalendarEventId || null;
        let adminEventId = appointment.googleAdminCalendarEventId || null;

        const oldTherapistCalendarId = options.oldTherapistCalendarId || null;

        if (
            oldTherapistCalendarId &&
            oldTherapistCalendarId !== therapistCalendarId &&
            therapistEventId
        ) {
            await safeDeleteEvent(calendar, oldTherapistCalendarId, therapistEventId);
            therapistEventId = null;
        }

        const therapistEvent = buildAppointmentEvent(appointment, {
            isAdminEvent: false,
        });

        if (therapistEventId) {
            await calendar.events.update({
                calendarId: therapistCalendarId,
                eventId: therapistEventId,
                requestBody: therapistEvent,
                sendUpdates: "none",
            });
        } else {
            const createdTherapistEvent = await calendar.events.insert({
                calendarId: therapistCalendarId,
                requestBody: therapistEvent,
                sendUpdates: "none",
            });

            therapistEventId = createdTherapistEvent.data.id;
        }

        const adminEvent = buildAppointmentEvent(appointment, {
            isAdminEvent: true,
        });

        if (adminEventId) {
            await calendar.events.update({
                calendarId: adminCalendarId,
                eventId: adminEventId,
                requestBody: adminEvent,
                sendUpdates: "none",
            });
        } else {
            const createdAdminEvent = await calendar.events.insert({
                calendarId: adminCalendarId,
                requestBody: adminEvent,
                sendUpdates: "none",
            });

            adminEventId = createdAdminEvent.data.id;
        }

        await markGoogleSync(appointmentId, {
            googleCalendarEventId: therapistEventId,
            googleAdminCalendarEventId: adminEventId,
            googleSyncStatus: "synced",
            googleSyncError: null,
            googleSyncedAt: new Date(),
        });

        return {
            success: true,
            therapistEventId,
            adminEventId,
        };
    } catch (error) {
        const errorMessage = getErrorMessage(error);

        await markGoogleSync(appointmentId, {
            googleSyncStatus: "failed",
            googleSyncError: errorMessage,
        });

        console.error("Google Calendar sync failed:", error);

        return {
            success: false,
            error: errorMessage,
        };
    }
}

async function cancelAppointmentCalendarEvents(appointmentId, options) {
    options = options || {};

    if (!isGoogleCalendarEnabled() || !hasGoogleCalendarConfig()) {
        return {
            success: true,
            skipped: true,
        };
    }

    const appointment = await getAppointmentForCalendar(appointmentId);

    if (!appointment) {
        return {
            success: false,
            error: "Appointment not found",
        };
    }

    const calendar = getCalendarClient();

    const therapistCalendarId =
        options.oldTherapistCalendarId ||
        (appointment.therapist && appointment.therapist.googleCalendarId);

    try {
        await safeDeleteEvent(
            calendar,
            therapistCalendarId,
            appointment.googleCalendarEventId
        );

        await safeDeleteEvent(
            calendar,
            process.env.GOOGLE_ADMIN_CALENDAR_ID,
            appointment.googleAdminCalendarEventId
        );

        await markGoogleSync(appointmentId, {
            googleSyncStatus: "cancelled",
            googleSyncError: null,
            googleSyncedAt: new Date(),
        });

        return {
            success: true,
        };
    } catch (error) {
        const errorMessage = getErrorMessage(error);

        await markGoogleSync(appointmentId, {
            googleSyncStatus: "failed",
            googleSyncError: errorMessage,
        });

        console.error("Google Calendar cancel sync failed:", error);

        return {
            success: false,
            error: errorMessage,
        };
    }
}

module.exports = {
    isGoogleCalendarEnabled,
    syncAppointmentToGoogle,
    cancelAppointmentCalendarEvents,
};