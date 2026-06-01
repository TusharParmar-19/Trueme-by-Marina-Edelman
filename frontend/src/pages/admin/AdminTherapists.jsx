import { useEffect, useState } from "react";

import { apiRequest } from "../../api/apiClient";
import DashboardLayout from "../../layouts/DashboardLayout";

const DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

function splitComma(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getTherapistName(therapist) {
  return (
    therapist.name ||
    therapist.userName ||
    therapist.therapistName ||
    therapist.email ||
    therapist.id
  );
}

function AdminTherapists() {
  const [therapists, setTherapists] = useState([]);
  const [services, setServices] = useState([]);
  const [locations, setLocations] = useState([]);

  const [loading, setLoading] = useState(true);
  const [savingTherapist, setSavingTherapist] = useState(false);
  const [savingSetup, setSavingSetup] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [therapistForm, setTherapistForm] = useState({
    name: "",
    email: "",
    password: "Therapist12345",
    title: "Licensed Therapist",
    bio: "",
    focusAreas: "Anxiety, Depression",
    treatmentApproaches: "CBT",
    clientFocus: "Adult",
    assessmentTypes: "",
    telehealth: true,
    inPerson: true,
    insuranceAccepted: false,
    isPublicBookingEnabled: true,
  });

  const [setupForm, setSetupForm] = useState({
    therapistId: "",
    serviceId: "",
    locationId: "",
    availableDays: [1, 2, 3, 4, 5],
    startTime: "09:00",
    endTime: "17:00",
    telehealth: true,
    inPerson: true,
  });

  function getSelectedAppointmentTypes(source) {
    const types = [];

    if (source.telehealth) {
      types.push("telehealth");
    }

    if (source.inPerson) {
      types.push("in_person");
    }

    return types;
  }

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [therapistsData, servicesData, locationsData] = await Promise.all([
        apiRequest("/therapists"),
        apiRequest("/services"),
        apiRequest("/locations"),
      ]);

      const activeServices = (servicesData.services || []).filter(
        (service) => service.status === "active",
      );

      const activeLocations = (locationsData.locations || []).filter(
        (location) => location.status === "active",
      );

      setTherapists(therapistsData.therapists || []);
      setServices(activeServices);
      setLocations(activeLocations);

      setSetupForm((current) => ({
        ...current,
        therapistId:
          current.therapistId || therapistsData.therapists?.[0]?.id || "",
        serviceId: current.serviceId || activeServices?.[0]?.id || "",
        locationId: current.locationId || activeLocations?.[0]?.id || "",
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleTherapistFormChange(event) {
    const { name, value, type, checked } = event.target;

    setTherapistForm({
      ...therapistForm,
      [name]: type === "checkbox" ? checked : value,
    });
  }

  function handleSetupFormChange(event) {
    const { name, value, type, checked } = event.target;

    setSetupForm({
      ...setupForm,
      [name]: type === "checkbox" ? checked : value,
    });
  }

  function toggleAvailableDay(dayValue) {
    const dayNumber = Number(dayValue);

    setSetupForm((current) => {
      const alreadySelected = current.availableDays.includes(dayNumber);

      return {
        ...current,
        availableDays: alreadySelected
          ? current.availableDays.filter((day) => day !== dayNumber)
          : [...current.availableDays, dayNumber].sort(),
      };
    });
  }

  function selectWeekdays() {
    setSetupForm((current) => ({
      ...current,
      availableDays: [1, 2, 3, 4, 5],
    }));
  }

  function selectAllDays() {
    setSetupForm((current) => ({
      ...current,
      availableDays: [0, 1, 2, 3, 4, 5, 6],
    }));
  }

  function clearDays() {
    setSetupForm((current) => ({
      ...current,
      availableDays: [],
    }));
  }

  async function createTherapist(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    const appointmentTypes = getSelectedAppointmentTypes(therapistForm);

    if (
      !therapistForm.name ||
      !therapistForm.email ||
      !therapistForm.password
    ) {
      setError("Name, email, and password are required.");
      return;
    }

    if (appointmentTypes.length === 0) {
      setError("Select at least one appointment type.");
      return;
    }

    setSavingTherapist(true);

    try {
      const userResponse = await apiRequest("/users", {
        method: "POST",
        body: JSON.stringify({
          name: therapistForm.name,
          email: therapistForm.email,
          password: therapistForm.password,
          role: "therapist",
        }),
      });

      const createdUser =
        userResponse.user ||
        userResponse.createdUser ||
        userResponse.data?.user;

      if (!createdUser?.id) {
        throw new Error(
          "Therapist user created, but user id was not returned.",
        );
      }

      const therapistResponse = await apiRequest("/therapists", {
        method: "POST",
        body: JSON.stringify({
          userId: createdUser.id,
          title: therapistForm.title,
          bio: therapistForm.bio,
          appointmentTypes,
          focusAreas: splitComma(therapistForm.focusAreas),
          treatmentApproaches: splitComma(therapistForm.treatmentApproaches),
          clientFocus: splitComma(therapistForm.clientFocus),
          assessmentTypes: splitComma(therapistForm.assessmentTypes),
          insuranceAccepted: therapistForm.insuranceAccepted,
          isPublicBookingEnabled: therapistForm.isPublicBookingEnabled,
        }),
      });

      const createdTherapist =
        therapistResponse.therapist ||
        therapistResponse.profile ||
        therapistResponse.data?.therapist;

      setMessage("Therapist account and profile created successfully.");

      setTherapistForm({
        name: "",
        email: "",
        password: "Therapist12345",
        title: "Licensed Therapist",
        bio: "",
        focusAreas: "Anxiety, Depression",
        treatmentApproaches: "CBT",
        clientFocus: "Adult",
        assessmentTypes: "",
        telehealth: true,
        inPerson: true,
        insuranceAccepted: false,
        isPublicBookingEnabled: true,
      });

      await loadData();

      if (createdTherapist?.id) {
        setSetupForm((current) => ({
          ...current,
          therapistId: createdTherapist.id,
        }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingTherapist(false);
    }
  }

  async function makeTherapistBookable(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    const appointmentTypes = getSelectedAppointmentTypes(setupForm);

    if (
      !setupForm.therapistId ||
      !setupForm.serviceId ||
      !setupForm.locationId
    ) {
      setError("Therapist, service, and location are required.");
      return;
    }

    if (!setupForm.availableDays || setupForm.availableDays.length === 0) {
      setError("Please select at least one available day.");
      return;
    }

    if (appointmentTypes.length === 0) {
      setError("Select at least one appointment type.");
      return;
    }

    setSavingSetup(true);

    try {
      await apiRequest("/therapist-services", {
        method: "POST",
        body: JSON.stringify({
          therapistId: setupForm.therapistId,
          serviceId: setupForm.serviceId,
          locationIds: [setupForm.locationId],
          appointmentTypes,
          notes: "Assigned from frontend therapist management.",
        }),
      });

      await Promise.all(
        setupForm.availableDays.map((dayOfWeek) =>
          apiRequest("/availability/weekly", {
            method: "POST",
            body: JSON.stringify({
              therapistId: setupForm.therapistId,
              dayOfWeek,
              startTime: setupForm.startTime,
              endTime: setupForm.endTime,
              locationId: setupForm.locationId,
              appointmentTypes,
              status: "active",
            }),
          }),
        ),
      );

      setMessage(
        `Therapist service assignment and availability created for ${setupForm.availableDays.length} day(s).`,
      );

      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSetup(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DashboardLayout
      title="Therapists"
      subtitle="Add therapists and configure their bookable services."
    >
      {loading ? <div className="card">Loading therapists...</div> : null}

      {error ? <div className="card error">{error}</div> : null}

      {message ? <div className="card success">{message}</div> : null}

      <div className="card">
        <h2>Add New Therapist</h2>

        <form onSubmit={createTherapist}>
          <div className="form-grid">
            <div>
              <label>Name</label>
              <input
                className="input"
                name="name"
                value={therapistForm.name}
                onChange={handleTherapistFormChange}
                placeholder="Dr. Emily Therapist"
              />
            </div>

            <div>
              <label>Email</label>
              <input
                className="input"
                type="email"
                name="email"
                value={therapistForm.email}
                onChange={handleTherapistFormChange}
                placeholder="emily@trueme.com"
              />
            </div>

            <div>
              <label>Password</label>
              <input
                className="input"
                name="password"
                value={therapistForm.password}
                onChange={handleTherapistFormChange}
              />
            </div>

            <div>
              <label>Title</label>
              <input
                className="input"
                name="title"
                value={therapistForm.title}
                onChange={handleTherapistFormChange}
              />
            </div>
          </div>

          <div className="form-grid form-grid-two">
            <div>
              <label>Bio</label>
              <textarea
                className="input"
                name="bio"
                value={therapistForm.bio}
                onChange={handleTherapistFormChange}
                rows="4"
                placeholder="Short therapist bio"
              />
            </div>

            <div>
              <label>Focus Areas</label>
              <input
                className="input"
                name="focusAreas"
                value={therapistForm.focusAreas}
                onChange={handleTherapistFormChange}
                placeholder="Anxiety, Depression, Trauma"
              />

              <label style={{ marginTop: 12 }}>Treatment Approaches</label>
              <input
                className="input"
                name="treatmentApproaches"
                value={therapistForm.treatmentApproaches}
                onChange={handleTherapistFormChange}
                placeholder="CBT, EFT, Gottman"
              />
            </div>
          </div>

          <div className="form-grid">
            <div>
              <label>Client Focus</label>
              <input
                className="input"
                name="clientFocus"
                value={therapistForm.clientFocus}
                onChange={handleTherapistFormChange}
                placeholder="Adult, Couple"
              />
            </div>

            <div>
              <label>Assessment Types</label>
              <input
                className="input"
                name="assessmentTypes"
                value={therapistForm.assessmentTypes}
                onChange={handleTherapistFormChange}
                placeholder="Anxiety Assessment, Depression Assessment"
              />
            </div>

            <div className="checkbox-field">
              <label>
                <input
                  type="checkbox"
                  name="telehealth"
                  checked={therapistForm.telehealth}
                  onChange={handleTherapistFormChange}
                />
                Telehealth
              </label>
            </div>

            <div className="checkbox-field">
              <label>
                <input
                  type="checkbox"
                  name="inPerson"
                  checked={therapistForm.inPerson}
                  onChange={handleTherapistFormChange}
                />
                In person
              </label>
            </div>
          </div>

          <div className="form-actions">
            <button className="btn" type="submit" disabled={savingTherapist}>
              {savingTherapist ? "Creating..." : "Create Therapist"}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Make Therapist Bookable</h2>
        <p>
          After creating a therapist, assign service, location, and weekly
          availability so the therapist can appear in available slots.
        </p>

        <form onSubmit={makeTherapistBookable}>
          <div className="form-grid">
            <div>
              <label>Therapist</label>
              <select
                className="input"
                name="therapistId"
                value={setupForm.therapistId}
                onChange={handleSetupFormChange}
              >
                <option value="">Select therapist</option>
                {therapists.map((therapist) => (
                  <option key={therapist.id} value={therapist.id}>
                    {getTherapistName(therapist)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Service</label>
              <select
                className="input"
                name="serviceId"
                value={setupForm.serviceId}
                onChange={handleSetupFormChange}
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
                value={setupForm.locationId}
                onChange={handleSetupFormChange}
              >
                <option value="">Select location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="available-days-box">
              <label>Available Days</label>

              <div className="quick-day-actions">
                <button
                  className="btn secondary small-btn"
                  type="button"
                  onClick={selectWeekdays}
                >
                  Weekdays
                </button>

                <button
                  className="btn secondary small-btn"
                  type="button"
                  onClick={selectAllDays}
                >
                  Whole Week
                </button>

                <button
                  className="btn secondary small-btn"
                  type="button"
                  onClick={clearDays}
                >
                  Clear
                </button>
              </div>

              <div className="day-checkbox-grid">
                {DAYS.map((day) => (
                  <label key={day.value} className="day-checkbox">
                    <input
                      type="checkbox"
                      checked={setupForm.availableDays.includes(day.value)}
                      onChange={() => toggleAvailableDay(day.value)}
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="form-grid">
            <div>
              <label>Start Time</label>
              <input
                className="input"
                type="time"
                name="startTime"
                value={setupForm.startTime}
                onChange={handleSetupFormChange}
              />
            </div>

            <div>
              <label>End Time</label>
              <input
                className="input"
                type="time"
                name="endTime"
                value={setupForm.endTime}
                onChange={handleSetupFormChange}
              />
            </div>

            <div className="checkbox-field">
              <label>
                <input
                  type="checkbox"
                  name="telehealth"
                  checked={setupForm.telehealth}
                  onChange={handleSetupFormChange}
                />
                Telehealth
              </label>
            </div>

            <div className="checkbox-field">
              <label>
                <input
                  type="checkbox"
                  name="inPerson"
                  checked={setupForm.inPerson}
                  onChange={handleSetupFormChange}
                />
                In person
              </label>
            </div>
          </div>

          <div className="form-actions">
            <button className="btn" type="submit" disabled={savingSetup}>
              {savingSetup ? "Saving..." : "Save Service + Availability"}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Therapists</h2>

        {therapists.length === 0 ? (
          <p>No therapists found.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Therapist</th>
                <th>Title</th>
                <th>Appointment Types</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {therapists.map((therapist) => (
                <tr key={therapist.id}>
                  <td>
                    <strong>{getTherapistName(therapist)}</strong>
                    <br />
                    <small>
                      {therapist.email || therapist.userEmail || ""}
                    </small>
                  </td>

                  <td>{therapist.title || "-"}</td>

                  <td>
                    {(therapist.appointmentTypes || []).join(", ") || "-"}
                  </td>

                  <td>
                    <span
                      className={`badge ${
                        therapist.profileStatus || therapist.status || "active"
                      }`}
                    >
                      {therapist.profileStatus || therapist.status || "active"}
                    </span>
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

export default AdminTherapists;
