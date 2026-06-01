const express = require("express");
const { z } = require("zod");

const { loadDB, saveDB, addAuditLog } = require("../../utils/db");
const {
  authMiddleware,
  allowRoles
} = require("../../middleware/authMiddleware");

const { USER_ROLES } = require("../users/user.roles");

const router = express.Router();

const APPOINTMENT_TYPES = ["telehealth", "in_person"];

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

function sanitizeTherapistProfile(profile, user) {
  return {
    id: profile.id,
    userId: profile.userId,
    name: user ? user.name : profile.name,
    email: user ? user.email : null,
    userStatus: user ? user.status : null,
    title: profile.title,
    phone: profile.phone,
    licenseNumber: profile.licenseNumber,
    bio: profile.bio,
    appointmentTypes: profile.appointmentTypes || [],
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

// GET all therapist profiles
router.get(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const db = loadDB();

    const therapists = db.therapists.map(function (profile) {
      const user = db.users.find(function (item) {
        return item.id === profile.userId;
      });

      return sanitizeTherapistProfile(profile, user);
    });

    return res.json({
      success: true,
      count: therapists.length,
      therapists
    });
  }
);

// GET current therapist own profile
router.get(
  "/me",
  authMiddleware,
  allowRoles(USER_ROLES.THERAPIST),
  function (req, res) {
    const db = loadDB();

    const profile = db.therapists.find(function (item) {
      return item.userId === req.user.id;
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Therapist profile not found"
      });
    }

    const user = db.users.find(function (item) {
      return item.id === profile.userId;
    });

    return res.json({
      success: true,
      therapist: sanitizeTherapistProfile(profile, user)
    });
  }
);

// GET public therapists for booking
router.get(
  "/public",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER, USER_ROLES.CLIENT),
  function (req, res) {
    const db = loadDB();

    const serviceId = req.query.serviceId;
    const locationId = req.query.locationId;
    const appointmentType = req.query.appointmentType;

    let therapists = db.therapists.filter(function (therapist) {
      return (
        therapist.profileStatus === "active" &&
        therapist.isPublicBookingEnabled === true
      );
    });

    if (serviceId || locationId || appointmentType) {
      therapists = therapists.filter(function (therapist) {
        return (db.therapistServices || []).some(function (assignment) {
          const serviceMatches = !serviceId || assignment.serviceId === serviceId;

          const locationMatches =
            !locationId ||
            !assignment.locationIds ||
            assignment.locationIds.length === 0 ||
            assignment.locationIds.includes(locationId);

          const appointmentTypeMatches =
            !appointmentType ||
            !assignment.appointmentTypes ||
            assignment.appointmentTypes.length === 0 ||
            assignment.appointmentTypes.includes(appointmentType);

          return (
            assignment.therapistId === therapist.id &&
            assignment.status === "active" &&
            serviceMatches &&
            locationMatches &&
            appointmentTypeMatches
          );
        });
      });
    }

    const result = therapists.map(function (therapist) {
      const user = db.users.find(function (item) {
        return item.id === therapist.userId;
      });

      return {
        id: therapist.id,
        userId: therapist.userId,
        name: user ? user.name : null,
        email: user ? user.email : null,
        title: therapist.title,
        bio: therapist.bio,
        focusAreas: therapist.focusAreas || [],
        treatmentApproaches: therapist.treatmentApproaches || [],
        appointmentTypes: therapist.appointmentTypes || []
      };
    });

    return res.json({
      success: true,
      count: result.length,
      therapists: result
    });
  }
);

// GET single therapist profile by profile id
router.get(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER, USER_ROLES.THERAPIST),
  function (req, res) {
    const db = loadDB();

    const profile = db.therapists.find(function (item) {
      return item.id === req.params.id;
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Therapist profile not found"
      });
    }

    if (req.user.role === USER_ROLES.THERAPIST && profile.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can only view your own therapist profile"
      });
    }

    const user = db.users.find(function (item) {
      return item.id === profile.userId;
    });

    return res.json({
      success: true,
      therapist: sanitizeTherapistProfile(profile, user)
    });
  }
);

// CREATE therapist profile
router.post(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = therapistProfileSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: result.error.flatten()
      });
    }

    const db = loadDB();

    const therapistUser = db.users.find(function (user) {
      return user.id === result.data.userId;
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

    const existingProfile = db.therapists.find(function (profile) {
      return profile.userId === result.data.userId;
    });

    if (existingProfile) {
      return res.status(400).json({
        success: false,
        message: "Therapist profile already exists for this user"
      });
    }

    const profile = {
      id: Date.now().toString(),
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
      profileStatus: "active",
      createdAt: new Date().toISOString(),
      updatedAt: null
    };

    db.therapists.push(profile);
    saveDB(db);

    addAuditLog(
      "THERAPIST_PROFILE_CREATED",
      req.user.email,
      `Created therapist profile for ${therapistUser.email}`
    );

    return res.status(201).json({
      success: true,
      message: "Therapist profile created successfully",
      therapist: sanitizeTherapistProfile(profile, therapistUser)
    });
  }
);

// UPDATE therapist profile
router.patch(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = updateTherapistProfileSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: result.error.flatten()
      });
    }

    const db = loadDB();

    const profile = db.therapists.find(function (item) {
      return item.id === req.params.id;
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

    allowedFields.forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(result.data, field)) {
        profile[field] = result.data[field];
      }
    });

    profile.updatedAt = new Date().toISOString();

    saveDB(db);

    const therapistUser = db.users.find(function (user) {
      return user.id === profile.userId;
    });

    addAuditLog(
      "THERAPIST_PROFILE_UPDATED",
      req.user.email,
      `Updated therapist profile ${profile.id}`
    );

    return res.json({
      success: true,
      message: "Therapist profile updated successfully",
      therapist: sanitizeTherapistProfile(profile, therapistUser)
    });
  }
);

// UPDATE therapist profile status
router.patch(
  "/:id/status",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = updateProfileStatusSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
        errors: result.error.flatten()
      });
    }

    const db = loadDB();

    const profile = db.therapists.find(function (item) {
      return item.id === req.params.id;
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Therapist profile not found"
      });
    }

    profile.profileStatus = result.data.profileStatus;
    profile.updatedAt = new Date().toISOString();

    saveDB(db);

    const therapistUser = db.users.find(function (user) {
      return user.id === profile.userId;
    });

    addAuditLog(
      "THERAPIST_PROFILE_STATUS_UPDATED",
      req.user.email,
      `Changed therapist profile ${profile.id} status to ${profile.profileStatus}`
    );

    return res.json({
      success: true,
      message: "Therapist profile status updated successfully",
      therapist: sanitizeTherapistProfile(profile, therapistUser)
    });
  }
);

// GET public therapists for booking
router.get("/public", authMiddleware, function (req, res) {
  const db = loadDB();

  const serviceId = req.query.serviceId;
  const locationId = req.query.locationId;
  const appointmentType = req.query.appointmentType;

  let therapists = db.therapists.filter(function (therapist) {
    return (
      therapist.profileStatus === "active" &&
      therapist.isPublicBookingEnabled === true
    );
  });

  if (serviceId || locationId || appointmentType) {
    therapists = therapists.filter(function (therapist) {
      return db.therapistServices.some(function (assignment) {
        const serviceMatches = !serviceId || assignment.serviceId === serviceId;

        const locationMatches =
          !locationId ||
          (assignment.locationIds || []).includes(locationId);

        const appointmentTypeMatches =
          !appointmentType ||
          (assignment.appointmentTypes || []).includes(appointmentType);

        return (
          assignment.therapistId === therapist.id &&
          assignment.status === "active" &&
          serviceMatches &&
          locationMatches &&
          appointmentTypeMatches
        );
      });
    });
  }

  const result = therapists.map(function (therapist) {
    const user = db.users.find(function (item) {
      return item.id === therapist.userId;
    });

    return {
      id: therapist.id,
      userId: therapist.userId,
      name: user ? user.name : null,
      email: user ? user.email : null,
      title: therapist.title,
      bio: therapist.bio,
      focusAreas: therapist.focusAreas || [],
      treatmentApproaches: therapist.treatmentApproaches || [],
      appointmentTypes: therapist.appointmentTypes || []
    };
  });

  return res.json({
    success: true,
    count: result.length,
    therapists: result
  });
});

module.exports = router;