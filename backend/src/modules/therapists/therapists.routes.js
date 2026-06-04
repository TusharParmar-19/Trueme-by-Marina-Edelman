const express = require("express");
const { z } = require("zod");
const crypto = require("crypto");

const prisma = require("../../config/prisma");
const { loadDB, saveDB } = require("../../utils/db");

const {
  authMiddleware,
  allowRoles
} = require("../../middleware/authMiddleware");

const { USER_ROLES } = require("../users/user.roles");

const router = express.Router();

const APPOINTMENT_TYPES = ["telehealth", "in_person"];

const DAY_NAMES = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday"
};

const therapistProfileSchema = z.object({
  userId: z.string().min(1),
  title: z.string().max(120).optional(),
  phone: z.string().max(30).optional(),
  licenseNumber: z.string().max(80).optional(),
  bio: z.string().max(2000).optional(),
  appointmentTypes: z.array(z.enum(APPOINTMENT_TYPES)).optional(),
  focusAreas: z.array(z.string().min(1).max(100)).optional(),
  treatmentApproaches: z.array(z.string().min(1).max(100)).optional(),
  clientFocus: z.array(z.string().min(1).max(100)).optional(),
  assessmentTypes: z.array(z.string().min(1).max(100)).optional(),
  insuranceAccepted: z.boolean().optional(),
  isPublicBookingEnabled: z.boolean().optional()
});

const updateTherapistProfileSchema = therapistProfileSchema
  .omit({
    userId: true
  })
  .partial();

const updateProfileStatusSchema = z.object({
  profileStatus: z.enum(["active", "inactive", "hidden"])
});

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

function therapistToJson(profile) {
  return {
    id: profile.id,
    userId: profile.userId,
    title: profile.title || "",
    phone: profile.phone || "",
    licenseNumber: profile.licenseNumber || "",
    bio: profile.bio || "",
    appointmentTypes: profile.appointmentTypes || [],
    focusAreas: profile.focusAreas || [],
    treatmentApproaches: profile.treatmentApproaches || [],
    clientFocus: profile.clientFocus || [],
    assessmentTypes: profile.assessmentTypes || [],
    insuranceAccepted: profile.insuranceAccepted || false,
    isPublicBookingEnabled: profile.isPublicBookingEnabled || false,
    profileStatus: profile.profileStatus || "active",
    createdAt: toIso(profile.createdAt) || new Date().toISOString(),
    updatedAt: toIso(profile.updatedAt)
  };
}

function upsertJsonTherapist(profile) {
  try {
    const db = loadDB();

    if (!db.therapists) {
      db.therapists = [];
    }

    const existingIndex = db.therapists.findIndex(function (item) {
      return item.id === profile.id;
    });

    const jsonTherapist = therapistToJson(profile);

    if (existingIndex >= 0) {
      db.therapists[existingIndex] = {
        ...db.therapists[existingIndex],
        ...jsonTherapist
      };
    } else {
      db.therapists.push(jsonTherapist);
    }

    saveDB(db);
  } catch (error) {
    console.error("Temporary db.json therapist sync failed:", error);
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

async function getLocationNameMap(locationIds) {
  const uniqueIds = Array.from(new Set((locationIds || []).filter(Boolean)));

  if (uniqueIds.length === 0) {
    return {};
  }

  const locations = await prisma.location.findMany({
    where: {
      id: {
        in: uniqueIds
      }
    },
    select: {
      id: true,
      name: true
    }
  });

  return locations.reduce(function (map, location) {
    map[location.id] = location.name;
    return map;
  }, {});
}

async function sanitizeTherapistProfile(profile) {
  const user = profile.user || null;
  const services = profile.services || [];
  const availability = profile.availability || [];

  const availabilityLocationIds = [];

  availability.forEach(function (rule) {
    const ids = rule.locationIds || (rule.locationId ? [rule.locationId] : []);

    ids.forEach(function (locationId) {
      availabilityLocationIds.push(locationId);
    });
  });

  const locationNameMap = await getLocationNameMap(availabilityLocationIds);

  return {
    id: profile.id,
    userId: profile.userId,
    name: user ? user.name : null,
    email: user ? user.email : null,
    userStatus: user ? user.status : null,
    title: profile.title,
    phone: profile.phone,
    licenseNumber: profile.licenseNumber,
    bio: profile.bio,
    appointmentTypes: profile.appointmentTypes || [],
    services: services
      .filter(function (assignment) {
        return assignment.status === "active";
      })
      .map(function (assignment) {
        return {
          id: assignment.serviceId,
          name: assignment.service ? assignment.service.name : assignment.serviceId,
          locationIds: assignment.locationIds || [],
          appointmentTypes: assignment.appointmentTypes || []
        };
      }),
    availability: availability
      .filter(function (rule) {
        return rule.status !== "inactive" && rule.status !== "archived";
      })
      .map(function (rule) {
        const locationIds =
          rule.locationIds || (rule.locationId ? [rule.locationId] : []);

        const locations = locationIds.map(function (locationId) {
          return {
            id: locationId,
            name: locationNameMap[locationId] || locationId
          };
        });

        return {
          id: rule.id,
          dayOfWeek: rule.dayOfWeek,
          dayName: DAY_NAMES[rule.dayOfWeek],
          startTime: rule.startTime,
          endTime: rule.endTime,
          locationIds,
          locations,
          appointmentTypes: rule.appointmentTypes || [],
          status: rule.status
        };
      }),
    focusAreas: profile.focusAreas || [],
    treatmentApproaches: profile.treatmentApproaches || [],
    clientFocus: profile.clientFocus || [],
    assessmentTypes: profile.assessmentTypes || [],
    insuranceAccepted: profile.insuranceAccepted || false,
    isPublicBookingEnabled: profile.isPublicBookingEnabled || false,
    profileStatus: profile.profileStatus,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt || null
  };
}

function publicTherapistResponse(therapist) {
  return {
    id: therapist.id,
    userId: therapist.userId,
    name: therapist.user ? therapist.user.name : null,
    email: therapist.user ? therapist.user.email : null,
    title: therapist.title,
    bio: therapist.bio,
    focusAreas: therapist.focusAreas || [],
    treatmentApproaches: therapist.treatmentApproaches || [],
    appointmentTypes: therapist.appointmentTypes || []
  };
}

// GET all therapist profiles
router.get(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const therapistProfiles = await prisma.therapist.findMany({
        include: {
          user: true,
          services: {
            include: {
              service: true
            }
          },
          availability: true
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      const therapists = await Promise.all(
        therapistProfiles.map(function (profile) {
          return sanitizeTherapistProfile(profile);
        })
      );

      return res.json({
        success: true,
        count: therapists.length,
        therapists
      });
    } catch (error) {
      console.error("Get therapists error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load therapists"
      });
    }
  }
);

// GET current therapist own profile
router.get(
  "/me",
  authMiddleware,
  allowRoles(USER_ROLES.THERAPIST),
  async function (req, res) {
    try {
      const profile = await prisma.therapist.findUnique({
        where: {
          userId: req.user.id
        },
        include: {
          user: true,
          services: {
            include: {
              service: true
            }
          },
          availability: true
        }
      });

      if (!profile) {
        return res.status(404).json({
          success: false,
          message: "Therapist profile not found"
        });
      }

      return res.json({
        success: true,
        therapist: await sanitizeTherapistProfile(profile)
      });
    } catch (error) {
      console.error("Get therapist me error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load therapist profile"
      });
    }
  }
);

// GET public therapists for booking
router.get(
  "/public",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER, USER_ROLES.CLIENT),
  async function (req, res) {
    try {
      const serviceId = req.query.serviceId;
      const locationId = req.query.locationId;
      const appointmentType = req.query.appointmentType;

      const where = {
        profileStatus: "active",
        isPublicBookingEnabled: true
      };

      if (serviceId || locationId || appointmentType) {
        where.services = {
          some: {
            status: "active",
            ...(serviceId
              ? {
                serviceId
              }
              : {}),
            ...(locationId
              ? {
                OR: [
                  {
                    locationIds: {
                      has: locationId
                    }
                  },
                  {
                    locationIds: {
                      isEmpty: true
                    }
                  }
                ]
              }
              : {}),
            ...(appointmentType
              ? {
                OR: [
                  {
                    appointmentTypes: {
                      has: appointmentType
                    }
                  },
                  {
                    appointmentTypes: {
                      isEmpty: true
                    }
                  }
                ]
              }
              : {})
          }
        };
      }

      const therapists = await prisma.therapist.findMany({
        where,
        include: {
          user: true
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      const result = therapists.map(publicTherapistResponse);

      return res.json({
        success: true,
        count: result.length,
        therapists: result
      });
    } catch (error) {
      console.error("Get public therapists error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load public therapists"
      });
    }
  }
);

// GET single therapist profile by profile id
router.get(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER, USER_ROLES.THERAPIST),
  async function (req, res) {
    try {
      const profile = await prisma.therapist.findUnique({
        where: {
          id: req.params.id
        },
        include: {
          user: true,
          services: {
            include: {
              service: true
            }
          },
          availability: true
        }
      });

      if (!profile) {
        return res.status(404).json({
          success: false,
          message: "Therapist profile not found"
        });
      }

      if (
        req.user.role === USER_ROLES.THERAPIST &&
        profile.userId !== req.user.id
      ) {
        return res.status(403).json({
          success: false,
          message: "You can only view your own therapist profile"
        });
      }

      return res.json({
        success: true,
        therapist: await sanitizeTherapistProfile(profile)
      });
    } catch (error) {
      console.error("Get single therapist error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load therapist profile"
      });
    }
  }
);

// CREATE therapist profile
router.post(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const result = therapistProfileSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: result.error.flatten()
        });
      }

      const therapistUser = await prisma.user.findUnique({
        where: {
          id: result.data.userId
        }
      });

      if (!therapistUser) {
        return res.status(404).json({
          success: false,
          message: "Therapist user not found"
        });
      }

      if (therapistUser.role !== USER_ROLES.THERAPIST) {
        return res.status(400).json({
          success: false,
          message: "Selected user is not a therapist"
        });
      }

      const existingProfile = await prisma.therapist.findUnique({
        where: {
          userId: result.data.userId
        }
      });

      if (existingProfile) {
        return res.status(400).json({
          success: false,
          message: "Therapist profile already exists for this user"
        });
      }

      const profile = await prisma.therapist.create({
        data: {
          id: createId("therapist"),
          userId: result.data.userId,
          title: result.data.title || "",
          phone: result.data.phone || "",
          licenseNumber: result.data.licenseNumber || "",
          bio: result.data.bio || "",
          appointmentTypes: result.data.appointmentTypes || [],
          focusAreas: result.data.focusAreas || [],
          treatmentApproaches: result.data.treatmentApproaches || [],
          clientFocus: result.data.clientFocus || [],
          assessmentTypes: result.data.assessmentTypes || [],
          insuranceAccepted: result.data.insuranceAccepted || false,
          isPublicBookingEnabled: result.data.isPublicBookingEnabled || false,
          profileStatus: "active"
        },
        include: {
          user: true,
          services: {
            include: {
              service: true
            }
          },
          availability: true
        }
      });

      // Temporary sync while remaining scheduling modules still use db.json
      upsertJsonTherapist(profile);

      await addPrismaAuditLog(
        "THERAPIST_PROFILE_CREATED",
        req.user.email,
        `Created therapist profile for ${therapistUser.email}`
      );

      return res.status(201).json({
        success: true,
        message: "Therapist profile created successfully",
        therapist: await sanitizeTherapistProfile(profile)
      });
    } catch (error) {
      console.error("Create therapist profile error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create therapist profile"
      });
    }
  }
);

// UPDATE therapist profile
router.patch(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const result = updateTherapistProfileSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: result.error.flatten()
        });
      }

      const profile = await prisma.therapist.findUnique({
        where: {
          id: req.params.id
        }
      });

      if (!profile) {
        return res.status(404).json({
          success: false,
          message: "Therapist profile not found"
        });
      }

      const allowedFields = [
        "title",
        "phone",
        "licenseNumber",
        "bio",
        "appointmentTypes",
        "focusAreas",
        "treatmentApproaches",
        "clientFocus",
        "assessmentTypes",
        "insuranceAccepted",
        "isPublicBookingEnabled"
      ];

      const updateData = {};

      allowedFields.forEach(function (field) {
        if (Object.prototype.hasOwnProperty.call(result.data, field)) {
          updateData[field] = result.data[field];
        }
      });

      updateData.updatedAt = new Date();

      const updatedProfile = await prisma.therapist.update({
        where: {
          id: profile.id
        },
        data: updateData,
        include: {
          user: true,
          services: {
            include: {
              service: true
            }
          },
          availability: true
        }
      });

      // Temporary sync while remaining scheduling modules still use db.json
      upsertJsonTherapist(updatedProfile);

      await addPrismaAuditLog(
        "THERAPIST_PROFILE_UPDATED",
        req.user.email,
        `Updated therapist profile ${updatedProfile.id}`
      );

      return res.json({
        success: true,
        message: "Therapist profile updated successfully",
        therapist: await sanitizeTherapistProfile(updatedProfile)
      });
    } catch (error) {
      console.error("Update therapist profile error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update therapist profile"
      });
    }
  }
);

// UPDATE therapist profile status
router.patch(
  "/:id/status",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const result = updateProfileStatusSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid status",
          errors: result.error.flatten()
        });
      }

      const profile = await prisma.therapist.findUnique({
        where: {
          id: req.params.id
        }
      });

      if (!profile) {
        return res.status(404).json({
          success: false,
          message: "Therapist profile not found"
        });
      }

      const updatedProfile = await prisma.therapist.update({
        where: {
          id: profile.id
        },
        data: {
          profileStatus: result.data.profileStatus,
          updatedAt: new Date()
        },
        include: {
          user: true,
          services: {
            include: {
              service: true
            }
          },
          availability: true
        }
      });

      // Temporary sync while remaining scheduling modules still use db.json
      upsertJsonTherapist(updatedProfile);

      await addPrismaAuditLog(
        "THERAPIST_PROFILE_STATUS_UPDATED",
        req.user.email,
        `Changed therapist profile ${updatedProfile.id} status to ${updatedProfile.profileStatus}`
      );

      return res.json({
        success: true,
        message: "Therapist profile status updated successfully",
        therapist: await sanitizeTherapistProfile(updatedProfile)
      });
    } catch (error) {
      console.error("Update therapist profile status error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update therapist profile status"
      });
    }
  }
);

module.exports = router;