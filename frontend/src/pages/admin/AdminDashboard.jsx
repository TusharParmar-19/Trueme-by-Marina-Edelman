import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarCheck,
  CalendarClock,
  Hourglass,
  RefreshCw,
  UsersRound,
  CalendarDays,
} from "lucide-react";
import { apiRequest } from "../../api/apiClient";
import { getUser } from "../../utils/auth";
import DashboardLayout from "../../layouts/DashboardLayout";

function getInitials(name) {
  return (
    String(name || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "T"
  );
}

function getServiceParts(serviceName) {
  const text = String(serviceName || "").trim();

  const match = text.match(
    /^(.*?)(\d+\s*(?:minute|minutes|min|mins|hour|hours|hr|hrs))$/i,
  );

  if (!match) {
    return {
      name: text,
      duration: "",
    };
  }

  return {
    name: match[1].trim(),
    duration: match[2].trim(),
  };
}

function StatCard({ label, value, hint, tone = "green", Icon }) {
  return (
    <div className={`dashboard-stat-card ${tone}`}>
      <div className="dashboard-stat-topline">
        <span className="dashboard-stat-icon">
          <Icon size={19} strokeWidth={2.4} />
        </span>
        <span className="dashboard-stat-label">{label}</span>
      </div>

      <strong className="dashboard-stat-value">{value}</strong>

      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function WorkloadProgress({ today, upcoming }) {
  const todayCount = Number(today) || 0;
  const upcomingCount = Number(upcoming) || 0;
  const total = todayCount + upcomingCount;
  const percent = total > 0 ? Math.round((todayCount / total) * 100) : 0;

  return (
    <div className="workload-meter" aria-label={`Today workload ${percent}%`}>
      <div className="workload-track">
        <span style={{ width: `${percent}%` }} />
      </div>
      <small>{total > 0 ? `${percent}% today` : "No booked workload"}</small>
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="dashboard-empty-state">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function AdminDashboard() {
  const user = getUser();
  const navigate = useNavigate();

  const [dashboard, setDashboard] = useState(null);
  const [date, setDate] = useState("2026-06-08");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard(selectedDate = date) {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest(`/dashboard/admin?date=${selectedDate}`);
      setDashboard(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDateChange(event) {
    const selectedDate = event.target.value;
    setDate(selectedDate);
    loadDashboard(selectedDate);
  }

  const summary = dashboard?.summary || {};
  const todayAppointments = dashboard?.todayAppointments || [];
  const therapistWorkload = dashboard?.therapistWorkload || [];
  const upcomingAppointments = dashboard?.upcomingAppointments || [];
  const upcomingPreview = upcomingAppointments.slice(0, 5);

  return (
    <DashboardLayout>
      <section className="admin-dashboard-page">
        <div className="admin-dashboard-hero">
          <div>
            <span className="section-eyebrow">Operations overview</span>
            <h1>Admin Dashboard</h1>
            <p>Welcome, {user?.name || "Admin"}.</p>
          </div>

          <div className="admin-dashboard-actions">
            <label className="inline-date-filter dashboard-date-filter">
              <span>Dashboard Date</span>
              <input
                className="input"
                type="date"
                value={date}
                onChange={handleDateChange}
              />
            </label>

            <button
              className="btn secondary"
              onClick={() => loadDashboard(date)}
            >
              <RefreshCw size={17} strokeWidth={2.35} />
              <span>Refresh</span>
            </button>

            <button
              className="btn"
              onClick={() => navigate("/admin/appointments")}
            >
              <CalendarCheck size={17} strokeWidth={2.35} />
              <span>Manage Appointments</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="card dashboard-message">Loading dashboard...</div>
        ) : null}

        {error ? (
          <div className="card error dashboard-message">{error}</div>
        ) : null}

        {dashboard ? (
          <>
            <div className="dashboard-stats-grid">
              <StatCard
                Icon={CalendarCheck}
                label="Today’s Appointments"
                value={summary.todayAppointments}
                hint="Selected dashboard date"
                tone="gold"
              />

              <StatCard
                Icon={CalendarClock}
                label="Upcoming Appointments"
                value={summary.upcomingAppointments}
                hint="Confirmed future bookings"
                tone="green"
              />

              <StatCard
                Icon={Hourglass}
                label="Active Waitlist"
                value={summary.activeWaitlist}
                hint="Needs admin attention"
                tone="red"
              />

              <StatCard
                Icon={UsersRound}
                label="Active Therapists"
                value={summary.activeTherapistProfiles}
                hint="Available provider profiles"
                tone="green"
              />
            </div>

            <div className="dashboard-content-grid">
              <div className="dashboard-left-column">
                <div className="card dashboard-panel today-agenda-panel">
                  <div className="panel-heading-row">
                    <div>
                      <span className="section-eyebrow">Today</span>
                      <h2>Today’s Agenda</h2>
                    </div>

                    <button
                      className="btn secondary small-btn"
                      onClick={() => navigate("/admin/calendar")}
                    >
                      <CalendarDays size={16} strokeWidth={2.35} />
                      <span>Open Schedule</span>
                    </button>
                  </div>

                  {todayAppointments.length === 0 ? (
                    <EmptyState
                      title="No appointments for this date"
                      text="Change the dashboard date or open the calendar to review another day."
                    />
                  ) : (
                    <table className="table dashboard-agenda-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Client</th>
                          <th>Therapist</th>
                          <th>Status</th>
                        </tr>
                      </thead>

                      <tbody>
                        {todayAppointments.map((appointment) => {
                          const service = getServiceParts(
                            appointment.serviceName,
                          );

                          return (
                            <tr key={appointment.id}>
                              <td className="time-cell">
                                {appointment.startTime} - {appointment.endTime}
                              </td>

                              <td>
                                <strong className="client-name-text">
                                  {appointment.clientName}
                                </strong>

                                <small className="therapy-name-text">
                                  {service.name}
                                </small>

                                {service.duration ? (
                                  <small className="therapy-duration-text">
                                    {service.duration}
                                  </small>
                                ) : null}
                              </td>

                              <td>
                                <div className="avatar-name">
                                  <span className="initials-avatar">
                                    {getInitials(appointment.therapistName)}
                                  </span>
                                  <span>{appointment.therapistName}</span>
                                </div>
                              </td>

                              <td>
                                <span className={`badge ${appointment.status}`}>
                                  {appointment.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="card dashboard-panel upcoming-panel">
                  <div className="panel-heading-row">
                    <div>
                      <span className="section-eyebrow">Next</span>
                      <h2>Upcoming Schedule</h2>
                      <p>
                        Showing {upcomingPreview.length} of{" "}
                        {upcomingAppointments.length} upcoming confirmed
                        appointments.
                      </p>
                    </div>

                    <button
                      className="btn secondary small-btn"
                      onClick={() => navigate("/admin/calendar")}
                    >
                      <CalendarDays size={16} strokeWidth={2.35} />
                      <span>Calendar View</span>
                    </button>
                  </div>

                  {upcomingAppointments.length === 0 ? (
                    <EmptyState
                      title="No upcoming appointments"
                      text="Future appointments will appear here once bookings are confirmed."
                    />
                  ) : (
                    <div className="upcoming-list">
                      {upcomingPreview.map((appointment) => (
                        <article className="upcoming-item" key={appointment.id}>
                          <div className="upcoming-date-box">
                            <strong>{appointment.date}</strong>
                            <span>
                              {appointment.startTime} - {appointment.endTime}
                            </span>
                          </div>

                          <div className="upcoming-main">
                            {(() => {
                              const service = getServiceParts(
                                appointment.serviceName,
                              );

                              return (
                                <>
                                  <strong className="client-name-text">
                                    {appointment.clientName}
                                  </strong>
                                  <small className="therapy-name-text">
                                    {service.name}
                                  </small>
                                  {service.duration ? (
                                    <small className="therapy-duration-text">
                                      {service.duration}
                                    </small>
                                  ) : null}
                                </>
                              );
                            })()}
                          </div>

                          <div className="avatar-name upcoming-therapist">
                            <span className="initials-avatar">
                              {getInitials(appointment.therapistName)}
                            </span>
                            <span>{appointment.therapistName}</span>
                          </div>

                          <span className={`badge ${appointment.status}`}>
                            {appointment.status}
                          </span>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="dashboard-right-column">
                <aside className="card dashboard-panel workload-panel">
                  <div className="panel-heading-row compact">
                    <div>
                      <span className="section-eyebrow">Capacity</span>
                      <h2>Therapist Workload</h2>
                      <p>Quick view of today vs upcoming load.</p>
                    </div>
                  </div>

                  {therapistWorkload.length === 0 ? (
                    <EmptyState
                      title="No therapist profiles found"
                      text="Therapist workload will appear once profiles are available."
                    />
                  ) : (
                    <div className="workload-list">
                      {therapistWorkload.map((therapist) => (
                        <article
                          className="workload-card"
                          key={therapist.therapistId}
                        >
                          <div className="workload-card-header">
                            <div className="avatar-name">
                              <span className="initials-avatar">
                                {getInitials(therapist.therapistName)}
                              </span>

                              <span>
                                <strong>{therapist.therapistName}</strong>
                                <small>{therapist.therapistEmail}</small>
                              </span>
                            </div>

                            <span
                              className={`badge ${therapist.profileStatus}`}
                            >
                              {therapist.profileStatus}
                            </span>
                          </div>

                          <div className="workload-counts">
                            <span>
                              <strong>{therapist.todayAppointments}</strong>
                              <small>Today</small>
                            </span>

                            <span>
                              <strong>{therapist.upcomingAppointments}</strong>
                              <small>Upcoming</small>
                            </span>
                          </div>

                          <WorkloadProgress
                            today={therapist.todayAppointments}
                            upcoming={therapist.upcomingAppointments}
                          />
                        </article>
                      ))}
                    </div>
                  )}
                </aside>

                <div className="card dashboard-panel system-overview-panel">
                  <div>
                    <span className="section-eyebrow">System</span>
                    <h2>System Overview</h2>
                  </div>

                  <div className="system-overview-grid">
                    <span>
                      <strong>{summary.totalClients}</strong>
                      <small>Total Clients</small>
                    </span>

                    <span>
                      <strong>{summary.activeServices}</strong>
                      <small>Active Services</small>
                    </span>

                    <span>
                      <strong>{summary.activeLocations}</strong>
                      <small>Active Locations</small>
                    </span>

                    <span>
                      <strong>{summary.totalTherapistProfiles}</strong>
                      <small>Therapist Profiles</small>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </section>
    </DashboardLayout>
  );
}

export default AdminDashboard;
