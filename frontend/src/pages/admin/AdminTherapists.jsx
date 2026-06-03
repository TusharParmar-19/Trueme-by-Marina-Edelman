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

function getServiceNames(therapist) {
  return (therapist.services || therapist.therapyServices || [])
    .map((service) => {
      if (typeof service === "string") return service;
      return service.name || service.serviceName || service.serviceId || "";
    })
    .filter(Boolean);
}

function getAvailabilityRows(therapist) {
  return (therapist.availability || []).map((rule) => {
    const dayName =
      rule.dayName ||
      DAYS.find((day) => day.value === Number(rule.dayOfWeek))?.label ||
      `Day ${rule.dayOfWeek}`;

    const locationNames = (rule.locations || [])
      .map((location) => location.name || location.locationName || location.id)
      .filter(Boolean);

    const locationText = locationNames.length
      ? locationNames.join(", ")
      : "No location";

    return {
      id: rule.id || `${dayName}-${rule.startTime}-${rule.endTime}`,
      text: `${dayName} - ${locationText} - ${rule.startTime} to ${rule.endTime}`,
    };
  });
}

function getLocationNames(locationIds, locations) {
  return (locationIds || [])
    .map((locationId) => {
      const location = locations.find((item) => item.id === locationId);
      return location ? location.name : locationId;
    })
    .filter(Boolean);
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

function getAppointmentTypesFromLocations(locationIds, locations) {
  const types = [];

  (locationIds || []).forEach((locationId) => {
    const location = locations.find((item) => item.id === locationId);
    const locationType = getLocationType(location);

    if (locationType === "virtual" && !types.includes("telehealth")) {
      types.push("telehealth");
    }

    if (locationType === "office" && !types.includes("in_person")) {
      types.push("in_person");
    }
  });

  return types;
}

function AdminTherapists() {
  const [therapists, setTherapists] = useState([]);
  const [services, setServices] = useState([]);
  const [locations, setLocations] = useState([]);
  const [therapistServiceAssignments, setTherapistServiceAssignments] =
    useState([]);

  const [loading, setLoading] = useState(true);
  const [savingTherapist, setSavingTherapist] = useState(false);
  const [savingSetup, setSavingSetup] = useState(false);
  const [updatingAssignmentStatus, setUpdatingAssignmentStatus] = useState("");

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
    serviceIds: [],
    locationIds: [],
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
      const [therapistsData, servicesData, locationsData, assignmentsData] =
        await Promise.all([
          apiRequest("/therapists"),
          apiRequest("/services"),
          apiRequest("/locations"),
          apiRequest("/therapist-services"),
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

      setTherapistServiceAssignments(assignmentsData.assignments || []);

      setSetupForm((current) => ({
        ...current,
        therapistId:
          current.therapistId || therapistsData.therapists?.[0]?.id || "",
        serviceIds: current.serviceIds || [],
        locationIds: current.locationIds || [],
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

  function toggleSetupService(serviceId) {
    setSetupForm((current) => {
      const alreadySelected = current.serviceIds.includes(serviceId);

      return {
        ...current,
        serviceIds: alreadySelected
          ? current.serviceIds.filter((id) => id !== serviceId)
          : [...current.serviceIds, serviceId],
      };
    });
  }

  function toggleSetupLocation(locationId) {
    setSetupForm((current) => {
      const alreadySelected = current.locationIds.includes(locationId);

      return {
        ...current,
        locationIds: alreadySelected
          ? current.locationIds.filter((id) => id !== locationId)
          : [...current.locationIds, locationId],
      };
    });
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

    const appointmentTypes = getAppointmentTypesFromLocations(
      setupForm.locationIds,
      locations,
    );

    if (!setupForm.therapistId) {
      setError("Please select a therapist.");
      return;
    }

    if (!setupForm.serviceIds || setupForm.serviceIds.length === 0) {
      setError("Please select at least one service.");
      return;
    }

    if (!setupForm.locationIds || setupForm.locationIds.length === 0) {
      setError("Please select at least one location.");
      return;
    }

    if (appointmentTypes.length === 0) {
      setError(
        "Appointment type could not be detected from selected locations.",
      );
      return;
    }

    setSavingSetup(true);

    try {
      await Promise.all(
        setupForm.serviceIds.map((serviceId) =>
          apiRequest("/therapist-services", {
            method: "POST",
            body: JSON.stringify({
              therapistId: setupForm.therapistId,
              serviceId,
              locationIds: setupForm.locationIds,
              appointmentTypes,
              notes: "Assigned from frontend therapist management.",
            }),
          }),
        ),
      );

      setMessage(
        `Therapist assigned to ${setupForm.serviceIds.length} service(s) successfully.`,
      );

      setSetupForm((current) => ({
        ...current,
        serviceIds: [],
        locationIds: [],
      }));

      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSetup(false);
    }
  }

  async function updateAssignmentStatus(assignmentId, status) {
    setUpdatingAssignmentStatus(assignmentId + status);
    setError("");
    setMessage("");

    try {
      await apiRequest(`/therapist-services/${assignmentId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
        }),
      });

      setMessage(`Therapist service assignment changed to ${status}.`);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingAssignmentStatus("");
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
        <h2>Assign Services to Therapist</h2>
        <p>
          Select one therapist, choose multiple services, locations, and
          appointment types. Weekly availability is managed separately from the
          Availability page.
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

          <div className="form-grid form-grid-two">
            <div>
              <label>Services</label>
              <div className="day-checkbox-grid">
                {services.map((service) => (
                  <label key={service.id} className="day-checkbox">
                    <input
                      type="checkbox"
                      checked={setupForm.serviceIds.includes(service.id)}
                      onChange={() => toggleSetupService(service.id)}
                    />
                    {service.name}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label>Locations</label>
              <div className="day-checkbox-grid">
                {locations.map((location) => (
                  <label key={location.id} className="day-checkbox">
                    <input
                      type="checkbox"
                      checked={setupForm.locationIds.includes(location.id)}
                      onChange={() => toggleSetupLocation(location.id)}
                    />
                    {location.name}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button className="btn" type="submit" disabled={savingSetup}>
              {savingSetup ? "Saving..." : "Save Therapist Services"}
            </button>

            <a className="btn secondary" href="/admin/availability">
              Manage Availability
            </a>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Therapist Service Assignments</h2>

        {therapistServiceAssignments.length === 0 ? (
          <p>No therapist service assignments found.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Therapist</th>
                <th>Service</th>
                <th>Locations</th>
                <th>Types</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {therapistServiceAssignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td>
                    <strong>{assignment.therapistName || "-"}</strong>
                    <br />
                    <small>{assignment.therapistEmail || ""}</small>
                  </td>

                  <td>{assignment.serviceName || assignment.serviceId}</td>

                  <td>
                    {getLocationNames(assignment.locationIds, locations).length
                      ? getLocationNames(
                          assignment.locationIds,
                          locations,
                        ).join(", ")
                      : "-"}
                  </td>

                  <td>
                    {(assignment.appointmentTypes || []).join(", ") || "-"}
                  </td>

                  <td>
                    <span className={`badge ${assignment.status}`}>
                      {assignment.status}
                    </span>
                  </td>

                  <td>
                    <div className="row-actions">
                      {assignment.status !== "active" ? (
                        <button
                          className="btn small-btn"
                          type="button"
                          disabled={
                            updatingAssignmentStatus ===
                            assignment.id + "active"
                          }
                          onClick={() =>
                            updateAssignmentStatus(assignment.id, "active")
                          }
                        >
                          Activate
                        </button>
                      ) : null}

                      {assignment.status !== "inactive" ? (
                        <button
                          className="btn secondary small-btn"
                          type="button"
                          disabled={
                            updatingAssignmentStatus ===
                            assignment.id + "inactive"
                          }
                          onClick={() =>
                            updateAssignmentStatus(assignment.id, "inactive")
                          }
                        >
                          Deactivate
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
                <th>Therapy Services</th>
                <th>Appointment Types</th>
                <th>Availability</th>
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
                    {getServiceNames(therapist).length
                      ? getServiceNames(therapist).join(", ")
                      : "No services assigned"}
                  </td>

                  <td>
                    {(therapist.appointmentTypes || []).join(", ") || "-"}
                  </td>

                  <td>
                    {getAvailabilityRows(therapist).length
                      ? getAvailabilityRows(therapist).map((row) => (
                          <div key={row.id}>{row.text}</div>
                        ))
                      : "No availability assigned"}
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
