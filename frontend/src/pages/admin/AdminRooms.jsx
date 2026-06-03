import { useEffect, useState } from "react";

import { apiRequest } from "../../api/apiClient";
import DashboardLayout from "../../layouts/DashboardLayout";

function AdminRooms() {
  const [rooms, setRooms] = useState([]);
  const [locations, setLocations] = useState([]);

  const [selectedLocationId, setSelectedLocationId] = useState("all");

  const [form, setForm] = useState({
    locationId: "",
    name: "",
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState("");
  const [deletingRoomId, setDeletingRoomId] = useState("");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function getLocationName(locationId) {
    const location = locations.find((item) => item.id === locationId);
    return location ? location.name : locationId || "-";
  }

  function getOfficeLocations() {
    return locations.filter((location) => {
      const type = String(
        location.locationType || location.type || "",
      ).toLowerCase();

      return type === "office";
    });
  }

  async function loadLocations() {
    const data = await apiRequest("/locations");
    setLocations(data.locations || []);
  }

  async function loadRooms(locationId = selectedLocationId) {
    const path =
      locationId && locationId !== "all"
        ? `/rooms?locationId=${locationId}`
        : "/rooms";

    const data = await apiRequest(path);
    setRooms(data.rooms || []);
  }

  async function loadPage() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      await loadLocations();
      await loadRooms("all");
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleFormChange(event) {
    const { name, value } = event.target;

    setForm({
      ...form,
      [name]: value,
    });
  }

  async function handleLocationFilterChange(event) {
    const locationId = event.target.value;

    setSelectedLocationId(locationId);
    setLoading(true);
    setError("");
    setMessage("");

    try {
      await loadRooms(locationId);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function createRoom(event) {
    event.preventDefault();

    if (!form.locationId) {
      setError("Please select a location.");
      return;
    }

    if (!form.name.trim()) {
      setError("Please enter room name.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await apiRequest("/rooms", {
        method: "POST",
        body: JSON.stringify({
          locationId: form.locationId,
          name: form.name.trim(),
          notes: form.notes.trim(),
          status: "active",
        }),
      });

      setMessage("Room created successfully.");

      setForm({
        locationId: "",
        name: "",
        notes: "",
      });

      await loadRooms(selectedLocationId);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function updateRoomStatus(roomId, status) {
    setUpdatingStatus(roomId + status);
    setError("");
    setMessage("");

    try {
      await apiRequest(`/rooms/${roomId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
        }),
      });

      setMessage(`Room status changed to ${status}.`);
      await loadRooms(selectedLocationId);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setUpdatingStatus("");
    }
  }

  async function deleteRoom(roomId) {
    const confirmed = window.confirm(
      "Are you sure you want to delete/archive this room?",
    );

    if (!confirmed) {
      return;
    }

    setDeletingRoomId(roomId);
    setError("");
    setMessage("");

    try {
      await apiRequest(`/rooms/${roomId}`, {
        method: "DELETE",
      });

      setMessage("Room deleted/archived successfully.");
      await loadRooms(selectedLocationId);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setDeletingRoomId("");
    }
  }

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const officeLocations = getOfficeLocations();

  return (
    <DashboardLayout
      title="Rooms"
      subtitle="Add and manage rooms used for in-person appointments."
    >
      {error ? <div className="card error">{error}</div> : null}
      {message ? <div className="card success">{message}</div> : null}

      <div className="card">
        <h2>Add New Room</h2>

        <form onSubmit={createRoom}>
          <div className="form-grid">
            <div>
              <label>Location</label>
              <select
                className="input"
                name="locationId"
                value={form.locationId}
                onChange={handleFormChange}
              >
                <option value="">Select office location</option>

                {officeLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Room Name</label>
              <input
                className="input"
                name="name"
                value={form.name}
                onChange={handleFormChange}
                placeholder="Room 1"
              />
            </div>

            <div>
              <label>Notes</label>
              <input
                className="input"
                name="notes"
                value={form.notes}
                onChange={handleFormChange}
                placeholder="Main therapy room"
              />
            </div>
          </div>

          <div className="form-actions">
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create Room"}
            </button>

            <button className="btn secondary" type="button" onClick={loadPage}>
              Refresh
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Filter</h2>

        <div className="form-grid">
          <div>
            <label>Location</label>
            <select
              className="input"
              value={selectedLocationId}
              onChange={handleLocationFilterChange}
            >
              <option value="all">All locations</option>

              {officeLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Rooms</h2>

        {loading ? <p>Loading rooms...</p> : null}

        {!loading && rooms.length === 0 ? <p>No rooms found.</p> : null}

        {!loading && rooms.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Room</th>
                <th>Location</th>
                <th>Notes</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {rooms.map((room) => (
                <tr key={room.id}>
                  <td>
                    <strong>{room.name}</strong>
                    <br />
                    <small>{room.id}</small>
                  </td>

                  <td>
                    {room.locationName || getLocationName(room.locationId)}
                  </td>

                  <td>{room.notes || "-"}</td>

                  <td>
                    <span className={`badge ${room.status}`}>
                      {room.status}
                    </span>
                  </td>

                  <td>
                    <div className="row-actions">
                      {room.status !== "active" ? (
                        <button
                          className="btn small-btn"
                          type="button"
                          disabled={updatingStatus === room.id + "active"}
                          onClick={() => updateRoomStatus(room.id, "active")}
                        >
                          Activate
                        </button>
                      ) : null}

                      {room.status !== "inactive" ? (
                        <button
                          className="btn secondary small-btn"
                          type="button"
                          disabled={updatingStatus === room.id + "inactive"}
                          onClick={() => updateRoomStatus(room.id, "inactive")}
                        >
                          Deactivate
                        </button>
                      ) : null}

                      <button
                        className="btn danger small-btn"
                        type="button"
                        disabled={deletingRoomId === room.id}
                        onClick={() => deleteRoom(room.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </DashboardLayout>
  );
}

export default AdminRooms;
