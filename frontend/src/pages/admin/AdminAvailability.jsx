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

function getDayLabel(dayOfWeek) {
  const day = DAYS.find((item) => Number(item.value) === Number(dayOfWeek));
  return day ? day.label : dayOfWeek;
}

function getLocationType(location) {
  if (!location) {
    return "";
  }

  const rawType =
    location.locationType || location.type || location.category || "";

  const normalizedType = String(rawType).toLowerCase();

  if (normalizedType === "virtual") {
    return "virtual";
  }

  if (normalizedType === "office") {
    return "office";
  }

  const name = String(location.name || "").toLowerCase();

  if (
    name.includes("virtual") ||
    name.includes("online") ||
    name.includes("telehealth")
  ) {
    return "virtual";
  }

  return "office";
}

function getAppointmentTypeStateForLocation(location) {
  const locationType = getLocationType(location);

  if (locationType === "virtual") {
    return {
      telehealth: true,
      inPerson: false,
    };
  }

  if (locationType === "office") {
    return {
      telehealth: false,
      inPerson: true,
    };
  }

  return null;
}

function AdminAvailability() {
  const [availability, setAvailability] = useState([]);
  const [therapists, setTherapists] = useState([]);
  const [locations, setLocations] = useState([]);

  const [selectedTherapistId, setSelectedTherapistId] = useState("all");
  const [editingRule, setEditingRule] = useState(null);

  const [form, setForm] = useState({
    dayOfWeek: 1,
    locationId: "",
    startTime: "09:00",
    endTime: "17:00",
    telehealth: false,
    inPerson: true,
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function getTherapistName(therapist) {
    return (
      therapist.name ||
      therapist.userName ||
      therapist.therapistName ||
      therapist.email ||
      therapist.id
    );
  }

  function getLocationName(location) {
    return location.name || location.locationName || location.id;
  }

  function getAppointmentTypesFromForm() {
    const types = [];

    if (form.telehealth) {
      types.push("telehealth");
    }

    if (form.inPerson) {
      types.push("in_person");
    }

    return types;
  }

  async function loadReferenceData() {
    const [therapistsData, locationsData] = await Promise.all([
      apiRequest("/therapists"),
      apiRequest("/locations"),
    ]);

    setTherapists(therapistsData.therapists || []);
    setLocations(locationsData.locations || []);
  }

  async function loadAvailability(therapistId = selectedTherapistId) {
    const path =
      therapistId && therapistId !== "all"
        ? `/availability/weekly?therapistId=${therapistId}`
        : "/availability/weekly";

    const data = await apiRequest(path);
    setAvailability(data.availability || []);
  }

  async function loadPage() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      await loadReferenceData();
      await loadAvailability("all");
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleTherapistFilterChange(event) {
    const therapistId = event.target.value;

    setSelectedTherapistId(therapistId);
    setLoading(true);
    setError("");
    setMessage("");

    try {
      await loadAvailability(therapistId);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleFormChange(event) {
    const { name, value, type, checked } = event.target;

    if (name === "locationId") {
      const selectedLocation = locations.find((location) => {
        return location.id === value;
      });

      const appointmentTypeState =
        getAppointmentTypeStateForLocation(selectedLocation);

      setForm({
        ...form,
        locationId: value,
        ...(appointmentTypeState || {}),
      });

      return;
    }

    setForm({
      ...form,
      [name]: type === "checkbox" ? checked : value,
    });
  }

  function startEdit(rule) {
    const locationId =
      rule.locationId || rule.locationIds?.[0] || rule.locations?.[0]?.id || "";

    setEditingRule(rule);

    setForm({
      dayOfWeek: Number(rule.dayOfWeek),
      locationId,
      startTime: rule.startTime || "09:00",
      endTime: rule.endTime || "17:00",
      telehealth: (rule.appointmentTypes || []).includes("telehealth"),
      inPerson: (rule.appointmentTypes || []).includes("in_person"),
      notes: rule.notes || "",
    });

    setError("");
    setMessage("");
  }

  function cancelEdit() {
    setEditingRule(null);

    setForm({
      dayOfWeek: 1,
      locationId: "",
      startTime: "09:00",
      endTime: "17:00",
      telehealth: false,
      inPerson: true,
      notes: "",
    });
  }

  async function updateAvailability(event) {
    event.preventDefault();

    if (!editingRule) {
      return;
    }

    const appointmentTypes = getAppointmentTypesFromForm();

    if (!form.locationId) {
      setError("Please select a location.");
      return;
    }

    const selectedLocation = locations.find((location) => {
      return location.id === form.locationId;
    });

    const selectedLocationType = getLocationType(selectedLocation);

    if (
      selectedLocationType === "virtual" &&
      appointmentTypes.includes("in_person")
    ) {
      setError("Virtual Session can only use Telehealth.");
      return;
    }

    if (
      selectedLocationType === "office" &&
      appointmentTypes.includes("telehealth")
    ) {
      setError("Office locations can only use In person.");
      return;
    }

    if (appointmentTypes.length === 0) {
      setError("Please select at least one appointment type.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await apiRequest(`/availability/weekly/${editingRule.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          dayOfWeek: Number(form.dayOfWeek),
          locationId: form.locationId,
          locationIds: [form.locationId],
          startTime: form.startTime,
          endTime: form.endTime,
          appointmentTypes,
          notes: form.notes,
        }),
      });

      setMessage("Availability updated successfully.");
      cancelEdit();
      await loadAvailability(selectedTherapistId);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function updateAvailabilityStatus(ruleId, status) {
    setUpdatingStatus(ruleId + status);
    setError("");
    setMessage("");

    try {
      await apiRequest(`/availability/weekly/${ruleId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
        }),
      });

      setMessage(`Availability status changed to ${status}.`);
      await loadAvailability(selectedTherapistId);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setUpdatingStatus("");
    }
  }

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DashboardLayout
      title="Availability"
      subtitle="View and update therapist weekly availability."
    >
      {error ? <div className="card error">{error}</div> : null}
      {message ? <div className="card success">{message}</div> : null}

      <div className="card">
        <h2>Filter</h2>

        <div className="form-grid">
          <div>
            <label>Therapist</label>
            <select
              className="input"
              value={selectedTherapistId}
              onChange={handleTherapistFilterChange}
            >
              <option value="all">All therapists</option>

              {therapists.map((therapist) => (
                <option key={therapist.id} value={therapist.id}>
                  {getTherapistName(therapist)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-actions">
            <button className="btn secondary" type="button" onClick={loadPage}>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {editingRule ? (
        <div className="card">
          <h2>Edit Availability</h2>

          <p>
            Editing availability for{" "}
            <strong>{editingRule.therapistName || "Therapist"}</strong>
          </p>

          <form onSubmit={updateAvailability}>
            <div className="form-grid">
              <div>
                <label>Day</label>
                <select
                  className="input"
                  name="dayOfWeek"
                  value={form.dayOfWeek}
                  onChange={handleFormChange}
                >
                  {DAYS.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Location</label>
                <select
                  className="input"
                  name="locationId"
                  value={form.locationId}
                  onChange={handleFormChange}
                >
                  <option value="">Select location</option>

                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {getLocationName(location)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Start Time</label>
                <input
                  className="input"
                  type="time"
                  name="startTime"
                  value={form.startTime}
                  onChange={handleFormChange}
                />
              </div>

              <div>
                <label>End Time</label>
                <input
                  className="input"
                  type="time"
                  name="endTime"
                  value={form.endTime}
                  onChange={handleFormChange}
                />
              </div>
            </div>

            <div className="checkbox-row">
              <label>
                <input
                  type="checkbox"
                  name="telehealth"
                  checked={form.telehealth}
                  onChange={handleFormChange}
                  disabled={
                    getLocationType(
                      locations.find(
                        (location) => location.id === form.locationId,
                      ),
                    ) === "office"
                  }
                />
                Telehealth
              </label>

              <label>
                <input
                  type="checkbox"
                  name="inPerson"
                  checked={form.inPerson}
                  onChange={handleFormChange}
                  disabled={
                    getLocationType(
                      locations.find(
                        (location) => location.id === form.locationId,
                      ),
                    ) === "virtual"
                  }
                />
                In person
              </label>
            </div>

            <div style={{ marginTop: 14 }}>
              <label>Notes</label>
              <input
                className="input"
                name="notes"
                value={form.notes}
                onChange={handleFormChange}
                placeholder="Optional notes"
              />
            </div>

            <div className="form-actions">
              <button className="btn" type="submit" disabled={saving}>
                {saving ? "Saving..." : "Update Availability"}
              </button>

              <button
                className="btn secondary"
                type="button"
                onClick={cancelEdit}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="card">
        <h2>Weekly Availability</h2>

        {loading ? <p>Loading availability...</p> : null}

        {!loading && availability.length === 0 ? (
          <p>No availability records found.</p>
        ) : null}

        {!loading && availability.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Therapist</th>
                <th>Day</th>
                <th>Location</th>
                <th>Time</th>
                <th>Types</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {availability.map((rule) => {
                const locationName =
                  rule.locations?.map((location) => location.name).join(", ") ||
                  rule.locationName ||
                  rule.locationId ||
                  "-";

                return (
                  <tr key={rule.id}>
                    <td>
                      <strong>{rule.therapistName || "-"}</strong>
                      <br />
                      <small>{rule.therapistEmail || ""}</small>
                    </td>

                    <td>{getDayLabel(rule.dayOfWeek)}</td>

                    <td>{locationName}</td>

                    <td>
                      {rule.startTime} - {rule.endTime}
                    </td>

                    <td>{(rule.appointmentTypes || []).join(", ") || "-"}</td>

                    <td>
                      <span className={`badge ${rule.status}`}>
                        {rule.status}
                      </span>
                    </td>

                    <td>
                      <div className="row-actions">
                        <button
                          className="btn secondary small-btn"
                          type="button"
                          onClick={() => startEdit(rule)}
                        >
                          Edit
                        </button>

                        {rule.status !== "active" ? (
                          <button
                            className="btn small-btn"
                            type="button"
                            disabled={updatingStatus === rule.id + "active"}
                            onClick={() =>
                              updateAvailabilityStatus(rule.id, "active")
                            }
                          >
                            Activate
                          </button>
                        ) : null}

                        {rule.status !== "inactive" ? (
                          <button
                            className="btn secondary small-btn"
                            type="button"
                            disabled={updatingStatus === rule.id + "inactive"}
                            onClick={() =>
                              updateAvailabilityStatus(rule.id, "inactive")
                            }
                          >
                            Deactivate
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>
    </DashboardLayout>
  );
}

export default AdminAvailability;
