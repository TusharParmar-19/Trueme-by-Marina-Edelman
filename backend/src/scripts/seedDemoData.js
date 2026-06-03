const bcrypt = require("bcryptjs");
const { saveDB } = require("../utils/db");

const now = new Date().toISOString();
const demoPasswordHash = bcrypt.hashSync("Password123!", 10);

const ids = {
    adminUser: "demo-user-admin",
    managerUser: "demo-user-manager",

    sarahUser: "demo-user-therapist-sarah",
    emilyUser: "demo-user-therapist-emily",
    michaelUser: "demo-user-therapist-michael",

    clientA: "demo-user-client-ava",
    clientB: "demo-user-client-noah",
    clientC: "demo-user-client-mia",

    sarahTherapist: "demo-therapist-sarah",
    emilyTherapist: "demo-therapist-emily",
    michaelTherapist: "demo-therapist-michael",

    individualService: "demo-service-individual",
    couplesService: "demo-service-couples",

    virtualLocation: "demo-location-virtual",
    westlakeVillage: "demo-location-westlake-village",
    westlakeCorporate: "demo-location-westlake-corporate",

    villageRoom1: "demo-room-village-1",
    villageRoom2: "demo-room-village-2",
    villageRoom3: "demo-room-village-3",
    villageRoom4: "demo-room-village-4",

    corporateRoom1: "demo-room-corporate-1",
    corporateRoom2: "demo-room-corporate-2",
    corporateRoom3: "demo-room-corporate-3",
    corporateRoom4: "demo-room-corporate-4",
};

function user(id, name, email, role) {
    return {
        id,
        name,
        email,
        password: demoPasswordHash,
        role,
        status: "active",
        createdAt: now,
        updatedAt: null,
    };
}

function therapistProfile(id, userId, title, focusAreas) {
    return {
        id,
        userId,
        title,
        phone: "818-555-0100",
        licenseNumber: `LIC-${id.slice(-5).toUpperCase()}`,
        bio: "Demo therapist profile for TrueMe scheduling workflow.",
        appointmentTypes: ["telehealth", "in_person"],
        focusAreas,
        treatmentApproaches: ["CBT", "EFT", "Mindfulness"],
        clientFocus: ["Adult", "Couple"],
        assessmentTypes: ["Anxiety Assessment", "Depression Assessment"],
        insuranceAccepted: false,
        isPublicBookingEnabled: true,
        profileStatus: "active",
        createdAt: now,
        updatedAt: null,
    };
}

function service(id, name, durationMinutes, bufferAfterMinutes, price, description) {
    return {
        id,
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        category: "therapy",
        description,
        durationMinutes,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes,
        currentPrice: price,
        currency: "USD",
        appointmentTypes: ["telehealth", "in_person"],
        allowedLocations: ["Virtual", "Westlake Village", "Westlake Corporate"],
        isPublicBookingEnabled: true,
        requiresCardOnFile: true,
        cancellationPolicy: "Appointments must be cancelled at least 24 hours in advance.",
        status: "active",
        priceHistory: [
            {
                price,
                currency: "USD",
                effectiveAt: now,
                changedBy: "admin@trueme.com",
                reason: "Demo seed price",
            },
        ],
        createdAt: now,
        updatedAt: null,
    };
}

function location(id, name, locationType, addressLine1, addressLine2, city, state, postalCode, notes) {
    return {
        id,
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        locationType,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        country: "USA",
        timezone: "America/Los_Angeles",
        phone: locationType === "office" ? "818-851-1293" : "",
        notes,
        isPublicBookingEnabled: true,
        status: "active",
        createdAt: now,
        updatedAt: null,
    };
}

function room(id, locationId, name) {
    return {
        id,
        locationId,
        name,
        status: "active",
        notes: "Demo therapy room",
        createdAt: now,
        updatedAt: null,
    };
}

function therapistService(id, therapistId, serviceId) {
    return {
        id,
        therapistId,
        serviceId,
        locationIds: [
            ids.virtualLocation,
            ids.westlakeVillage,
            ids.westlakeCorporate,
        ],
        appointmentTypes: ["telehealth", "in_person"],
        notes: "Demo therapist service assignment.",
        status: "active",
        createdAt: now,
        updatedAt: null,
    };
}

function availability(id, therapistId, dayOfWeek, locationId, startTime, endTime) {
    const isVirtual = locationId === ids.virtualLocation;

    return {
        id,
        therapistId,
        dayOfWeek,
        startTime,
        endTime,
        locationId,
        locationIds: [locationId],
        appointmentTypes: isVirtual ? ["telehealth"] : ["in_person"],
        notes: isVirtual ? "Demo virtual availability" : "Demo office availability",
        status: "active",
        createdAt: now,
        updatedAt: null,
    };
}

function appointment({
    id,
    clientId,
    therapistId,
    serviceId,
    locationId,
    roomId,
    appointmentType,
    date,
    startTime,
    endTime,
    blockedEndTime,
    notes,
}) {
    return {
        id,
        clientId,
        therapistId,
        serviceId,
        locationId,
        roomId: roomId || null,
        appointmentType,
        date,
        startTime,
        endTime,
        blockedStartTime: startTime,
        blockedEndTime,
        startDateTime: `${date}T${startTime}:00-07:00`,
        endDateTime: `${date}T${endTime}:00-07:00`,
        status: "confirmed",
        priceSnapshot: serviceId === ids.couplesService ? 240 : 200,
        currencySnapshot: "USD",
        notes,
        createdBy: "admin@trueme.com",
        createdAt: now,
        updatedAt: null,
    };
}

const db = {
    users: [
        user(ids.adminUser, "TrueMe Admin", "admin@trueme.com", "admin"),
        user(ids.managerUser, "Office Manager", "manager@trueme.com", "office_manager"),

        user(ids.sarahUser, "Dr. Sarah Thompson", "sarah@trueme.com", "therapist"),
        user(ids.emilyUser, "Dr. Emily Carter", "emily@trueme.com", "therapist"),
        user(ids.michaelUser, "Dr. Michael Lee", "michael@trueme.com", "therapist"),

        user(ids.clientA, "Ava Johnson", "ava.client@trueme.com", "client"),
        user(ids.clientB, "Noah Williams", "noah.client@trueme.com", "client"),
        user(ids.clientC, "Mia Davis", "mia.client@trueme.com", "client"),
    ],

    auditLogs: [
        {
            id: "demo-audit-001",
            action: "DEMO_DATA_SEEDED",
            performedBy: "system",
            details: "Professional demo dataset created for CEO and Marina testing.",
            createdAt: now,
        },
    ],

    therapists: [
        therapistProfile(ids.sarahTherapist, ids.sarahUser, "Licensed Marriage and Family Therapist", [
            "Anxiety",
            "Couples Therapy",
            "Relationship Support",
        ]),
        therapistProfile(ids.emilyTherapist, ids.emilyUser, "Licensed Clinical Therapist", [
            "Anxiety",
            "Depression",
            "Life Transitions",
        ]),
        therapistProfile(ids.michaelTherapist, ids.michaelUser, "Licensed Professional Counselor", [
            "Stress Management",
            "Trauma Support",
            "Couples Therapy",
        ]),
    ],

    services: [
        service(
            ids.individualService,
            "Individual Therapy 50 Minutes",
            55,
            5,
            200,
            "Individual therapy session for personal support and treatment planning.",
        ),
        service(
            ids.couplesService,
            "Couples Therapy 60 Minutes",
            60,
            15,
            240,
            "Couples therapy session for relationship support and communication work.",
        ),
    ],

    locations: [
        location(
            ids.virtualLocation,
            "Virtual Session",
            "virtual",
            "",
            "",
            "",
            "",
            "",
            "Telehealth / online therapy session.",
        ),
        location(
            ids.westlakeVillage,
            "Westlake Village Office",
            "office",
            "32107 Lindero Canyon Rd.",
            "Suite 203",
            "Westlake Village",
            "CA",
            "91361",
            "Main office location.",
        ),
        location(
            ids.westlakeCorporate,
            "Westlake Corporate Office",
            "office",
            "2829 Townsgate Road",
            "Suite 100",
            "Westlake Village",
            "CA",
            "91361",
            "Second office location.",
        ),
    ],

    rooms: [
        room(ids.villageRoom1, ids.westlakeVillage, "Room 1"),
        room(ids.villageRoom2, ids.westlakeVillage, "Room 2"),
        room(ids.villageRoom3, ids.westlakeVillage, "Room 3"),
        room(ids.villageRoom4, ids.westlakeVillage, "Room 4"),

        room(ids.corporateRoom1, ids.westlakeCorporate, "Room 1"),
        room(ids.corporateRoom2, ids.westlakeCorporate, "Room 2"),
        room(ids.corporateRoom3, ids.westlakeCorporate, "Room 3"),
        room(ids.corporateRoom4, ids.westlakeCorporate, "Room 4"),
    ],

    therapistServices: [
        therapistService("demo-ts-sarah-individual", ids.sarahTherapist, ids.individualService),
        therapistService("demo-ts-sarah-couples", ids.sarahTherapist, ids.couplesService),

        therapistService("demo-ts-emily-individual", ids.emilyTherapist, ids.individualService),
        therapistService("demo-ts-emily-couples", ids.emilyTherapist, ids.couplesService),

        therapistService("demo-ts-michael-individual", ids.michaelTherapist, ids.individualService),
        therapistService("demo-ts-michael-couples", ids.michaelTherapist, ids.couplesService),
    ],

    therapistAvailability: [
        // Sarah: Mon virtual, Tue office, Wed office, Thu office, Fri virtual
        availability("demo-avail-sarah-mon", ids.sarahTherapist, 1, ids.virtualLocation, "09:00", "17:00"),
        availability("demo-avail-sarah-tue", ids.sarahTherapist, 2, ids.westlakeVillage, "09:00", "17:00"),
        availability("demo-avail-sarah-wed", ids.sarahTherapist, 3, ids.westlakeCorporate, "09:00", "17:00"),
        availability("demo-avail-sarah-thu", ids.sarahTherapist, 4, ids.westlakeVillage, "09:00", "17:00"),
        availability("demo-avail-sarah-fri", ids.sarahTherapist, 5, ids.virtualLocation, "09:00", "17:00"),

        // Emily: Mon office, Tue virtual, Wed office, Thu corporate, Fri office
        availability("demo-avail-emily-mon", ids.emilyTherapist, 1, ids.westlakeVillage, "09:00", "17:00"),
        availability("demo-avail-emily-tue", ids.emilyTherapist, 2, ids.virtualLocation, "09:00", "17:00"),
        availability("demo-avail-emily-wed", ids.emilyTherapist, 3, ids.westlakeVillage, "09:00", "17:00"),
        availability("demo-avail-emily-thu", ids.emilyTherapist, 4, ids.westlakeCorporate, "09:00", "17:00"),
        availability("demo-avail-emily-fri", ids.emilyTherapist, 5, ids.westlakeVillage, "09:00", "17:00"),

        // Michael: Mon corporate, Tue office, Wed virtual, Thu office, Fri corporate
        availability("demo-avail-michael-mon", ids.michaelTherapist, 1, ids.westlakeCorporate, "09:00", "17:00"),
        availability("demo-avail-michael-tue", ids.michaelTherapist, 2, ids.westlakeVillage, "09:00", "17:00"),
        availability("demo-avail-michael-wed", ids.michaelTherapist, 3, ids.virtualLocation, "09:00", "17:00"),
        availability("demo-avail-michael-thu", ids.michaelTherapist, 4, ids.westlakeVillage, "09:00", "17:00"),
        availability("demo-avail-michael-fri", ids.michaelTherapist, 5, ids.westlakeCorporate, "09:00", "17:00"),
    ],

    therapistTimeOff: [],

    appointments: [
        appointment({
            id: "demo-appt-001",
            clientId: ids.clientA,
            therapistId: ids.sarahTherapist,
            serviceId: ids.individualService,
            locationId: ids.virtualLocation,
            roomId: null,
            appointmentType: "telehealth",
            date: "2026-06-08",
            startTime: "09:00",
            endTime: "09:55",
            blockedEndTime: "10:00",
            notes: "Demo online appointment.",
        }),
        appointment({
            id: "demo-appt-002",
            clientId: ids.clientB,
            therapistId: ids.emilyTherapist,
            serviceId: ids.individualService,
            locationId: ids.westlakeVillage,
            roomId: ids.villageRoom1,
            appointmentType: "in_person",
            date: "2026-06-08",
            startTime: "10:00",
            endTime: "10:55",
            blockedEndTime: "11:00",
            notes: "Demo in-person appointment at Westlake Village Office.",
        }),
        appointment({
            id: "demo-appt-003",
            clientId: ids.clientC,
            therapistId: ids.michaelTherapist,
            serviceId: ids.couplesService,
            locationId: ids.westlakeCorporate,
            roomId: ids.corporateRoom1,
            appointmentType: "in_person",
            date: "2026-06-08",
            startTime: "11:00",
            endTime: "12:00",
            blockedEndTime: "12:15",
            notes: "Demo couples appointment at Westlake Corporate Office.",
        }),
    ],

    waitlist: [],
};

saveDB(db);

console.log("Demo database created successfully.");
console.log("");
console.log("Login password for every demo account: Password123!");
console.log("");
console.log("Admin: admin@trueme.com");
console.log("Manager: manager@trueme.com");
console.log("Therapists: sarah@trueme.com, emily@trueme.com, michael@trueme.com");
console.log("Clients: ava.client@trueme.com, noah.client@trueme.com, mia.client@trueme.com");