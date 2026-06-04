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

const createRoomSchema = z.object({
  locationId: z.string().min(1),
  name: z.string().min(1),
  notes: z.string().max(1000).optional()
});

const updateRoomStatusSchema = z.object({
  status: z.enum(["active", "inactive", "archived"])
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

function sanitizeRoom(room) {
  return {
    id: room.id,
    locationId: room.locationId,
    locationName: room.location ? room.location.name : null,
    name: room.name,
    status: room.status,
    notes: room.notes || "",
    createdAt: room.createdAt,
    updatedAt: room.updatedAt || null
  };
}

function roomToJson(room) {
  return {
    id: room.id,
    locationId: room.locationId,
    name: room.name,
    status: room.status || "active",
    notes: room.notes || "",
    createdAt: toIso(room.createdAt) || new Date().toISOString(),
    updatedAt: toIso(room.updatedAt)
  };
}

function upsertJsonRoom(room) {
  try {
    const db = loadDB();

    if (!db.rooms) {
      db.rooms = [];
    }

    const existingIndex = db.rooms.findIndex(function (item) {
      return item.id === room.id;
    });

    const jsonRoom = roomToJson(room);

    if (existingIndex >= 0) {
      db.rooms[existingIndex] = {
        ...db.rooms[existingIndex],
        ...jsonRoom
      };
    } else {
      db.rooms.push(jsonRoom);
    }

    saveDB(db);
  } catch (error) {
    console.error("Temporary db.json room sync failed:", error);
  }
}

function deleteJsonRoom(roomId) {
  try {
    const db = loadDB();

    if (!db.rooms) {
      return;
    }

    db.rooms = db.rooms.filter(function (room) {
      return room.id !== roomId;
    });

    saveDB(db);
  } catch (error) {
    console.error("Temporary db.json room delete failed:", error);
  }
}

function isRoomUsedInJsonAppointments(roomId) {
  try {
    const db = loadDB();

    return (db.appointments || []).some(function (appointment) {
      return appointment.roomId === roomId;
    });
  } catch (error) {
    console.error("Temporary db.json appointment room check failed:", error);
    return false;
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

// GET all rooms
router.get(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const where = {};

      if (req.query.locationId) {
        where.locationId = req.query.locationId;
      }

      const rooms = await prisma.room.findMany({
        where,
        include: {
          location: true
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      const result = rooms.map(function (room) {
        return sanitizeRoom(room);
      });

      return res.json({
        success: true,
        count: result.length,
        rooms: result
      });
    } catch (error) {
      console.error("Get rooms error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load rooms"
      });
    }
  }
);

// CREATE room
router.post(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const result = createRoomSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: result.error.flatten()
        });
      }

      const location = await prisma.location.findUnique({
        where: {
          id: result.data.locationId
        }
      });

      if (!location || location.status !== "active") {
        return res.status(404).json({
          success: false,
          message: "Active location not found"
        });
      }

      const existingRooms = await prisma.room.findMany({
        where: {
          locationId: result.data.locationId
        }
      });

      const duplicateRoom = existingRooms.find(function (room) {
        return room.name.toLowerCase() === result.data.name.toLowerCase();
      });

      if (duplicateRoom) {
        return res.status(400).json({
          success: false,
          message: "Room already exists for this location"
        });
      }

      const room = await prisma.room.create({
        data: {
          id: createId("room"),
          locationId: result.data.locationId,
          name: result.data.name,
          status: "active",
          notes: result.data.notes || ""
        },
        include: {
          location: true
        }
      });

      // Temporary sync while appointments/availability still use db.json
      upsertJsonRoom(room);

      await addPrismaAuditLog(
        "ROOM_CREATED",
        req.user.email,
        `Room ${room.name} created for location ${location.name}`
      );

      return res.status(201).json({
        success: true,
        message: "Room created successfully",
        room: sanitizeRoom(room)
      });
    } catch (error) {
      console.error("Create room error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create room"
      });
    }
  }
);

// UPDATE room status
router.patch(
  "/:id/status",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const result = updateRoomStatusSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid status",
          errors: result.error.flatten()
        });
      }

      const room = await prisma.room.findUnique({
        where: {
          id: req.params.id
        }
      });

      if (!room) {
        return res.status(404).json({
          success: false,
          message: "Room not found"
        });
      }

      const updatedRoom = await prisma.room.update({
        where: {
          id: room.id
        },
        data: {
          status: result.data.status,
          updatedAt: new Date()
        },
        include: {
          location: true
        }
      });

      // Temporary sync while appointments/availability still use db.json
      upsertJsonRoom(updatedRoom);

      await addPrismaAuditLog(
        "ROOM_STATUS_UPDATED",
        req.user.email,
        `Room ${updatedRoom.id} status changed to ${updatedRoom.status}`
      );

      return res.json({
        success: true,
        message: "Room status updated successfully",
        room: sanitizeRoom(updatedRoom)
      });
    } catch (error) {
      console.error("Update room status error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update room status"
      });
    }
  }
);

// DELETE room
router.delete(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  async function (req, res) {
    try {
      const room = await prisma.room.findUnique({
        where: {
          id: req.params.id
        },
        include: {
          location: true
        }
      });

      if (!room) {
        return res.status(404).json({
          success: false,
          message: "Room not found"
        });
      }

      const appointmentCount = await prisma.appointment.count({
        where: {
          roomId: room.id
        }
      });

      const isUsedInJson = isRoomUsedInJsonAppointments(room.id);

      if (appointmentCount > 0 || isUsedInJson) {
        return res.status(400).json({
          success: false,
          message:
            "This room is already used in appointments. Archive it instead of deleting."
        });
      }

      const deletedRoom = await prisma.room.delete({
        where: {
          id: room.id
        },
        include: {
          location: true
        }
      });

      // Temporary sync while appointments/availability still use db.json
      deleteJsonRoom(deletedRoom.id);

      await addPrismaAuditLog(
        "ROOM_DELETED",
        req.user.email,
        `Room ${deletedRoom.name} deleted`
      );

      return res.json({
        success: true,
        message: "Room deleted successfully",
        room: sanitizeRoom(deletedRoom)
      });
    } catch (error) {
      console.error("Delete room error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to delete room"
      });
    }
  }
);

module.exports = router;