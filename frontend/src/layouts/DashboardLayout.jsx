import { NavLink, useNavigate } from "react-router-dom";

import { getUser, logout } from "../utils/auth";

function DashboardLayout({ children, title, subtitle }) {
  const navigate = useNavigate();
  const user = getUser();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  function getLinks() {
    if (!user) return [];

    if (user.role === "admin") {
      return [
        { label: "Dashboard", path: "/admin" },
        { label: "Appointments", path: "/admin/appointments" },
        { label: "Waitlist", path: "/admin/waitlist" },
        { label: "Therapists", path: "/admin/therapists" },
        { label: "Clients", path: "/admin/clients" },
        { label: "Services", path: "/admin/services" },
        { label: "Locations", path: "/admin/locations" },
        { label: "Availability", path: "/admin/availability" },
        { label: "Rooms", path: "/admin/rooms" },
        { label: "Calendar", path: "/admin/calendar" },
      ];
    }

    if (user.role === "office_manager") {
      return [
        { label: "Dashboard", path: "/manager" },
        { label: "Appointments", path: "/manager/appointments" },
        { label: "Waitlist", path: "/manager/waitlist" },
        { label: "Therapists", path: "/manager/therapists" },
        { label: "Clients", path: "/manager/clients" },
        { label: "Services", path: "/manager/services" },
        { label: "Locations", path: "/manager/locations" },
        { label: "Availability", path: "/manager/availability" },
        { label: "Rooms", path: "/manager/rooms" },
        { label: "Calendar", path: "/manager/calendar" },
      ];
    }

    if (user.role === "therapist") { 
      return [
        { label: "Dashboard", path: "/therapist" },
        { label: "Calendar", path: "/therapist/calendar" }
      ];
    }

    if (user.role === "client") {
      return [
        { label: "Dashboard", path: "/client" },
        { label: "Calendar", path: "/client/calendar" }
      ];
    }

    return []; 
  }

  const links = getLinks();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">T</div>
          <div>
            <strong>TrueMe</strong>
            <span>Scheduling</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {links.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              end={link.label === "Dashboard"}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-box">
            <strong>{user?.name || "User"}</strong>
            <span>{user?.role}</span>
          </div>

          <button className="btn secondary logout-full" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div className="top-header">
          <div>
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}

export default DashboardLayout;
