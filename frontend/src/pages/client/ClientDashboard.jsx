import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../../api/apiClient";
import { getUser, logout } from "../../utils/auth";
import DashboardLayout from "../../layouts/DashboardLayout";

function ClientDashboard() {
  const navigate = useNavigate();
  const user = getUser();

  const [dashboard, setDashboard] = useState(null);
  const [services, setServices] = useState([]);
  const [locations, setLocations] = useState([]);
  const [slots, setSlots] = useState([]);

  const [bookingForm, setBookingForm] = useState({
    date: "2026-06-08",
    serviceId: "",
    locationId: "",
    appointmentType: "telehealth",
    startTime: ""
  });

  const [loading, setLoading] = useState(true);
  const [slotLoading, setSlotLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadDashboard(selectedDate = bookingForm.date) {
    try {
      const data = await apiRequest(`/dashboard/client?date=${selectedDate}`);
      setDashboard(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadReferenceData() {
    try {
      const [servicesData, locationsData] = await Promise.all([
        apiRequest("/services/public"),
        apiRequest("/locations/public")
      ]);

      const publicServices = servicesData.services || [];
      const publicLocations = locationsData.locations || [];

      setServices(publicServices);
      setLocations(publicLocations);

      setBookingForm((current) => ({
        ...current,
        serviceId: current.serviceId || publicServices?.[0]?.id || "",
        locationId: current.locationId || publicLocations?.[0]?.id || ""
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadPage() {
    setLoading(true);
    setError("");

    await Promise.all([loadDashboard(), loadReferenceData()]);

    setLoading(false);
  }

  async function checkSlots() {
    setError("");
    setMessage("");
    setSlots([]);

    if (!bookingForm.serviceId || !bookingForm.locationId || !bookingForm.date) {
      setError("Please select service, location, and date.");
      return;
    }

    setSlotLoading(true);

    try {
      const query = new URLSearchParams({
        date: bookingForm.date,
        serviceId: bookingForm.serviceId,
        locationId: bookingForm.locationId,
        appointmentType: bookingForm.appointmentType
      });

      const data = await apiRequest(`/appointments/slots?${query.toString()}`);

      setSlots(data.slots || []);

      if (!data.slots || data.slots.length === 0) {
        setMessage("No slots available for this date. You can ask admin to add you to waitlist.");
        return;
      }

      setBookingForm((current) => ({
        ...current,
        startTime: data.slots[0].startTime
      }));

      setMessage(`${data.slots.length} available slots found.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSlotLoading(false);
    }
  }

  async function bookAppointment(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!bookingForm.serviceId || !bookingForm.locationId || !bookingForm.startTime) {
      setError("Please select service, location, and slot.");
      return;
    }

    setBookingLoading(true);

    try {
      await apiRequest("/appointments", {
        method: "POST",
        body: JSON.stringify({
          serviceId: bookingForm.serviceId,
          locationId: bookingForm.locationId,
          appointmentType: bookingForm.appointmentType,
          date: bookingForm.date,
          startTime: bookingForm.startTime,
          notes: "Booked from client frontend."
        })
      });

      setMessage("Appointment booked successfully.");
      setSlots([]);
      setBookingForm((current) => ({
        ...current,
        startTime: ""
      }));

      await loadDashboard(bookingForm.date);
    } catch (err) {
      setError(err.message);
    } finally {
      setBookingLoading(false);
    }
  }

  async function cancelAppointment(appointmentId) {
    const confirmed = window.confirm("Cancel this appointment?");

    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      await apiRequest(`/appointments/${appointmentId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "cancelled",
          reason: "Cancelled by client from frontend."
        })
      });

      setMessage("Appointment cancelled successfully.");
      await loadDashboard(bookingForm.date);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleBookingChange(event) {
    setBookingForm({
      ...bookingForm,
      [event.target.name]: event.target.value
    });

    setSlots([]);
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DashboardLayout
    title="Client Dashboard"
    subtitle={`Welcome, ${user?.name || "Client"}`}
  >
      {/* <div className="dashboard-header">
        <div>
          <h1>Client Dashboard</h1>
          <p>Welcome, {user?.name || "Client"}</p>
        </div>

        <button className="btn secondary" onClick={handleLogout}>
          Logout
        </button>
      </div> */}

      {loading ? <div className="card">Loading client dashboard...</div> : null}

      {error ? <div className="card error">{error}</div> : null}

      {message ? <div className="card success">{message}</div> : null}

      <div className="card">
        <h2>Book Appointment</h2>

        <form onSubmit={bookAppointment}>
          <div className="form-grid">
            <div>
              <label>Date</label>
              <input
                className="input"
                type="date"
                name="date"
                value={bookingForm.date}
                onChange={handleBookingChange}
              />
            </div>

            <div>
              <label>Service</label>
              <select
                className="input"
                name="serviceId"
                value={bookingForm.serviceId}
                onChange={handleBookingChange}
              >
                <option value="">Select service</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Location</label>
              <select
                className="input"
                name="locationId"
                value={bookingForm.locationId}
                onChange={handleBookingChange}
              >
                <option value="">Select location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Appointment Type</label>
              <select
                className="input"
                name="appointmentType"
                value={bookingForm.appointmentType}
                onChange={handleBookingChange}
              >
                <option value="telehealth">Telehealth</option>
                <option value="in_person">In Person</option>
              </select>
            </div>
          </div>

          <div className="form-actions">
            <button
              className="btn secondary"
              type="button"
              onClick={checkSlots}
              disabled={slotLoading}
            >
              {slotLoading ? "Checking..." : "Check Slots"}
            </button>

            <select
              className="input slot-select"
              name="startTime"
              value={bookingForm.startTime}
              onChange={handleBookingChange}
            >
              <option value="">Select slot</option>
              {slots.map((slot) => (
                <option key={slot.startTime} value={slot.startTime}>
                  {slot.startTime} - {slot.endTime}
                </option>
              ))}
            </select>

            <button className="btn" type="submit" disabled={bookingLoading}>
              {bookingLoading ? "Booking..." : "Book Appointment"}
            </button>
          </div>
        </form>
      </div>

      {dashboard ? (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Upcoming Appointments</div>
              <div className="stat-value">
                {dashboard.summary.upcomingAppointments}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Past Appointments</div>
              <div className="stat-value">
                {dashboard.summary.pastAppointments}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Active Waitlist</div>
              <div className="stat-value">
                {dashboard.summary.activeWaitlist}
              </div>
            </div>
          </div>

          <div className="card">
            <h2>My Upcoming Appointments</h2>

            {dashboard.upcomingAppointments.length === 0 ? (
              <p>No upcoming appointments.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Therapist</th>
                    <th>Service</th>
                    <th>Location</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {dashboard.upcomingAppointments.map((appointment) => (
                    <tr key={appointment.id}>
                      <td>{appointment.date}</td>
                      <td>
                        {appointment.startTime} - {appointment.endTime}
                      </td>
                      <td>{appointment.therapistName}</td>
                      <td>{appointment.serviceName}</td>
                      <td>{appointment.locationName}</td>
                      <td>
                        <span className={`badge ${appointment.status}`}>
                          {appointment.status}
                        </span>
                      </td>
                      <td>
                        {appointment.status === "confirmed" ? (
                          <button
                            className="btn danger small-btn"
                            onClick={() => cancelAppointment(appointment.id)}
                          >
                            Cancel
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h2>My Waitlist</h2>

            {dashboard.waitlist.length === 0 ? (
              <p>No waitlist entries.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Service</th>
                    <th>Location</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {dashboard.waitlist.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.preferredDate}</td>
                      <td>{entry.serviceName || entry.serviceId}</td>
                      <td>{entry.locationName || entry.locationId}</td>
                      <td>
                        <span className={`badge ${entry.status}`}>
                          {entry.status}
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

export default ClientDashboard;