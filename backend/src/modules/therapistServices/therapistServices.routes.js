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

function sanitizeAssignment(assignment) {
  const therapist = assignment.therapist || null;
  const therapistUser = therapist && therapist.user ? therapist.user : null;
  const service = assignment.service || null;

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

function assignmentToJson(assignment) {
  return {
    id: assignment.id,
    therapistId: assignment.therapistId,
    serviceId: assignment.serviceId,
    locationIds: assignment.locationIds || [],
    appointmentTypes: assignment.appointmentTypes || [],
    notes: assignment.notes || "",
    status: assignment.status || "active",
    createdAt: toIso(assignment.createdAt) || new Date().toISOString(),
    updatedAt: toIso(assignment.updatedAt)
  };
}

function upsertJsonAssignment(assignment) {
  try {
    const db = loadDB();

    if (!db.therapistServices) {
      db.therapistServices = [];
    }

    const existingIndex = db.therapistServices.findIndex(function (item) {
      return item.id === assignment.id;
    });

    const jsonAssignment = assignmentToJson(assignment);

    if (existingIndex >= 0) {
      db.therapistServices[existingIndex] = {
        ...db.therapistServices[existingIndex],
        ...jsonAssignment
      };
    } else {
      db.therapistServices.push(jsonAssignment);
    }

    saveDB(db);
  } catch (error) {
    console.error("Temporary db.json therapist-service sync failed:", error);
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

function therapistOwnsProfile(req, therapist) {
  return therapist && therapist.userId === req.user.id;
}

function assignmentInclude() {
  return {
    therapist: {
      include: {
        user: true
      }
    },
    service: true
  };
}

// GET all assignments
router.get(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const assignments = await prisma.therapistService.findMany({
        include: assignmentInclude(),
        orderBy: {
          createdAt: "desc"
        }
      });

      const result = assignments.map(function (assignment) {
        return sanitizeAssignment(assignment);
      });

      return res.json({
        success: true,
        count: result.length,
        assignments: result
      });
    } catch (error) {
      console.error("Get therapist-service assignments error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load therapist-service assignments"
      });
    }
  }
);

// GET assignments by therapist profile ID
router.get(
  "/therapists/:therapistId",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER, USER_ROLES.THERAPIST),
  async function (req, res) {
    try {
      const therapist = await prisma.therapist.findUnique({
        where: {
          id: req.params.therapistId
        }
      });

      if (!therapist) {
        return res.status(404).json({
          success: false,
          message: "Therapist profile not found"
        });
      }

      if (
        req.user.role === USER_ROLES.THERAPIST &&
        !therapistOwnsProfile(req, therapist)
      ) {
        return res.status(403).json({
          success: false,
          message: "You can only view your own service assignments"
        });
      }

      const assignments = await prisma.therapistService.findMany({
        where: {
          therapistId: req.params.therapistId
        },
        include: assignmentInclude(),
        orderBy: {
          createdAt: "desc"
        }
      });

      const result = assignments.map(function (assignment) {
        return sanitizeAssignment(assignment);
      });

      return res.json({
        success: true,
        count: result.length,
        assignments: result
      });
    } catch (error) {
      console.error("Get assignments by therapist error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load therapist assignments"
      });
    }
  }
);

// GET assignments by service ID
router.get(
  "/services/:serviceId",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const service = await prisma.service.findUnique({
        where: {
          id: req.params.serviceId
        }
      });

      if (!service) {
        return res.status(404).json({
          success: false,
          message: "Service not found"
        });
      }

      const assignments = await prisma.therapistService.findMany({
        where: {
          serviceId: req.params.serviceId
        },
        include: assignmentInclude(),
        orderBy: {
          createdAt: "desc"
        }
      });

      const result = assignments.map(function (assignment) {
        return sanitizeAssignment(assignment);
      });

      return res.json({
        success: true,
        count: result.length,
        assignments: result
      });
    } catch (error) {
      console.error("Get assignments by service error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load service assignments"
      });
    }
  }
);

// CREATE therapist-service assignment
router.post(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const result = createAssignmentSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: result.error.flatten()
        });
      }

      const existingAssignment = await prisma.therapistService.findFirst({
        where: {
          therapistId: result.data.therapistId,
          serviceId: result.data.serviceId
        }
      });

      if (existingAssignment) {
        const currentLocationIds = existingAssignment.locationIds || [];
        const newLocationIds = result.data.locationIds || [];

        const currentAppointmentTypes = existingAssignment.appointmentTypes || [];
        const newAppointmentTypes = result.data.appointmentTypes || [];

        const updatedAssignment = await prisma.therapistService.update({
          where: {
            id: existingAssignment.id
          },
          data: {
            locationIds: Array.from(
              new Set([...currentLocationIds, ...newLocationIds])
            ),
            appointmentTypes: Array.from(
              new Set([...currentAppointmentTypes, ...newAppointmentTypes])
            ),
            notes: result.data.notes || existingAssignment.notes || "",
            status: "active",
            updatedAt: new Date()
          },
          include: assignmentInclude()
        });

        // Temporary sync while availability/appointments still use db.json
        upsertJsonAssignment(updatedAssignment);

        await addPrismaAuditLog(
          "THERAPIST_SERVICE_ASSIGNMENT_UPDATED",
          req.user.email,
          `Updated therapist-service assignment ${updatedAssignment.id}`
        );

        return res.json({
          success: true,
          message: "Therapist service assignment updated successfully",
          therapistService: sanitizeAssignment(updatedAssignment),
          assignment: sanitizeAssignment(updatedAssignment)
        });
      }

      const therapist = await prisma.therapist.findUnique({
        where: {
          id: result.data.therapistId
        }
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

      const service = await prisma.service.findUnique({
        where: {
          id: result.data.serviceId
        }
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

      const assignment = await prisma.therapistService.create({
        data: {
          id: createId("therapist-service"),
          therapistId: result.data.therapistId,
          serviceId: result.data.serviceId,
          locationIds: result.data.locationIds || [],
          appointmentTypes: result.data.appointmentTypes || [],
          notes: result.data.notes || "",
          status: "active"
        },
        include: assignmentInclude()
      });

      // Temporary sync while availability/appointments still use db.json
      upsertJsonAssignment(assignment);

      await addPrismaAuditLog(
        "THERAPIST_SERVICE_ASSIGNED",
        req.user.email,
        `Assigned therapist ${assignment.therapistId} to service ${assignment.serviceId}`
      );

      return res.status(201).json({
        success: true,
        message: "Therapist assigned to service successfully",
        assignment: sanitizeAssignment(assignment)
      });
    } catch (error) {
      console.error("Create therapist-service assignment error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create therapist-service assignment"
      });
    }
  }
);

// UPDATE assignment
router.patch(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const result = updateAssignmentSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: result.error.flatten()
        });
      }

      const assignment = await prisma.therapistService.findUnique({
        where: {
          id: req.params.id
        }
      });

      if (!assignment) {
        return res.status(404).json({
          success: false,
          message: "Assignment not found"
        });
      }

      const updateData = {};

      const allowedFields = ["locationIds", "appointmentTypes", "notes"];

      allowedFields.forEach(function (field) {
        if (Object.prototype.hasOwnProperty.call(result.data, field)) {
          updateData[field] = result.data[field];
        }
      });

      updateData.updatedAt = new Date();

      const updatedAssignment = await prisma.therapistService.update({
        where: {
          id: assignment.id
        },
        data: updateData,
        include: assignmentInclude()
      });

      // Temporary sync while availability/appointments still use db.json
      upsertJsonAssignment(updatedAssignment);

      await addPrismaAuditLog(
        "THERAPIST_SERVICE_ASSIGNMENT_UPDATED",
        req.user.email,
        `Updated therapist-service assignment ${updatedAssignment.id}`
      );

      return res.json({
        success: true,
        message: "Assignment updated successfully",
        assignment: sanitizeAssignment(updatedAssignment)
      });
    } catch (error) {
      console.error("Update therapist-service assignment error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update therapist-service assignment"
      });
    }
  }
);

// ACTIVE / INACTIVE assignment
router.patch(
  "/:id/status",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const result = updateStatusSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid status",
          errors: result.error.flatten()
        });
      }

      const assignment = await prisma.therapistService.findUnique({
        where: {
          id: req.params.id
        }
      });

      if (!assignment) {
        return res.status(404).json({
          success: false,
          message: "Assignment not found"
        });
      }

      const updatedAssignment = await prisma.therapistService.update({
        where: {
          id: assignment.id
        },
        data: {
          status: result.data.status,
          updatedAt: new Date()
        },
        include: assignmentInclude()
      });

      // Temporary sync while availability/appointments still use db.json
      upsertJsonAssignment(updatedAssignment);

      await addPrismaAuditLog(
        "THERAPIST_SERVICE_ASSIGNMENT_STATUS_UPDATED",
        req.user.email,
        `Changed assignment ${updatedAssignment.id} status to ${updatedAssignment.status}`
      );

      return res.json({
        success: true,
        message: "Assignment status updated successfully",
        assignment: sanitizeAssignment(updatedAssignment)
      });
    } catch (error) {
      console.error("Update therapist-service assignment status error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update assignment status"
      });
    }
  }
);

module.exports = router;