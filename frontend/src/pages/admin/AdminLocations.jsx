import { useEffect, useState } from "react";

import { apiRequest } from "../../api/apiClient";
import DashboardLayout from "../../layouts/DashboardLayout";

function AdminLocations() {
  const [locations, setLocations] = useState([]);

  const [form, setForm] = useState({
    name: "",
    locationType: "office",
    address: "",
    city: "",
    state: "",
    country: "US",
    timezone: "America/Los_Angeles",
    isPublicBookingEnabled: true,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadLocations() {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest("/locations");
      setLocations(data.locations || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(event) {
    const { name, value, type, checked } = event.target;

    setForm({
      ...form,
      [name]: type === "checkbox" ? checked : value,
    });
  }

  async function createLocation(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!form.name) {
      setError("Location name is required.");
      return;
    }

    setSaving(true);

    try {
      await apiRequest("/locations", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          locationType: form.locationType,
          address: form.address,
          city: form.city,
          state: form.state,
          country: form.country,
          timezone: form.timezone,
          isPublicBookingEnabled: form.isPublicBookingEnabled,
        }),
      });

      setMessage("Location created successfully.");

      setForm({
        name: "",
        locationType: "office",
        address: "",
        city: "",
        state: "",
        country: "US",
        timezone: "America/Los_Angeles",
        isPublicBookingEnabled: true,
      });

      await loadLocations();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateLocationStatus(locationId, status) {
    setError("");
    setMessage("");
    setUpdatingStatus(locationId + status);

    try {
      await apiRequest(`/locations/${locationId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
        }),
      });

      setMessage(`Location status changed to ${status}.`);
      await loadLocations();
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingStatus("");
    }
  }

  async function updateLocationPublicStatus(
    locationId,
    isPublicBookingEnabled,
  ) {
    setError("");
    setMessage("");
    setUpdatingStatus(locationId + "public");

    try {
      await apiRequest(`/locations/${locationId}/public`, {
        method: "PATCH",
        body: JSON.stringify({
          isPublicBookingEnabled,
        }),
      });

      setMessage(
        isPublicBookingEnabled
          ? "Location is now visible to clients."
          : "Location is now hidden from clients.",
      );

      await loadLocations();
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingStatus("");
    }
  }

  async function deleteLocation(locationId) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this location? If it is already used in appointments or therapist availability, delete will not be allowed.",
    );

    if (!confirmed) return;

    setError("");
    setMessage("");
    setUpdatingStatus(locationId + "delete");

    try {
      await apiRequest(`/locations/${locationId}`, {
        method: "DELETE",
      });

      setMessage("Location deleted successfully.");
      await loadLocations();
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingStatus("");
    }
  }

  useEffect(() => {
    loadLocations();
  }, []);

  return (
    <DashboardLayout
      title="Locations"
      subtitle="Add and manage online and office appointment locations."
    >
      {loading ? <div className="card">Loading locations...</div> : null}

      {error ? <div className="card error">{error}</div> : null}

      {message ? <div className="card success">{message}</div> : null}

      <div className="card">
        <h2>Add New Location</h2>

        <form onSubmit={createLocation}>
          <div className="form-grid">
            <div>
              <label>Location Name</label>
              <input
                className="input"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Westlake Village Office"
              />
            </div>

            <div>
              <label>Location Type</label>
              <select
                className="input"
                name="locationType"
                value={form.locationType}
                onChange={handleChange}
              >
                <option value="office">Office</option>
                <option value="virtual">Virtual / Online</option>
                <option value="client_location">Client Location</option>
              </select>
            </div>

            <div>
              <label>Address</label>
              <input
                className="input"
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="123 Main Street"
              />
            </div>

            <div>
              <label>City</label>
              <input
                className="input"
                name="city"
                value={form.city}
                onChange={handleChange}
                placeholder="Westlake Village"
              />
            </div>

            <div>
              <label>State</label>
              <input
                className="input"
                name="state"
                value={form.state}
                onChange={handleChange}
                placeholder="CA"
              />
            </div>

            <div>
              <label>Country</label>
              <input
                className="input"
                name="country"
                value={form.country}
                onChange={handleChange}
              />
            </div>

            <div>
              <label>Timezone</label>
              <input
                className="input"
                name="timezone"
                value={form.timezone}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="checkbox-row">
            <label>
              <input
                type="checkbox"
                name="isPublicBookingEnabled"
                checked={form.isPublicBookingEnabled}
                onChange={handleChange}
              />
              Show to clients
            </label>
          </div>

          <div className="form-actions">
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create Location"}
            </button>

            <button
              className="btn secondary"
              type="button"
              onClick={loadLocations}
            >
              Refresh
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Locations</h2>

        {locations.length === 0 ? (
          <p>No locations found.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Type</th>
                <th>Address</th>
                <th>Timezone</th>
                <th>Public</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
              <td>{location.locationType || "-"}</td>
            </thead>

            <tbody>
              {locations.map((location) => (
                <tr key={location.id}>
                  <td>
                    <strong>{location.name}</strong>
                    <br />
                    <small>ID: {location.id}</small>
                  </td>

                  <td>
                    {location.address || "-"}
                    {location.city ? `, ${location.city}` : ""}
                    {location.state ? `, ${location.state}` : ""}
                  </td>

                  <td>{location.timezone || "-"}</td>

                  <td>
                    {location.isPublicBookingEnabled ? (
                      <span className="badge active">public</span>
                    ) : (
                      <span className="badge inactive">hidden</span>
                    )}
                  </td>

                  <td>
                    <span className={`badge ${location.status}`}>
                      {location.status}
                    </span>
                  </td>

                  <td>
                    <div className="row-actions">
                      {location.isPublicBookingEnabled ? (
                        <button
                          className="btn secondary small-btn"
                          disabled={updatingStatus === location.id + "public"}
                          onClick={() =>
                            updateLocationPublicStatus(location.id, false)
                          }
                        >
                          Hide
                        </button>
                      ) : (
                        <button
                          className="btn small-btn"
                          disabled={updatingStatus === location.id + "public"}
                          onClick={() =>
                            updateLocationPublicStatus(location.id, true)
                          }
                        >
                          Make Public
                        </button>
                      )}

                      {location.status !== "active" ? (
                        <button
                          className="btn small-btn"
                          disabled={updatingStatus === location.id + "active"}
                          onClick={() =>
                            updateLocationStatus(location.id, "active")
                          }
                        >
                          Activate
                        </button>
                      ) : null}

                      {location.status !== "inactive" ? (
                        <button
                          className="btn secondary small-btn"
                          disabled={updatingStatus === location.id + "inactive"}
                          onClick={() =>
                            updateLocationStatus(location.id, "inactive")
                          }
                        >
                          Deactivate
                        </button>
                      ) : null}

                      {location.status !== "archived" ? (
                        <button
                          className="btn danger small-btn"
                          disabled={updatingStatus === location.id + "archived"}
                          onClick={() =>
                            updateLocationStatus(location.id, "archived")
                          }
                        >
                          Archive
                        </button>
                      ) : null}

                      <button
                        className="btn danger small-btn"
                        disabled={updatingStatus === location.id + "delete"}
                        onClick={() => deleteLocation(location.id)}
                      >
                        Delete
                      </button>
                    </div>
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

export default AdminLocations;
