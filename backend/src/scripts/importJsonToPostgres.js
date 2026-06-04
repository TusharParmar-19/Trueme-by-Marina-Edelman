const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const DB_PATH = path.join(__dirname, "../data/db.json");

function toDate(value) {
    if (!value) {
        return null;
    }

    return new Date(value);
}

function withDateFields(item) {
    return {
        ...item,
        createdAt: toDate(item.createdAt) || new Date(),
        updatedAt: toDate(item.updatedAt),
    };
}

async function main() {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const db = JSON.parse(raw);

    console.log("Clearing PostgreSQL tables...");

    await prisma.auditLog.deleteMany();
    await prisma.waitlist.deleteMany();
    await prisma.appointment.deleteMany();
    await prisma.therapistTimeOff.deleteMany();
    await prisma.therapistAvailability.deleteMany();
    await prisma.therapistService.deleteMany();
    await prisma.room.deleteMany();
    await prisma.location.deleteMany();
    await prisma.service.deleteMany();
    await prisma.therapist.deleteMany();
    await prisma.user.deleteMany();

    console.log("Importing users...");
    await prisma.user.createMany({
        data: (db.users || []).map((user) =>
            withDateFields({
                id: user.id,
                name: user.name,
                email: user.email,
                password: user.password,
                role: user.role,
                status: user.status || "active",
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            })
        ),
    });

    console.log("Importing therapists...");
    await prisma.therapist.createMany({
        data: (db.therapists || []).map((therapist) =>
            withDateFields({
                id: therapist.id,
                userId: therapist.userId,
                title: therapist.title || "",
                phone: therapist.phone || "",
                licenseNumber: therapist.licenseNumber || "",
                bio: therapist.bio || "",
                appointmentTypes: therapist.appointmentTypes || [],
                focusAreas: therapist.focusAreas || [],
                treatmentApproaches: therapist.treatmentApproaches || [],
                clientFocus: therapist.clientFocus || [],
                assessmentTypes: therapist.assessmentTypes || [],
                insuranceAccepted: Boolean(therapist.insuranceAccepted),
                isPublicBookingEnabled: therapist.isPublicBookingEnabled !== false,
                profileStatus: therapist.profileStatus || "active",
                createdAt: therapist.createdAt,
                updatedAt: therapist.updatedAt,
            })
        ),
    });

    console.log("Importing services...");
    await prisma.service.createMany({
        data: (db.services || []).map((service) =>
            withDateFields({
                id: service.id,
                name: service.name,
                slug: service.slug || null,
                category: service.category || "therapy",
                description: service.description || "",
                durationMinutes: Number(service.durationMinutes || 0),
                bufferBeforeMinutes: Number(service.bufferBeforeMinutes || 0),
                bufferAfterMinutes: Number(service.bufferAfterMinutes || 0),
                currentPrice: Number(service.currentPrice || 0),
                currency: service.currency || "USD",
                appointmentTypes: service.appointmentTypes || [],
                allowedLocations: service.allowedLocations || [],
                isPublicBookingEnabled: service.isPublicBookingEnabled !== false,
                requiresCardOnFile: Boolean(service.requiresCardOnFile),
                cancellationPolicy: service.cancellationPolicy || "",
                status: service.status || "active",
                priceHistory: service.priceHistory || [],
                createdAt: service.createdAt,
                updatedAt: service.updatedAt,
            })
        ),
    });

    console.log("Importing locations...");
    await prisma.location.createMany({
        data: (db.locations || []).map((location) =>
            withDateFields({
                id: location.id,
                name: location.name,
                slug: location.slug || null,
                locationType: location.locationType || location.type || "office",
                addressLine1: location.addressLine1 || location.address || "",
                addressLine2: location.addressLine2 || "",
                city: location.city || "",
                state: location.state || "",
                postalCode: location.postalCode || "",
                country: location.country || "USA",
                timezone: location.timezone || "America/Los_Angeles",
                phone: location.phone || "",
                notes: location.notes || "",
                isPublicBookingEnabled: location.isPublicBookingEnabled !== false,
                status: location.status || "active",
                createdAt: location.createdAt,
                updatedAt: location.updatedAt,
            })
        ),
    });

    console.log("Importing rooms...");
    await prisma.room.createMany({
        data: (db.rooms || []).map((room) =>
            withDateFields({
                id: room.id,
                locationId: room.locationId,
                name: room.name,
                status: room.status || "active",
                notes: room.notes || "",
                createdAt: room.createdAt,
                updatedAt: room.updatedAt,
            })
        ),
    });

    console.log("Importing therapist services...");
    await prisma.therapistService.createMany({
        data: (db.therapistServices || []).map((assignment) =>
            withDateFields({
                id: assignment.id,
                therapistId: assignment.therapistId,
                serviceId: assignment.serviceId,
                locationIds: assignment.locationIds || [],
                appointmentTypes: assignment.appointmentTypes || [],
                notes: assignment.notes || "",
                status: assignment.status || "active",
                createdAt: assignment.createdAt,
                updatedAt: assignment.updatedAt,
            })
        ),
    });

    console.log("Importing therapist availability...");
    await prisma.therapistAvailability.createMany({
        data: (db.therapistAvailability || []).map((availability) =>
            withDateFields({
                id: availability.id,
                therapistId: availability.therapistId,
                dayOfWeek: Number(availability.dayOfWeek),
                startTime: availability.startTime,
                endTime: availability.endTime,
                locationId: availability.locationId || null,
                locationIds: availability.locationIds || [],
                appointmentTypes: availability.appointmentTypes || [],
                notes: availability.notes || "",
                status: availability.status || "active",
                createdAt: availability.createdAt,
                updatedAt: availability.updatedAt,
            })
        ),
    });

    console.log("Importing therapist time off...");
    await prisma.therapistTimeOff.createMany({
        data: (db.therapistTimeOff || []).map((block) =>
            withDateFields({
                id: block.id,
                therapistId: block.therapistId,
                startDateTime: block.startDateTime,
                endDateTime: block.endDateTime,
                type: block.type || "time_off",
                reason: block.reason || "",
                notes: block.notes || "",
                status: block.status || "active",
                createdAt: block.createdAt,
                updatedAt: block.updatedAt,
            })
        ),
    });

    console.log("Importing appointments...");
    await prisma.appointment.createMany({
        data: (db.appointments || []).map((appointment) =>
            withDateFields({
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
                blockedStartTime: appointment.blockedStartTime || appointment.startTime,
                blockedEndTime: appointment.blockedEndTime || appointment.endTime,
                startDateTime: appointment.startDateTime || "",
                endDateTime: appointment.endDateTime || "",
                status: appointment.status || "confirmed",
                priceSnapshot:
                    appointment.priceSnapshot === undefined ||
                        appointment.priceSnapshot === null
                        ? null
                        : Number(appointment.priceSnapshot),
                currencySnapshot: appointment.currencySnapshot || "USD",
                notes: appointment.notes || "",
                createdBy: appointment.createdBy || "",
                createdAt: appointment.createdAt,
                updatedAt: appointment.updatedAt,
            })
        ),
    });

    console.log("Importing waitlist...");
    await prisma.waitlist.createMany({
        data: (db.waitlist || []).map((entry) =>
            withDateFields({
                id: entry.id,
                clientId: entry.clientId,
                therapistId: entry.therapistId || null,
                serviceId: entry.serviceId,
                locationId: entry.locationId,
                appointmentType: entry.appointmentType,
                preferredDate: entry.preferredDate,
                preferredStartTime: entry.preferredStartTime || "",
                preferredEndTime: entry.preferredEndTime || "",
                status: entry.status || "active",
                notes: entry.notes || "",
                createdBy: entry.createdBy || "",
                createdAt: entry.createdAt,
                updatedAt: entry.updatedAt,
            })
        ),
    });

    console.log("Importing audit logs...");
    await prisma.auditLog.createMany({
        data: (db.auditLogs || []).map((log) =>
            withDateFields({
                id: log.id,
                action: log.action,
                performedBy: log.performedBy || "",
                details: log.details || "",
                createdAt: log.createdAt,
            })
        ),
    });

    console.log("Import finished successfully.");
}

main()
    .catch((error) => {
        console.error("Import failed:");
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });