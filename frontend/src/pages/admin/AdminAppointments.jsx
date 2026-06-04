import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../../api/apiClient";
import DashboardLayout from "../../layouts/DashboardLayout";
import { getUser } from "../../utils/auth";

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

function getLocationType(location) {
  if (!location) {
    return "";
  }

  const rawType = location.locationType || location.type || "";
  const normalizedType = String(rawType).toLowerCase();

  if (normalizedType === "virtual") {
    return "virtual";
  }

  if (normalizedType === "office") {
    return "office";
  }

  const name = String(
    location.name || location.locationName || "",
  ).toLowerCase();

  if (
    name.includes("virtual") ||
    name.includes("online") ||
    name.includes("telehealth")
  ) {
    return "virtual";
  }

  return "office";
}

function getAppointmentTypeForLocation(location) {
  const locationType = getLocationType(location);

  if (locationType === "virtual") {
    return "telehealth";
  }

  if (locationType === "office") {
    return "in_person";
  }

  return "";
}

function AdminAppointments() {
  const navigate = useNavigate();
  const user = getUser();
  const isManager = user?.role === "office_manager";

  const [appointments, setAppointments] = useState([]);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [locations, setLocations] = useState([]);
  const [slots, setSlots] = useState([]);

  const [date, setDate] = useState("2026-06-08");
  const [loading, setLoading] = useState(true);
  const [slotLoading, setSlotLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const defaultBookingForm = {
    clientId: "",
    serviceId: "",
    locationId: "",
    appointmentType: "telehealth",
    startTime: "",
  };

  const [bookingForm, setBookingForm] = useState(defaultBookingForm);

  const [rescheduleForm, setRescheduleForm] = useState(null);
const [rescheduleSlots, setRescheduleSlots] = useState([]);
const [rescheduleLoading, setRescheduleLoading] = useState(false);

  async function loadAppointments(selectedDate = date) {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const data = await apiRequest(`/appointments?date=${selectedDate}`);
      setAppointments(data.appointments || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadReferenceData() {
    try {
      const [clientsData, servicesData, locationsData] = await Promise.all([
        apiRequest("/users/role/client"),
        apiRequest("/services"),
        apiRequest("/locations")
      ]);

      const activeServices = (servicesData.services || []).filter(
        (service) => service.status === "active"
      );

      const activeLocations = (locationsData.locations || []).filter(
        (location) => location.status === "active"
      );

      setClients(clientsData.users || []);
      setServices(activeServices);
      setLocations(activeLocations);

      setBookingForm((current) => ({
        ...current,
        clientId: current.clientId || clientsData.users?.[0]?.id || "",
        serviceId: current.serviceId || activeServices?.[0]?.id || "",
        locationId: current.locationId || activeLocations?.[0]?.id || ""
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  function resetBookingFormAfterSuccess() {
    setBookingForm((current) => ({
      ...defaultBookingForm,
      clientId: clients?.[0]?.id || current.clientId || "",
      serviceId: services?.[0]?.id || current.serviceId || "",
      locationId: locations?.[0]?.id || current.locationId || "",
    }));

    setSlots([]);
  }

  async function checkSlots() {
    setError("");
    setMessage("");
    setSlots([]);

    if (!bookingForm.serviceId || !bookingForm.locationId || !date) {
      setError("Please select service, location, and date first.");
      return;
    }

    setSlotLoading(true);

    try {
      const query = new URLSearchParams({
        date,
        serviceId: bookingForm.serviceId,
        locationId: bookingForm.locationId,
        appointmentType: bookingForm.appointmentType
      });

      const data = await apiRequest(`/appointments/slots?${query.toString()}`);
      setSlots(data.slots || []);

      if (!data.slots || data.slots.length === 0) {
        setMessage("No slots available for this selection.");
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

    if (
      !bookingForm.clientId ||
      !bookingForm.serviceId ||
      !bookingForm.locationId ||
      !bookingForm.startTime
    ) {
      setError("Please select client, service, location, and slot.");
      return;
    }

    setBookingLoading(true);

    try {
      await apiRequest("/appointments", {
        method: "POST",
        body: JSON.stringify({
          clientId: bookingForm.clientId,
          serviceId: bookingForm.serviceId,
          locationId: bookingForm.locationId,
          appointmentType: bookingForm.appointmentType,
          date,
          startTime: bookingForm.startTime,
          notes: "Booked from admin frontend."
        })
      });

      setMessage("Appointment booked successfully.");
      resetBookingFormAfterSuccess();

      loadAppointments(date);
    } catch (err) {
      setError(err.message);
    } finally {
      setBookingLoading(false);
    }
  }

  async function cancelAppointment(appointmentId) {
    const confirmed = window.confirm(
      "Are you sure you want to cancel this appointment?"
    );

    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      const data = await apiRequest(`/appointments/${appointmentId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "cancelled",
          reason: "Cancelled from admin frontend."
        })
      });

      if (data.matchingWaitlistCount > 0) {
        setMessage(
          `Appointment cancelled. ${data.matchingWaitlistCount} matching waitlist client found.`
        );
      } else {
        setMessage("Appointment cancelled successfully.");
      }

      loadAppointments(date);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleDateChange(event) {
    const selectedDate = event.target.value;
    setDate(selectedDate);
    setSlots([]);
    setBookingForm((current) => ({
      ...current,
      startTime: ""
    }));
    loadAppointments(selectedDate);
  }

  function handleBookingChange(event) {
    const { name, value } = event.target;

    if (name === "locationId") {
      const selectedLocation = locations.find((location) => {
        return location.id === value;
      });

      const appointmentType = getAppointmentTypeForLocation(selectedLocation);

      setBookingForm({
        ...bookingForm,
        locationId: value,
        appointmentType,
        startTime: "",
      });

      setSlots([]);

      return;
    }

    setBookingForm({
      ...bookingForm,
      [name]: value,
    });

    if (
      name === "serviceId" ||
      name === "appointmentType" ||
      name === "clientId"
    ) {
      setSlots([]);
    }
  }

  function startReschedule(appointment) {
  setMessage("");
  setError("");
  setRescheduleSlots([]);

  setRescheduleForm({
    appointmentId: appointment.id,
    clientName: appointment.clientName,
    currentDate: appointment.date,
    currentStartTime: appointment.startTime,
    serviceId: appointment.serviceId,
    locationId: appointment.locationId,
    appointmentType: appointment.appointmentType,
    date: appointment.date,
    startTime: ""
  });
}

async function checkRescheduleSlots() {
  if (!rescheduleForm) return;

  setError("");
  setMessage("");
  setRescheduleSlots([]);
  setRescheduleLoading(true);

  try {
    const query = new URLSearchParams({
      date: rescheduleForm.date,
      serviceId: rescheduleForm.serviceId,
      locationId: rescheduleForm.locationId,
      appointmentType: rescheduleForm.appointmentType
    });

    const data = await apiRequest(`/appointments/slots?${query.toString()}`);
    setRescheduleSlots(data.slots || []);

    if (!data.slots || data.slots.length === 0) {
      setMessage("No reschedule slots available for this date.");
      return;
    }

    setRescheduleForm((current) => ({
      ...current,
      startTime: data.slots[0].startTime
    }));

    setMessage(`${data.slots.length} reschedule slots found.`);
  } catch (err) {
    setError(err.message);
  } finally {
    setRescheduleLoading(false);
  }
}

async function submitReschedule(event) {
  event.preventDefault();

  if (!rescheduleForm?.startTime) {
    setError("Please select a new slot.");
    return;
  }

  setError("");
  setMessage("");
  setRescheduleLoading(true);

  try {
    const data = await apiRequest(
      `/appointments/${rescheduleForm.appointmentId}/reschedule`,
      {
        method: "PATCH",
        body: JSON.stringify({
          date: rescheduleForm.date,
          startTime: rescheduleForm.startTime,
          allowDifferentTherapist: true,
          notes: "Rescheduled from admin frontend."
        })
      }
    );

    if (data.matchingWaitlistCount > 0) {
      setMessage(
        `Appointment rescheduled successfully. ${data.matchingWaitlistCount} waitlist client matched the old slot.`
      );
    } else {
      setMessage("Appointment rescheduled successfully.");
    }

    setDate(rescheduleForm.date);
    setRescheduleForm(null);
    setRescheduleSlots([]);
    loadAppointments(rescheduleForm.date);
  } catch (err) {
    setError(err.message);
  } finally {
    setRescheduleLoading(false);
  }
}

 useEffect(() => {
  loadReferenceData();
  loadAppointments(date);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  return (
    <DashboardLayout
      title="Appointments"
      subtitle="View, book, and manage appointment bookings."
    >
      {/* <div className="dashboard-header">
        <div>
          <h1>Appointments</h1>
          <p>View, book, and manage appointment bookings.</p>
        </div>

        <div className="header-actions">
          <button className="btn secondary" onClick={() => navigate("/admin")}>
            Back to Dashboard
          </button>

          <button className="btn" onClick={() => loadAppointments(date)}>
            Refresh
          </button>
        </div>
      </div> */}

      <div className="card dashboard-filter">
        <label>Appointment Date</label>
        <input
          className="input"
          type="date"
          value={date}
          onChange={handleDateChange}
        />
      </div>

      {error ? <div className="card error">{error}</div> : null}
      {message ? <div className="card success">{message}</div> : null}

      <div className="card">
        <h2>Book Appointment</h2>

        <form onSubmit={bookAppointment}>
          <div className="form-grid">
            <div>
              <label>Client</label>
              <select
                className="input"
                name="clientId"
                value={bookingForm.clientId}
                onChange={handleBookingChange}
              >
                <option value="">Select client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} ({client.email})
                  </option>
                ))}
              </select>
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
                disabled
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
                  {slot.startTime} - {slot.endTime} (
                  {slot.availableTherapistCount} therapist available)
                </option>
              ))}
            </select>

            <button className="btn" type="submit" disabled={bookingLoading}>
              {bookingLoading ? "Booking..." : "Book Appointment"}
            </button>
          </div>
        </form>
      </div>

      {loading ? <div className="card">Loading appointments...</div> : null}

      {rescheduleForm ? (
        <div className="card">
          <h2>Reschedule Appointment</h2>

          <p>
            Rescheduling appointment for{" "}
            <strong>{rescheduleForm.clientName}</strong>. Current slot:{" "}
            {rescheduleForm.currentDate} at {rescheduleForm.currentStartTime}
          </p>

          <form onSubmit={submitReschedule}>
            <div className="form-grid">
              <div>
                <label>New Date</label>
                <input
                  className="input"
                  type="date"
                  value={rescheduleForm.date}
                  onChange={(event) => {
                    setRescheduleForm({
                      ...rescheduleForm,
                      date: event.target.value,
                      startTime: "",
                    });
                    setRescheduleSlots([]);
                  }}
                />
              </div>

              <div>
                <label>New Slot</label>
                <select
                  className="input"
                  value={rescheduleForm.startTime}
                  onChange={(event) =>
                    setRescheduleForm({
                      ...rescheduleForm,
                      startTime: event.target.value,
                    })
                  }
                >
                  <option value="">Select slot</option>
                  {rescheduleSlots.map((slot) => (
                    <option key={slot.startTime} value={slot.startTime}>
                      {slot.startTime} - {slot.endTime} (
                      {slot.availableTherapistCount} therapist available)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-actions">
              <button
                className="btn secondary"
                type="button"
                onClick={checkRescheduleSlots}
                disabled={rescheduleLoading}
              >
                {rescheduleLoading ? "Checking..." : "Check New Slots"}
              </button>

              <button
                className="btn"
                type="submit"
                disabled={rescheduleLoading}
              >
                {rescheduleLoading ? "Rescheduling..." : "Confirm Reschedule"}
              </button>

              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  setRescheduleForm(null);
                  setRescheduleSlots([]);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="card">
        <h2>Appointments on {date}</h2>

        {appointments.length === 0 ? (
          <p>No appointments found for this date.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Client</th>
                <th>Therapist</th>
                <th>Service</th>
                <th>Location</th>
                <th>Room</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {appointments.map((appointment) => (
                <tr key={appointment.id}>
                  <td>
                    {appointment.startTime} - {appointment.endTime}
                  </td>

                  <td>
                    <strong>{appointment.clientName}</strong>
                    <br />
                    <small>{appointment.clientEmail}</small>
                  </td>

                  <td>{appointment.therapistName}</td>
                  <td>{appointment.serviceName}</td>
                  <td>{appointment.locationName}</td>
                  <td>{getRoomDisplay(appointment)}</td>

                  <td>
                    <span className={`badge ${appointment.status}`}>
                      {appointment.status}
                    </span>
                  </td>

                  <td>
                    {appointment.status === "confirmed" ? (
                      <div className="row-actions">
                        <button
                          className="btn secondary small-btn"
                          onClick={() => startReschedule(appointment)}
                        >
                          Reschedule
                        </button>

                        <button
                          className="btn danger small-btn"
                          onClick={() => cancelAppointment(appointment.id)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DashboardLayout>
  );
}

export default AdminAppointments;