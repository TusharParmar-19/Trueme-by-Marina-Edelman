import { Navigate, Route, Routes } from "react-router-dom";

import LoginPage from "./pages/auth/LoginPage";
import AdminDashboard from "./pages/admin/AdminDashboard";
import TherapistDashboard from "./pages/therapist/TherapistDashboard";
import ClientDashboard from "./pages/client/ClientDashboard";
import AdminAppointments from "./pages/admin/AdminAppointments";
import AdminWaitlist from "./pages/admin/AdminWaitlist";
import ManagerDashboard from "./pages/manager/ManagerDashboard";

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
  path="/therapist"
  element={
    <ProtectedRoute roles={["therapist"]}>
      <TherapistDashboard />
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

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;