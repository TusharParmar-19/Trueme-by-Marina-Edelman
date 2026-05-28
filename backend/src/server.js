require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const authRoutes = require("./modules/auth/auth.routes");
const userRoutes = require("./modules/users/users.routes");
const therapistRoutes = require("./modules/therapists/therapists.routes");
const serviceRoutes = require("./modules/services/services.routes");
const locationRoutes = require("./modules/locations/locations.routes");
const availabilityRoutes = require("./modules/availability/availability.routes");
const therapistServiceRoutes = require("./modules/therapistServices/therapistServices.routes");
const appointmentsRoutes = require("./modules/appointments/appointments.routes");
const waitlistRoutes = require("./modules/waitlist/waitlist.routes");
const dashboardRoutes = require("./modules/dashboard/dashboard.routes");

const app = express();

const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/therapists", therapistRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/availability", availabilityRoutes);
app.use("/api/therapist-services", therapistServiceRoutes);
app.use("/api/appointments", appointmentsRoutes);
app.use("/api/waitlist", waitlistRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.get("/", function (req, res) {
  res.json({
    success: true,
    message: "TrueMe EHR backend is running",
  });
});

app.get("/api/health", function (req, res) {
  res.json({
    success: true,
    status: "healthy",
    service: "trueme-ehr-backend",
  });
});

app.listen(PORT, function () {
  console.log("Server running on port " + PORT);
});