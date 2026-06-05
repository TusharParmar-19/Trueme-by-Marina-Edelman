require("dotenv").config();

const prisma = require("../config/prisma");

const mappings = [
    {
        therapistId: "demo-therapist-sarah",
        envKey: "GOOGLE_CALENDAR_SARAH_ID",
    },
    {
        therapistId: "demo-therapist-emily",
        envKey: "GOOGLE_CALENDAR_EMILY_ID",
    },
    {
        therapistId: "demo-therapist-michael",
        envKey: "GOOGLE_CALENDAR_MICHAEL_ID",
    },
];

async function main() {
    console.log("Updating therapist Google Calendar IDs...");

    for (const item of mappings) {
        const calendarId = process.env[item.envKey];

        if (!calendarId) {
            throw new Error(`Missing ${item.envKey} in backend/.env`);
        }

        const updated = await prisma.therapist.update({
            where: {
                id: item.therapistId,
            },
            data: {
                googleCalendarId: calendarId,
            },
        });

        console.log(`Updated ${updated.id} with ${item.envKey}`);
    }

    console.log("Therapist Google Calendar IDs updated successfully.");
}

main()
    .catch((error) => {
        console.error("Failed to update therapist calendar IDs:");
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });