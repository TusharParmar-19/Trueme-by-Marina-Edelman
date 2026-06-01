import { useEffect, useState } from "react";

import { apiRequest } from "../../api/apiClient";
import DashboardLayout from "../../layouts/DashboardLayout";

function AdminServices() {
  const [services, setServices] = useState([]);

  const [form, setForm] = useState({
    name: "",
    description: "",
    durationMinutes: 60,
    price: 150,
    currency: "USD",
    category: "therapy",
    telehealth: true,
    inPerson: true,
    isPublicBookingEnabled: true,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function getSelectedAppointmentTypes() {
    const types = [];

    if (form.telehealth) {
      types.push("telehealth");
    }

    if (form.inPerson) {
      types.push("in_person");
    }

    return types;
  }

  async function loadServices() {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest("/services");
      setServices(data.services || []);
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

  async function createService(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    const appointmentTypes = getSelectedAppointmentTypes();

    if (!form.name) {
      setError("Service name is required.");
      return;
    }

    if (appointmentTypes.length === 0) {
      setError("Select at least one appointment type.");
      return;
    }

    setSaving(true);

    try {
      await apiRequest("/services", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          durationMinutes: Number(form.durationMinutes),
          price: Number(form.price),
          currency: form.currency,
          category: form.category,
          appointmentTypes,
          isPublicBookingEnabled: form.isPublicBookingEnabled,
        }),
      });

      setMessage("Service created successfully.");

      setForm({
        name: "",
        description: "",
        durationMinutes: 60,
        price: 150,
        currency: "USD",
        category: "therapy",
        telehealth: true,
        inPerson: true,
        isPublicBookingEnabled: true,
      });

      await loadServices();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateServiceStatus(serviceId, status) {
    setError("");
    setMessage("");
    setUpdatingStatus(serviceId + status);

    try {
      await apiRequest(`/services/${serviceId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
        }),
      });

      setMessage(`Service status changed to ${status}.`);
      await loadServices();
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingStatus("");
    }
  }

  async function updateServicePublicStatus(serviceId, isPublicBookingEnabled) {
    setError("");
    setMessage("");
    setUpdatingStatus(serviceId + "public");

    try {
      await apiRequest(`/services/${serviceId}/public`, {
        method: "PATCH",
        body: JSON.stringify({
          isPublicBookingEnabled,
        }),
      });

      setMessage(
        isPublicBookingEnabled
          ? "Service is now visible to clients."
          : "Service is now hidden from clients.",
      );

      await loadServices();
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingStatus("");
    }
  }

  async function deleteService(serviceId) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this service? If it is already used in appointments, delete will not be allowed.",
    );

    if (!confirmed) return;

    setError("");
    setMessage("");
    setUpdatingStatus(serviceId + "delete");

    try {
      await apiRequest(`/services/${serviceId}`, {
        method: "DELETE",
      });

      setMessage("Service deleted successfully.");
      await loadServices();
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingStatus("");
    }
  }

  useEffect(() => {
    loadServices();
  }, []);

  return (
    <DashboardLayout
      title="Services"
      subtitle="Add and manage therapy services/treatments."
    >
      {loading ? <div className="card">Loading services...</div> : null}

      {error ? <div className="card error">{error}</div> : null}

      {message ? <div className="card success">{message}</div> : null}

      <div className="card">
        <h2>Add New Service</h2>

        <form onSubmit={createService}>
          <div className="form-grid">
            <div>
              <label>Service Name</label>
              <input
                className="input"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Individual Therapy 50 Minutes"
              />
            </div>

            <div>
              <label>Duration Minutes</label>
              <input
                className="input"
                type="number"
                name="durationMinutes"
                value={form.durationMinutes}
                onChange={handleChange}
              />
            </div>

            <div>
              <label>Price</label>
              <input
                className="input"
                type="number"
                name="price"
                value={form.price}
                onChange={handleChange}
              />
            </div>

            <div>
              <label>Currency</label>
              <select
                className="input"
                name="currency"
                value={form.currency}
                onChange={handleChange}
              >
                <option value="USD">USD</option>
                <option value="CAD">CAD</option>
                <option value="INR">INR</option>
              </select>
            </div>
          </div>

          <div className="form-grid form-grid-two">
            <div>
              <label>Description</label>
              <textarea
                className="input"
                name="description"
                value={form.description}
                onChange={handleChange}
                rows="4"
                placeholder="Short service description"
              />
            </div>

            <div>
              <label>Category</label>
              <input
                className="input"
                name="category"
                value={form.category}
                onChange={handleChange}
                placeholder="therapy"
              />

              <div className="checkbox-row">
                <label>
                  <input
                    type="checkbox"
                    name="telehealth"
                    checked={form.telehealth}
                    onChange={handleChange}
                  />
                  Telehealth
                </label>

                <label>
                  <input
                    type="checkbox"
                    name="inPerson"
                    checked={form.inPerson}
                    onChange={handleChange}
                  />
                  In person
                </label>

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
            </div>
          </div>

          <div className="form-actions">
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create Service"}
            </button>

            <button
              className="btn secondary"
              type="button"
              onClick={loadServices}
            >
              Refresh
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Services</h2>

        {services.length === 0 ? (
          <p>No services found.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Duration</th>
                <th>Price</th>
                <th>Types</th>
                <th>Public</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {services.map((service) => (
                <tr key={service.id}>
                  <td>
                    <strong>{service.name}</strong>
                    <br />
                    <small>{service.description || "No description"}</small>
                  </td>

                  <td>{service.durationMinutes} min</td>

                  <td>
                    {service.currency} {service.price}
                  </td>

                  <td>{(service.appointmentTypes || []).join(", ") || "-"}</td>

                  <td>
                    {service.isPublicBookingEnabled ? (
                      <span className="badge active">public</span>
                    ) : (
                      <span className="badge inactive">hidden</span>
                    )}
                  </td>

                  <td>
                    <span className={`badge ${service.status}`}>
                      {service.status}
                    </span>
                  </td>

                  <td>
                    <div className="row-actions">
                      {service.isPublicBookingEnabled ? (
                        <button
                          className="btn secondary small-btn"
                          disabled={updatingStatus === service.id + "public"}
                          onClick={() =>
                            updateServicePublicStatus(service.id, false)
                          }
                        >
                          Hide
                        </button>
                      ) : (
                        <button
                          className="btn small-btn"
                          disabled={updatingStatus === service.id + "public"}
                          onClick={() =>
                            updateServicePublicStatus(service.id, true)
                          }
                        >
                          Make Public
                        </button>
                      )}

                      {service.status !== "active" ? (
                        <button
                          className="btn small-btn"
                          disabled={updatingStatus === service.id + "active"}
                          onClick={() =>
                            updateServiceStatus(service.id, "active")
                          }
                        >
                          Activate
                        </button>
                      ) : null}

                      {service.status !== "inactive" ? (
                        <button
                          className="btn secondary small-btn"
                          disabled={updatingStatus === service.id + "inactive"}
                          onClick={() =>
                            updateServiceStatus(service.id, "inactive")
                          }
                        >
                          Deactivate
                        </button>
                      ) : null}

                      {service.status !== "archived" ? (
                        <button
                          className="btn danger small-btn"
                          disabled={updatingStatus === service.id + "archived"}
                          onClick={() =>
                            updateServiceStatus(service.id, "archived")
                          }
                        >
                          Archive
                        </button>
                      ) : null}

                      <button
                        className="btn danger small-btn"
                        disabled={updatingStatus === service.id + "delete"}
                        onClick={() => deleteService(service.id)}
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

export default AdminServices;
