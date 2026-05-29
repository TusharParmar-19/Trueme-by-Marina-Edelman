import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../../api/apiClient";
import { getUser, logout } from "../../utils/auth";
import DashboardLayout from "../../layouts/DashboardLayout";

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function ManagerDashboard() {
  const navigate = useNavigate();
  const user = getUser();

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

  function handleDateChange(event) {
    const selectedDate = event.target.value;
    setDate(selectedDate);
    loadDashboard(selectedDate);
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  useEffect(() => {
    loadDashboard(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DashboardLayout
  title="Office Manager Dashboard"
  subtitle={`Welcome, ${user?.name || "Office Manager"}`}
>
      {/* <div className="dashboard-header">
        <div>
          <h1>Office Manager Dashboard</h1>
          <p>Welcome, {user?.name || "Office Manager"}</p>
        </div>

        <div className="header-actions">
          <button className="btn" onClick={() => navigate("/manager/appointments")}>
            Appointments
          </button>

          <button className="btn" onClick={() => navigate("/manager/waitlist")}>
            Waitlist
          </button>

          <button className="btn secondary" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div> */}

      <div className="card dashboard-filter">
        <label>Operations Date</label>
        <input
          className="input"
          type="date"
          value={date}
          onChange={handleDateChange}
        />
      </div>

      {loading ? <div className="card">Loading manager dashboard...</div> : null}

      {error ? <div className="card error">{error}</div> : null}

      {dashboard ? (
        <>
          <div className="stats-grid">
            <StatCard
              label="Today's Appointments"
              value={dashboard.summary.todayAppointments}
            />

            <StatCard
              label="Upcoming Appointments"
              value={dashboard.summary.upcomingAppointments}
            />

            <StatCard
              label="Active Waitlist"
              value={dashboard.summary.activeWaitlist}
            />

            <StatCard
              label="Active Therapists"
              value={dashboard.summary.activeTherapistProfiles}
            />
          </div>

          <div className="dashboard-grid">
            <div className="card">
              <h2>Today’s Schedule</h2>

              {dashboard.todayAppointments.length === 0 ? (
                <p>No appointments for this date.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Client</th>
                      <th>Therapist</th>
                      <th>Service</th>
                      <th>Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {dashboard.todayAppointments.map((appointment) => (
                      <tr key={appointment.id}>
                        <td>
                          {appointment.startTime} - {appointment.endTime}
                        </td>
                        <td>{appointment.clientName}</td>
                        <td>{appointment.therapistName}</td>
                        <td>{appointment.serviceName}</td>
                        <td>
                          <span className={`badge ${appointment.status}`}>
                            {appointment.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card">
              <h2>Therapist Workload</h2>

              {dashboard.therapistWorkload.length === 0 ? (
                <p>No therapist profiles found.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Therapist</th>
                      <th>Today</th>
                      <th>Upcoming</th>
                    </tr>
                  </thead>

                  <tbody>
                    {dashboard.therapistWorkload.map((therapist) => (
                      <tr key={therapist.therapistId}>
                        <td>
                          <strong>{therapist.therapistName}</strong>
                          <br />
                          <small>{therapist.therapistEmail}</small>
                        </td>
                        <td>{therapist.todayAppointments}</td>
                        <td>{therapist.upcomingAppointments}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="card">
            <h2>Upcoming Appointments</h2>

            {dashboard.upcomingAppointments.length === 0 ? (
              <p>No upcoming appointments.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Client</th>
                    <th>Therapist</th>
                    <th>Service</th>
                    <th>Location</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {dashboard.upcomingAppointments.map((appointment) => (
                    <tr key={appointment.id}>
                      <td>{appointment.date}</td>
                      <td>
                        {appointment.startTime} - {appointment.endTime}
                      </td>
                      <td>{appointment.clientName}</td>
                      <td>{appointment.therapistName}</td>
                      <td>{appointment.serviceName}</td>
                      <td>{appointment.locationName}</td>
                      <td>
                        <span className={`badge ${appointment.status}`}>
                          {appointment.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </DashboardLayout>
  );
}

export default ManagerDashboard;