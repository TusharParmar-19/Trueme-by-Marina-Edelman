const express = require("express");
const { z } = require("zod");

const { loadDB, saveDB, addAuditLog } = require("../../utils/db");
const {
  authMiddleware,
  allowRoles
} = require("../../middleware/authMiddleware");

const { USER_ROLES } = require("../users/user.roles");

const router = express.Router();

const createAssignmentSchema = z.object({
  therapistId: z.string().min(1),
  serviceId: z.string().min(1),
  locationIds: z.array(z.string().min(1)).optional(),
  appointmentTypes: z.array(z.enum(["telehealth", "in_person"])).optional(),
  notes: z.string().max(1000).optional()
});

const updateAssignmentSchema = z.object({
  locationIds: z.array(z.string().min(1)).optional(),
  appointmentTypes: z.array(z.enum(["telehealth", "in_person"])).optional(),
  notes: z.string().max(1000).optional()
});

const updateStatusSchema = z.object({
  status: z.enum(["active", "inactive"])
});

function sanitizeAssignment(assignment, therapist, therapistUser, service) {
  return {
    id: assignment.id,
    therapistId: assignment.therapistId,
    therapistName: therapistUser ? therapistUser.name : null,
    therapistEmail: therapistUser ? therapistUser.email : null,
    serviceId: assignment.serviceId,
    serviceName: service ? service.name : null,
    serviceDurationMinutes: service ? service.durationMinutes : null,
    servicePrice: service ? service.currentPrice : null,
    locationIds: assignment.locationIds || [],
    appointmentTypes: assignment.appointmentTypes || [],
    notes: assignment.notes || "",
    status: assignment.status,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt || null
  };
}

function getAssignmentDetails(db, assignment) {
  const therapist = db.therapists.find(function (item) {
    return item.id === assignment.therapistId;
  });

  const therapistUser = therapist
    ? db.users.find(function (user) {
        return user.id === therapist.userId;
      })
    : null;

  const service = db.services.find(function (item) {
    return item.id === assignment.serviceId;
  });

  return sanitizeAssignment(assignment, therapist, therapistUser, service);
}

function therapistOwnsProfile(req, therapist) {
  return therapist && therapist.userId === req.user.id;
}

// GET all assignments
router.get(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const db = loadDB();

    const assignments = db.therapistServices.map(function (assignment) {
      return getAssignmentDetails(db, assignment);
    });

    return res.json({
      success: true,
      count: assignments.length,
      assignments
    });
  }
);

// GET assignments by therapist profile ID
router.get(
  "/therapists/:therapistId",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER, USER_ROLES.THERAPIST),
  function (req, res) {
    const db = loadDB();

    const therapist = db.therapists.find(function (item) {
      return item.id === req.params.therapistId;
    });

    if (!therapist) {
      return res.status(404).json({
        success: false,
        message: "Therapist profile not found"
      });
    }

    if (req.user.role === USER_ROLES.THERAPIST && !therapistOwnsProfile(req, therapist)) {
      return res.status(403).json({
        success: false,
        message: "You can only view your own service assignments"
      });
    }

    const assignments = db.therapistServices
      .filter(function (assignment) {
        return assignment.therapistId === req.params.therapistId;
      })
      .map(function (assignment) {
        return getAssignmentDetails(db, assignment);
      });

    return res.json({
      success: true,
      count: assignments.length,
      assignments
    });
  }
);

// GET assignments by service ID
router.get(
  "/services/:serviceId",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const db = loadDB();

    const service = db.services.find(function (item) {
      return item.id === req.params.serviceId;
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found"
      });
    }

    const assignments = db.therapistServices
      .filter(function (assignment) {
        return assignment.serviceId === req.params.serviceId;
      })
      .map(function (assignment) {
        return getAssignmentDetails(db, assignment);
      });

    return res.json({
      success: true,
      count: assignments.length,
      assignments
    });
  }
);

// CREATE therapist-service assignment
router.post(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = createAssignmentSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: result.error.flatten()
      });
    }

    const db = loadDB();

    const therapist = db.therapists.find(function (item) {
      return item.id === result.data.therapistId;
    });

    if (!therapist) {
      return res.status(404).json({
        success: false,
        message: "Therapist profile not found"
      });
    }

    if (therapist.profileStatus !== "active") {
      return res.status(400).json({
        success: false,
        message: "Therapist profile is not active"
      });
    }

    const service = db.services.find(function (item) {
      return item.id === result.data.serviceId;
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found"
      });
    }

    if (service.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Service is not active"
      });
    }

    const duplicate = db.therapistServices.find(function (assignment) {
      return (
        assignment.therapistId === result.data.therapistId &&
        assignment.serviceId === result.data.serviceId &&
        assignment.status === "active"
      );
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: "This therapist is already assigned to this service"
      });
    }

    const now = new Date().toISOString();

    const assignment = {
      id: Date.now().toString(),
      therapistId: result.data.therapistId,
      serviceId: result.data.serviceId,
      locationIds: result.data.locationIds || [],
      appointmentTypes: result.data.appointmentTypes || [],
      notes: result.data.notes || "",
      status: "active",
      createdAt: now,
      updatedAt: null
    };

    db.therapistServices.push(assignment);
    saveDB(db);

    addAuditLog(
      "THERAPIST_SERVICE_ASSIGNED",
      req.user.email,
      `Assigned therapist ${assignment.therapistId} to service ${assignment.serviceId}`
    );

    return res.status(201).json({
      success: true,
      message: "Therapist assigned to service successfully",
      assignment: getAssignmentDetails(db, assignment)
    });
  }
);

// UPDATE assignment
router.patch(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = updateAssignmentSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: result.error.flatten()
      });
    }

    const db = loadDB();

    const assignment = db.therapistServices.find(function (item) {
      return item.id === req.params.id;
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found"
      });
    }

    const allowedFields = ["locationIds", "appointmentTypes", "notes"];

    allowedFields.forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(result.data, field)) {
        assignment[field] = result.data[field];
      }
    });

    assignment.updatedAt = new Date().toISOString();

    saveDB(db);

    addAuditLog(
      "THERAPIST_SERVICE_ASSIGNMENT_UPDATED",
      req.user.email,
      `Updated therapist-service assignment ${assignment.id}`
    );

    return res.json({
      success: true,
      message: "Assignment updated successfully",
      assignment: getAssignmentDetails(db, assignment)
    });
  }
);

// ACTIVE / INACTIVE assignment
router.patch(
  "/:id/status",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = updateStatusSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
        errors: result.error.flatten()
      });
    }

    const db = loadDB();

    const assignment = db.therapistServices.find(function (item) {
      return item.id === req.params.id;
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found"
      });
    }

    assignment.status = result.data.status;
    assignment.updatedAt = new Date().toISOString();

    saveDB(db);

    addAuditLog(
      "THERAPIST_SERVICE_ASSIGNMENT_STATUS_UPDATED",
      req.user.email,
      `Changed assignment ${assignment.id} status to ${assignment.status}`
    );

    return res.json({
      success: true,
      message: "Assignment status updated successfully",
      assignment: getAssignmentDetails(db, assignment)
    });
  }
);

module.exports = router;