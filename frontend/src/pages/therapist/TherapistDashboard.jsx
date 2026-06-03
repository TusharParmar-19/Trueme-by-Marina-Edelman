import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../../api/apiClient";
import { getUser, logout } from "../../utils/auth";
import DashboardLayout from "../../layouts/DashboardLayout";

function getRoomDisplay(appointment) {
  if (appointment.appointmentType === "telehealth") {
    return "Online";
  }

  return (
    appointment.roomName ||
    appointment.room?.name ||
    appointment.roomId ||
    "Not assigned"
  );
}

function TherapistDashboard() {
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
      const data = await apiRequest(`/dashboard/therapist?date=${selectedDate}`);
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
      title="Therapist Dashboard"
      subtitle={`Welcome, ${user?.name || "Therapist"}`}
    >
      {/* <div className="dashboard-header">
        <div>
          <h1>Therapist Dashboard</h1>
          <p>Welcome, {user?.name || "Therapist"}</p>
        </div>

        <button className="btn secondary" onClick={handleLogout}>
          Logout
        </button>
      </div> */}

      <div className="card dashboard-filter">
        <label>Dashboard Date</label>
        <input
          className="input"
          type="date"
          value={date}
          onChange={handleDateChange}
        />
      </div>

      {loading ? (
        <div className="card">Loading therapist dashboard...</div>
      ) : null}

      {error ? <div className="card error">{error}</div> : null}

      {dashboard ? (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Today’s Appointments</div>
              <div className="stat-value">
                {dashboard.summary.todayAppointments}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Upcoming Appointments</div>
              <div className="stat-value">
                {dashboard.summary.upcomingAppointments}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Assigned Clients</div>
              <div className="stat-value">
                {dashboard.summary.assignedClients}
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Today’s Appointments</h2>

            {dashboard.todayAppointments.length === 0 ? (
              <p>No appointments for this date.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Client</th>
                    <th>Service</th>
                    <th>Location</th>
                    <th>Room</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {dashboard.todayAppointments.map((appointment) => (
                    <tr key={appointment.id}>
                      <td>
                        {appointment.startTime} - {appointment.endTime}
                      </td>
                      <td>
                        <strong>{appointment.clientName}</strong>
                        <br />
                        <small>{appointment.clientEmail}</small>
                      </td>
                      <td>{appointment.serviceName}</td>
                      <td>{appointment.locationName}</td>
                      <td>{getRoomDisplay(appointment)}</td>
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
                    <th>Service</th>
                    <th>Location</th>
                    <th>Room</th>
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
                      <td>
                        <strong>{appointment.clientName}</strong>
                        <br />
                        <small>{appointment.clientEmail}</small>
                      </td>
                      <td>{appointment.serviceName}</td>
                      <td>{appointment.locationName}</td>
                      <td>{getRoomDisplay(appointment)}</td>
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
            <h2>Assigned Clients</h2>

            {dashboard.assignedClients.length === 0 ? (
              <p>No assigned clients yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Email</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {dashboard.assignedClients.map((client) => (
                    <tr key={client.id}>
                      <td>{client.name}</td>
                      <td>{client.email}</td>
                      <td>
                        <span className={`badge ${client.status}`}>
                          {client.status}
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

export default TherapistDashboard;