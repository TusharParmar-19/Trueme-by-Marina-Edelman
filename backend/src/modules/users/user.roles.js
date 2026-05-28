const USER_ROLES = {
  ADMIN: "admin",
  OFFICE_MANAGER: "office_manager",
  THERAPIST: "therapist",
  CLIENT: "client"
};

const ALLOWED_ROLES = [
  USER_ROLES.ADMIN,
  USER_ROLES.OFFICE_MANAGER,
  USER_ROLES.THERAPIST,
  USER_ROLES.CLIENT
];

module.exports = {
  USER_ROLES,
  ALLOWED_ROLES
};

