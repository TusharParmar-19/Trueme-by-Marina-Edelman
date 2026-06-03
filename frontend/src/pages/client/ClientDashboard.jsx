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
    "Room will be assigned"
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

function ClientDashboard() {
  const navigate = useNavigate();
  const user = getUser();

  const [dashboard, setDashboard] = useState(null);
  const [services, setServices] = useState([]);
  const [locations, setLocations] = useState([]);
  const [therapists, setTherapists] = useState([]);
  const [suggestedSlots, setSuggestedSlots] = useState([]);
  const [slots, setSlots] = useState([]);
  const [rescheduleForm, setRescheduleForm] = useState(null);
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [bookingStep, setBookingStep] = useState("closed");
  // closed | choose_location | booking_form

  const [selectedBookingPlace, setSelectedBookingPlace] = useState(null);

  const [waitlistForm, setWaitlistForm] = useState({
    preferredStartTime: "09:00",
    preferredEndTime: "12:00",
  });

  const [bookingForm, setBookingForm] = useState({
    date: "2026-06-08",
    serviceId: "",
    locationId: "",
    appointmentType: "telehealth",
    therapistId: "",
    startTime: "",
  });

  const [loading, setLoading] = useState(true);
  const [slotLoading, setSlotLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function addDays(dateString, days) {
    const date = new Date(dateString + "T00:00:00");
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function buildSlotQuery(form, dateValue = form.date) {
    const query = new URLSearchParams({
      date: dateValue,
      serviceId: form.serviceId,
      locationId: form.locationId,
      appointmentType: form.appointmentType,
    });

    if (form.therapistId) {
      query.set("therapistId", form.therapistId);
    }

    return query;
  }

  function isVirtualLocation(location) {
    if (!location) {
      return false;
    }

    const rawType = location.locationType || location.type || "";
    const normalizedType = String(rawType).toLowerCase();

    if (normalizedType === "virtual") {
      return true;
    }

    if (normalizedType === "office") {
      return false;
    }

    const name = String(
      location.name || location.locationName || "",
    ).toLowerCase();

    return (
      name.includes("virtual") ||
      name.includes("online") ||
      name.includes("telehealth")
    );
  }

  function getAppointmentTypeForLocation(location) {
    if (isVirtualLocation(location)) {
      return "telehealth";
    }

    return "in_person";
  }

  function getVirtualLocation() {
    return locations.find(function (location) {
      return isVirtualLocation(location);
    });
  }

  function getOfficeLocations() {
    return locations.filter(function (location) {
      return !isVirtualLocation(location);
    });
  }

  function openBookingFlow() {
    setError("");
    setMessage("");
    setSlots([]);
    setSuggestedSlots([]);
    setSelectedBookingPlace(null);
    setBookingStep("choose_location");
  }

  async function selectOnlineSession() {
    const virtualLocation = getVirtualLocation();

    if (!virtualLocation) {
      setError(
        "Virtual Session location is not available. Please ask admin to make Virtual Session public and active.",
      );
      return;
    }

    const nextForm = {
      ...bookingForm,
      locationId: virtualLocation.id,
      appointmentType: "telehealth",
      therapistId: "",
      startTime: "",
    };

    setBookingForm(nextForm);
    setSelectedBookingPlace({
      label: "Online Session",
      locationName: virtualLocation.name,
      appointmentType: "telehealth",
    });

    setSlots([]);
    setSuggestedSlots([]);
    setBookingStep("booking_form");

    await loadTherapistsForSelection(nextForm);
  }

  async function selectOfficeLocation(location) {
    const nextForm = {
      ...bookingForm,
      locationId: location.id,
      appointmentType: "in_person",
      therapistId: "",
      startTime: "",
    };

    setBookingForm(nextForm);
    setSelectedBookingPlace({
      label: location.name,
      locationName: location.name,
      appointmentType: "in_person",
    });

    setSlots([]);
    setSuggestedSlots([]);
    setBookingStep("booking_form");

    await loadTherapistsForSelection(nextForm);
  }

  function closeBookingFlow() {
    setBookingStep("closed");
    setSelectedBookingPlace(null);
    setSlots([]);
    setSuggestedSlots([]);
    setMessage("");
  }

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
        apiRequest("/locations/public"),
      ]);

      const publicServices = servicesData.services || [];
      const publicLocations = locationsData.locations || [];

      setServices(publicServices);
      setLocations(publicLocations);

      const nextForm = {
        ...bookingForm,
        serviceId: bookingForm.serviceId || publicServices?.[0]?.id || "",
        locationId: bookingForm.locationId || publicLocations?.[0]?.id || "",
      };

      setBookingForm(nextForm);

      await loadTherapistsForSelection(nextForm);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadTherapistsForSelection(formData = bookingForm) {
    if (
      !formData.serviceId ||
      !formData.locationId ||
      !formData.appointmentType
    ) {
      setTherapists([]);
      return;
    }

    try {
      const query = new URLSearchParams({
        serviceId: formData.serviceId,
        locationId: formData.locationId,
        appointmentType: formData.appointmentType,
      });

      const data = await apiRequest(`/therapists/public?${query.toString()}`);
      setTherapists(data.therapists || []);
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
    setSuggestedSlots([]);

    if (
      !bookingForm.serviceId ||
      !bookingForm.locationId ||
      !bookingForm.date
    ) {
      setError("Please select service, location, and date.");
      return;
    }

    const selectedLocation = locations.find((location) => {
      return location.id === bookingForm.locationId;
    });

    const expectedAppointmentType =
      getAppointmentTypeForLocation(selectedLocation);

    if (
      expectedAppointmentType &&
      bookingForm.appointmentType !== expectedAppointmentType
    ) {
      setError("Appointment type does not match the selected location.");
      return;
    }

    setSlotLoading(true);

    try {
      const query = buildSlotQuery(bookingForm);
      const data = await apiRequest(`/appointments/slots?${query.toString()}`);

      setSlots(data.slots || []);

      if (data.slots && data.slots.length > 0) {
        setBookingForm((current) => ({
          ...current,
          startTime: data.slots[0].startTime,
        }));

        setMessage(`${data.slots.length} available slots found.`);
        return;
      }

      const nextAvailable = [];

      for (let index = 1; index <= 14; index += 1) {
        const nextDate = addDays(bookingForm.date, index);
        const nextQuery = buildSlotQuery(bookingForm, nextDate);
        const nextData = await apiRequest(
          `/appointments/slots?${nextQuery.toString()}`,
        );

        if (nextData.slots && nextData.slots.length > 0) {
          nextData.slots.slice(0, 3).forEach((slot) => {
            nextAvailable.push(slot);
          });
        }

        if (nextAvailable.length >= 6) {
          break;
        }
      }

      setSuggestedSlots(nextAvailable);

      if (nextAvailable.length > 0) {
        setMessage(
          "No slots available on selected date. Here are the next available options.",
        );
      } else {
        setMessage(
          "No slots available in the next 14 days. You can join the waitlist.",
        );
      }
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

    if (!bookingForm.locationId) {
      setError("Please choose Online Session or an office location first.");
      return;
    }

    if (!bookingForm.serviceId) {
      setError("Please select a therapy/service.");
      return;
    }

    const selectedLocation = locations.find((location) => {
      return location.id === bookingForm.locationId;
    });

    const expectedAppointmentType =
      getAppointmentTypeForLocation(selectedLocation);

    if (
      expectedAppointmentType &&
      bookingForm.appointmentType !== expectedAppointmentType
    ) {
      setError("Appointment type does not match the selected location.");
      return;
    }

    if (!bookingForm.startTime) {
      setError(
        "Please click Find Available Slots and select a slot before booking.",
      );
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
          therapistId: bookingForm.therapistId || undefined,
          date: bookingForm.date,
          startTime: bookingForm.startTime,
          notes: bookingForm.therapistId
            ? "Booked with selected therapist from client frontend."
            : "Booked with any available therapist from client frontend.",
        }),
      });

      setMessage("Appointment booked successfully.");
      setSlots([]);
      setBookingForm((current) => ({
        ...current,
        startTime: "",
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
          reason: "Cancelled by client from frontend.",
        }),
      });

      setMessage("Appointment cancelled successfully.");
      await loadDashboard(bookingForm.date);
    } catch (err) {
      setError(err.message);
    }
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
        slot: "",
        selectedSlot: "",
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
      name === "therapistId" ||
      name === "therapistPreference" ||
      name === "appointmentType"
    ) {
      setSlots([]);
    }
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  function startReschedule(appointment) {
    setError("");
    setMessage("");
    setRescheduleSlots([]);

    setRescheduleForm({
      appointmentId: appointment.id,
      currentDate: appointment.date,
      currentStartTime: appointment.startTime,
      serviceId: appointment.serviceId,
      locationId: appointment.locationId,
      appointmentType: appointment.appointmentType,
      date: appointment.date,
      startTime: "",
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
        appointmentType: rescheduleForm.appointmentType,
      });

      const data = await apiRequest(`/appointments/slots?${query.toString()}`);

      setRescheduleSlots(data.slots || []);

      if (!data.slots || data.slots.length === 0) {
        setMessage("No slots available for this new date.");
        return;
      }

      setRescheduleForm((current) => ({
        ...current,
        startTime: data.slots[0].startTime,
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
      await apiRequest(
        `/appointments/${rescheduleForm.appointmentId}/reschedule`,
        {
          method: "PATCH",
          body: JSON.stringify({
            date: rescheduleForm.date,
            startTime: rescheduleForm.startTime,
            allowDifferentTherapist: true,
            notes: "Rescheduled by client from frontend.",
          }),
        },
      );

      setMessage("Appointment rescheduled successfully.");
      setRescheduleForm(null);
      setRescheduleSlots([]);

      await loadDashboard(rescheduleForm.date);
    } catch (err) {
      setError(err.message);
    } finally {
      setRescheduleLoading(false);
    }
  }

  async function joinWaitlist() {
    setError("");
    setMessage("");
    setWaitlistLoading(true);

    if (
      !bookingForm.serviceId ||
      !bookingForm.locationId ||
      !bookingForm.date
    ) {
      setError("Please select date, service, and location first.");
      setWaitlistLoading(false);
      return;
    }

    try {
      await apiRequest("/waitlist", {
        method: "POST",
        body: JSON.stringify({
          serviceId: bookingForm.serviceId,
          locationId: bookingForm.locationId,
          appointmentType: bookingForm.appointmentType,
          preferredDate: bookingForm.date,
          preferredStartTime: waitlistForm.preferredStartTime,
          preferredEndTime: waitlistForm.preferredEndTime,
          notes: "Client joined waitlist from frontend.",
        }),
      });

      setMessage("You have been added to the waitlist.");
      await loadDashboard(bookingForm.date);
    } catch (err) {
      setError(err.message);
    } finally {
      setWaitlistLoading(false);
    }
  }

  async function cancelWaitlistEntry(waitlistId) {
    const confirmed = window.confirm("Cancel this waitlist entry?");

    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      await apiRequest(`/waitlist/${waitlistId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "cancelled",
          notes: "Cancelled by client from frontend.",
        }),
      });

      setMessage("Waitlist entry cancelled successfully.");
      await loadDashboard(bookingForm.date);
    } catch (err) {
      setError(err.message);
    }
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
        <div className="section-header">
          <div>
            <h2>Book Appointment</h2>
            <p>Choose how you want to attend, then select therapy and time.</p>
          </div>

          {bookingStep === "closed" ? (
            <button className="btn" type="button" onClick={openBookingFlow}>
              Book Appointment
            </button>
          ) : (
            <button
              className="btn secondary"
              type="button"
              onClick={closeBookingFlow}
            >
              Close
            </button>
          )}
        </div>

        {bookingStep === "choose_location" ? (
          <div className="booking-choice-area">
            <h3>How would you like to attend?</h3>

            <div className="booking-choice-grid">
              {getVirtualLocation() ? (
                <button
                  className="booking-choice-card"
                  type="button"
                  onClick={selectOnlineSession}
                >
                  <strong>Online Session</strong>
                  <span>Attend by telehealth / virtual session</span>
                </button>
              ) : null}

              {getOfficeLocations().map((location) => (
                <button
                  className="booking-choice-card"
                  type="button"
                  key={location.id}
                  onClick={() => selectOfficeLocation(location)}
                >
                  <strong>{location.name}</strong>
                  <span>Book an in-person appointment</span>
                </button>
              ))}
            </div>

            {!getVirtualLocation() && getOfficeLocations().length === 0 ? (
              <p>No public booking locations are available right now.</p>
            ) : null}
          </div>
        ) : null}

        {bookingStep === "booking_form" ? (
          <form onSubmit={bookAppointment}>
            <div className="selected-booking-place">
              <strong>{selectedBookingPlace?.label}</strong>
              <span>
                {selectedBookingPlace?.appointmentType === "telehealth"
                  ? "Online appointment"
                  : "In-person appointment"}
              </span>
            </div>

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
                <label>Therapy / Service</label>
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
                <label>Therapist Preference</label>
                <select
                  className="input"
                  name="therapistId"
                  value={bookingForm.therapistId}
                  onChange={handleBookingChange}
                >
                  <option value="">Any available therapist</option>
                  {therapists.map((therapist) => (
                    <option key={therapist.id} value={therapist.id}>
                      {therapist.name}{" "}
                      {therapist.title ? `- ${therapist.title}` : ""}
                    </option>
                  ))}
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
                {slotLoading ? "Finding..." : "Find Available Slots"}
              </button>

              <select
                className="input slot-select"
                name="startTime"
                value={bookingForm.startTime}
                onChange={handleBookingChange}
              >
                <option value="">Select slot</option>
                {slots.map((slot) => (
                  <option
                    key={`${slot.date}-${slot.startTime}`}
                    value={slot.startTime}
                  >
                    {slot.date} | {slot.startTime} - {slot.endTime}
                  </option>
                ))}

                {!bookingForm.startTime ? (
                  <small className="helper-text">
                    Click Find Available Slots first, then select a slot.
                  </small>
                ) : null}
              </select>

              <button
                className="btn"
                type="submit"
                disabled={bookingLoading || !bookingForm.startTime}
              >
                {bookingLoading ? "Booking..." : "Book Appointment"}
              </button>
            </div>

            {suggestedSlots.length > 0 ? (
              <div className="suggested-slots">
                <h3>Next Available Slots</h3>

                <div className="suggested-slot-grid">
                  {suggestedSlots.map((slot) => (
                    <button
                      className="slot-card"
                      type="button"
                      key={`${slot.date}-${slot.startTime}`}
                      onClick={() => {
                        setBookingForm({
                          ...bookingForm,
                          date: slot.date,
                          startTime: slot.startTime,
                        });

                        setSlots([slot]);
                        setSuggestedSlots([]);

                        setMessage(
                          `Selected ${slot.date} at ${slot.startTime}. Click Book Appointment to confirm.`,
                        );
                      }}
                    >
                      <strong>{slot.date}</strong>
                      <span>
                        {slot.startTime} - {slot.endTime}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="waitlist-box">
              <h3>Join Waitlist</h3>
              <p>
                If no slot is available, you can join the waitlist for this
                selected date, service, and session type.
              </p>

              <div className="form-grid">
                <div>
                  <label>Preferred Start Time</label>
                  <input
                    className="input"
                    type="time"
                    value={waitlistForm.preferredStartTime}
                    onChange={(event) =>
                      setWaitlistForm({
                        ...waitlistForm,
                        preferredStartTime: event.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <label>Preferred End Time</label>
                  <input
                    className="input"
                    type="time"
                    value={waitlistForm.preferredEndTime}
                    onChange={(event) =>
                      setWaitlistForm({
                        ...waitlistForm,
                        preferredEndTime: event.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <button
                className="btn secondary"
                type="button"
                onClick={joinWaitlist}
                disabled={waitlistLoading}
              >
                {waitlistLoading ? "Joining..." : "Join Waitlist"}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {rescheduleForm ? (
        <div className="card">
          <h2>Reschedule Appointment</h2>

          <p>
            Current appointment: {rescheduleForm.currentDate} at{" "}
            {rescheduleForm.currentStartTime}
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
                      {slot.startTime} - {slot.endTime}
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
                Close
              </button>
            </div>
          </form>
        </div>
      ) : null}

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
                    <th>Room</th>
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
                    <th>Actions</th>
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
                      <td>
                        {entry.status === "active" ||
                        entry.status === "notified" ? (
                          <button
                            className="btn danger small-btn"
                            onClick={() => cancelWaitlistEntry(entry.id)}
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
        </>
      ) : null}
    </DashboardLayout>
  );
}

export default ClientDashboard;
