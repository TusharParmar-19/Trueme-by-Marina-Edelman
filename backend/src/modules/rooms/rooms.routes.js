const express = require("express");
const { z } = require("zod");

const { loadDB, saveDB, addAuditLog } = require("../../utils/db");
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

function ensureRooms(db) {
  if (!db.rooms) {
    db.rooms = [];
  }
}

function getLocation(db, locationId) {
  return db.locations.find(function (location) {
    return location.id === locationId;
  });
}

function sanitizeRoom(room, db) {
  const location = getLocation(db, room.locationId);

  return {
    id: room.id,
    locationId: room.locationId,
    locationName: location ? location.name : null,
    name: room.name,
    status: room.status,
    notes: room.notes || "",
    createdAt: room.createdAt,
    updatedAt: room.updatedAt || null
  };
}

// GET all rooms
router.get(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const db = loadDB();
    ensureRooms(db);

    let rooms = db.rooms;

    if (req.query.locationId) {
      rooms = rooms.filter(function (room) {
        return room.locationId === req.query.locationId;
      });
    }

    const result = rooms.map(function (room) {
      return sanitizeRoom(room, db);
    });

    return res.json({
      success: true,
      count: result.length,
      rooms: result
    });
  }
);

// CREATE room
router.post(
  "/",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = createRoomSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: result.error.flatten()
      });
    }

    const db = loadDB();
    ensureRooms(db);

    const location = getLocation(db, result.data.locationId);

    if (!location || location.status !== "active") {
      return res.status(404).json({
        success: false,
        message: "Active location not found"
      });
    }

    const duplicateRoom = db.rooms.find(function (room) {
      return (
        room.locationId === result.data.locationId &&
        room.name.toLowerCase() === result.data.name.toLowerCase()
      );
    });

    if (duplicateRoom) {
      return res.status(400).json({
        success: false,
        message: "Room already exists for this location"
      });
    }

    const now = new Date().toISOString();

    const room = {
      id: Date.now().toString(),
      locationId: result.data.locationId,
      name: result.data.name,
      status: "active",
      notes: result.data.notes || "",
      createdAt: now,
      updatedAt: null
    };

    db.rooms.push(room);
    saveDB(db);

    addAuditLog(
      "ROOM_CREATED",
      req.user.email,
      `Room ${room.name} created for location ${location.name}`
    );

    return res.status(201).json({
      success: true,
      message: "Room created successfully",
      room: sanitizeRoom(room, db)
    });
  }
);

// UPDATE room status
router.patch(
  "/:id/status",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const result = updateRoomStatusSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
        errors: result.error.flatten()
      });
    }

    const db = loadDB();
    ensureRooms(db);

    const room = db.rooms.find(function (item) {
      return item.id === req.params.id;
    });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found"
      });
    }

    room.status = result.data.status;
    room.updatedAt = new Date().toISOString();

    saveDB(db);

    addAuditLog(
      "ROOM_STATUS_UPDATED",
      req.user.email,
      `Room ${room.id} status changed to ${room.status}`
    );

    return res.json({
      success: true,
      message: "Room status updated successfully",
      room: sanitizeRoom(room, db)
    });
  }
);

// DELETE room
router.delete(
  "/:id",
  authMiddleware,
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.OFFICE_MANAGER),
  function (req, res) {
    const db = loadDB();
    ensureRooms(db);

    const roomIndex = db.rooms.findIndex(function (room) {
      return room.id === req.params.id;
    });

    if (roomIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Room not found"
      });
    }

    const isUsedInAppointments = (db.appointments || []).some(function (
      appointment
    ) {
      return appointment.roomId === req.params.id;
    });

    if (isUsedInAppointments) {
      return res.status(400).json({
        success: false,
        message:
          "This room is already used in appointments. Archive it instead of deleting."
      });
    }

    const deletedRoom = db.rooms.splice(roomIndex, 1)[0];

    saveDB(db);

    addAuditLog(
      "ROOM_DELETED",
      req.user.email,
      `Room ${deletedRoom.name} deleted`
    );

    return res.json({
      success: true,
      message: "Room deleted successfully",
      room: deletedRoom
    });
  }
);

module.exports = router;