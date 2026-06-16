const prisma = require("../config/prisma");

async function main() {
    const appointment = await prisma.appointment.findFirst({
        orderBy: {
            createdAt: "desc",
        },
        include: {
            client: true,
            therapist: {
                include: {
                    user: true,
                },
            },
            service: true,
        },
    });

    if (!appointment) {
        console.log("No appointment found.");
        return;
    }

    console.log({
        id: appointment.id,
        client: appointment.client?.name,
        therapist: appointment.therapist?.user?.name,
        service: appointment.service?.name,
        date: appointment.date,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        status: appointment.status,
        googleSyncStatus: appointment.googleSyncStatus,
        googleSyncError: appointment.googleSyncError,
        hasTherapistEvent: Boolean(appointment.googleCalendarEventId),
        hasAdminEvent: Boolean(appointment.googleAdminCalendarEventId),
    });
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });