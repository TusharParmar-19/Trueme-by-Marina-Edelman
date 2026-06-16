import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarCheck,
  Hourglass,
  UserRoundCheck,
  UsersRound,
  ClipboardList,
  MapPin,
  Clock3,
  DoorOpen,
  CalendarDays,
  LogOut,
} from "lucide-react";

import { getUser, logout } from "../utils/auth";

function getInitials(name) {
  return (
    String(name || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  );
}

const adminLinks = [
  { label: "Dashboard", path: "/admin", Icon: LayoutDashboard },
  { label: "Appointments", path: "/admin/appointments", Icon: CalendarCheck },
  { label: "Waitlist", path: "/admin/waitlist", Icon: Hourglass },
  { label: "Therapists", path: "/admin/therapists", Icon: UserRoundCheck },
  { label: "Clients", path: "/admin/clients", Icon: UsersRound },
  { label: "Services", path: "/admin/services", Icon: ClipboardList },
  { label: "Locations", path: "/admin/locations", Icon: MapPin },
  { label: "Availability", path: "/admin/availability", Icon: Clock3 },
  { label: "Rooms", path: "/admin/rooms", Icon: DoorOpen },
  { label: "Calendar", path: "/admin/calendar", Icon: CalendarDays },
];

const managerLinks = [
  { label: "Dashboard", path: "/manager", Icon: LayoutDashboard },
  { label: "Appointments", path: "/manager/appointments", Icon: CalendarCheck },
  { label: "Waitlist", path: "/manager/waitlist", Icon: Hourglass },
  { label: "Therapists", path: "/manager/therapists", Icon: UserRoundCheck },
  { label: "Clients", path: "/manager/clients", Icon: UsersRound },
  { label: "Services", path: "/manager/services", Icon: ClipboardList },
  { label: "Locations", path: "/manager/locations", Icon: MapPin },
  { label: "Availability", path: "/manager/availability", Icon: Clock3 },
  { label: "Rooms", path: "/manager/rooms", Icon: DoorOpen },
  { label: "Calendar", path: "/manager/calendar", Icon: CalendarDays },
];

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
      return adminLinks;
    }

    if (user.role === "office_manager") {
      return managerLinks;
    }

    if (user.role === "therapist") {
      return [
        { label: "Dashboard", path: "/therapist", Icon: LayoutDashboard },
        { label: "Calendar", path: "/therapist/calendar", Icon: CalendarDays },
      ];
    }

    if (user.role === "client") {
      return [
        { label: "Dashboard", path: "/client", Icon: LayoutDashboard },
        { label: "Calendar", path: "/client/calendar", Icon: CalendarDays },
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
          {links.map((link) => {
            const Icon = link.Icon;

            return (
              <NavLink
                key={link.path}
                to={link.path}
                end={link.label === "Dashboard"}
                className={({ isActive }) =>
                  isActive ? "nav-link active" : "nav-link"
                }
              >
                <Icon className="nav-link-icon" size={18} strokeWidth={2.25} />
                <span>{link.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-box compact-user-box">
            <span className="sidebar-avatar">{getInitials(user?.name)}</span>
            <span>
              <strong>{user?.name || "User"}</strong>
              <small>{user?.role}</small>
            </span>
          </div>

          <button className="btn secondary logout-full" onClick={handleLogout}>
            <LogOut size={17} strokeWidth={2.35} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        {title || subtitle ? (
          <div className="top-header">
            <div>
              {title ? <h1>{title}</h1> : null}
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
          </div>
        ) : null}

        {children}
      </main>
    </div>
  );
}

export default DashboardLayout;
