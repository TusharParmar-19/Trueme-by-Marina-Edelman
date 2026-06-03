import { Navigate, Route, Routes } from "react-router-dom";

import LoginPage from "./pages/auth/LoginPage";
import AdminDashboard from "./pages/admin/AdminDashboard";
import TherapistDashboard from "./pages/therapist/TherapistDashboard";
import ClientDashboard from "./pages/client/ClientDashboard";
import AdminAppointments from "./pages/admin/AdminAppointments";
import AdminWaitlist from "./pages/admin/AdminWaitlist";
import ManagerDashboard from "./pages/manager/ManagerDashboard";
import AdminTherapists from "./pages/admin/AdminTherapists";
import AdminClients from "./pages/admin/AdminClients";
import AdminServices from "./pages/admin/AdminServices";
import AdminLocations from "./pages/admin/AdminLocations";
import AdminAvailability from "./pages/admin/AdminAvailability";
import AdminRooms from "./pages/admin/AdminRooms";
import CalendarPage from "./pages/shared/CalendarPage";

import { getUser, isLoggedIn, hasRole } from "./utils/auth";

function getDefaultRouteByRole() {
  const user = getUser();

  if (!user) return "/login";

  if (user.role === "admin") return "/admin";
  if (user.role === "office_manager") return "/manager";
  if (user.role === "therapist") return "/therapist";
  if (user.role === "client") return "/client";

  return "/login";
}

function ProtectedRoute({ children, roles }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !hasRole(roles)) {
    return <Navigate to={getDefaultRouteByRole()} replace />;
  }

  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={["admin"]}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/appointments"
        element={
          <ProtectedRoute roles={["admin"]}>
            <AdminAppointments />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/waitlist"
        element={
          <ProtectedRoute roles={["admin"]}>
            <AdminWaitlist />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/therapists"
        element={
          <ProtectedRoute roles={["admin"]}>
            <AdminTherapists />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/clients"
        element={
          <ProtectedRoute roles={["admin"]}>
            <AdminClients />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/services"
        element={
          <ProtectedRoute roles={["admin"]}>
            <AdminServices />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/locations"
        element={
          <ProtectedRoute roles={["admin"]}>
            <AdminLocations />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/availability"
        element={
          <ProtectedRoute roles={["admin"]}>
            <AdminAvailability />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/rooms"
        element={
          <ProtectedRoute roles={["admin"]}>
            <AdminRooms />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/calendar"
        element={
          <ProtectedRoute roles={["admin"]}>
            <CalendarPage role="admin" />
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager"
        element={
          <ProtectedRoute roles={["office_manager"]}>
            <ManagerDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager/appointments"
        element={
          <ProtectedRoute roles={["office_manager"]}>
            <AdminAppointments />
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager/waitlist"
        element={
          <ProtectedRoute roles={["office_manager"]}>
            <AdminWaitlist />
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager/therapists"
        element={
          <ProtectedRoute roles={["office_manager"]}>
            <AdminTherapists />
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager/clients"
        element={
          <ProtectedRoute roles={["office_manager"]}>
            <AdminClients />
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager/services"
        element={
          <ProtectedRoute roles={["office_manager"]}>
            <AdminServices />
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager/locations"
        element={
          <ProtectedRoute roles={["office_manager"]}>
            <AdminLocations />
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager/availability"
        element={
          <ProtectedRoute roles={["office_manager"]}>
            <AdminAvailability />
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager/rooms"
        element={
          <ProtectedRoute roles={["office_manager"]}>
            <AdminRooms />
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager/calendar"
        element={
          <ProtectedRoute roles={["office_manager"]}>
            <CalendarPage role="office_manager" />
          </ProtectedRoute>
        }
      />

      <Route
        path="/therapist"
        element={
          <ProtectedRoute roles={["therapist"]}>
            <TherapistDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/therapist/calendar"
        element={
          <ProtectedRoute roles={["therapist"]}>
            <CalendarPage role="therapist" />
          </ProtectedRoute>
        }
      />

      <Route
        path="/client"
        element={
          <ProtectedRoute roles={["client"]}>
            <ClientDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/client/calendar"
        element={
          <ProtectedRoute roles={["client"]}>
            <CalendarPage role="client" />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
