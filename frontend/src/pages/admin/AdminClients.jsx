import { useEffect, useState } from "react";

import { apiRequest } from "../../api/apiClient";
import DashboardLayout from "../../layouts/DashboardLayout";

function AdminClients() {
  const [clients, setClients] = useState([]);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "Client12345",
  });

  const [editingClient, setEditingClient] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadClients() {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest("/users/role/client");
      setClients(data.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(event) {
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    });
  }

  async function createClient(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!form.name || !form.email || !form.password) {
      setError("Name, email, and password are required.");
      return;
    }

    setSaving(true);

    try {
      await apiRequest("/users", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          role: "client",
        }),
      });

      setMessage("Client created successfully.");

      setForm({
        name: "",
        email: "",
        password: "Client12345",
      });

      await loadClients();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateClientStatus(clientId, status) {
    setError("");
    setMessage("");
    setUpdatingStatus(clientId + status);

    try {
      await apiRequest(`/users/${clientId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
        }),
      });

      setMessage(`Client status changed to ${status}.`);
      await loadClients();
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingStatus("");
    }
  }

  useEffect(() => {
    loadClients();
  }, []);

  function startEditClient(client) {
    setEditingClient(client);
    setEditForm({
      name: client.name || "",
      email: client.email || "",
    });
    setError("");
    setMessage("");
  }

  function cancelEditClient() {
    setEditingClient(null);
    setEditForm({
      name: "",
      email: "",
    });
  }

  async function updateClient(event) {
    event.preventDefault();

    if (!editingClient) {
      return;
    }

    try {
      setEditSaving(true);
      setError("");

      await apiRequest(`/users/${editingClient.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name,
          email: editForm.email,
        }),
      });

      setMessage("Client updated successfully.");
      cancelEditClient();
      await loadClients();
    } catch (error) {
      setError(error.message || "Failed to update client");
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <DashboardLayout title="Clients" subtitle="Add and manage client accounts.">
      {loading ? <div className="card">Loading clients...</div> : null}

      {error ? <div className="card error">{error}</div> : null}

      {message ? <div className="card success">{message}</div> : null}

      <div className="card">
        <h2>Add New Client</h2>

        <form onSubmit={createClient}>
          <div className="form-grid">
            <div>
              <label>Name</label>
              <input
                className="input"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="New Client"
              />
            </div>

            <div>
              <label>Email</label>
              <input
                className="input"
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="client@example.com"
              />
            </div>

            <div>
              <label>Password</label>
              <input
                className="input"
                name="password"
                value={form.password}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-actions">
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create Client"}
            </button>

            <button
              className="btn secondary"
              type="button"
              onClick={loadClients}
            >
              Refresh
            </button>
          </div>
        </form>
      </div>

      {editingClient && (
        <div className="card">
          <h2>Edit Client</h2>

          <form onSubmit={updateClient} className="form-grid">
            <div>
              <label>Name</label>
              <input
                className="input"
                type="text"
                value={editForm.name}
                onChange={(event) =>
                  setEditForm({
                    ...editForm,
                    name: event.target.value,
                  })
                }
                required
              />
            </div>

            <div>
              <label>Email</label>
              <input
                className="input"
                type="email"
                value={editForm.email}
                onChange={(event) =>
                  setEditForm({
                    ...editForm,
                    email: event.target.value,
                  })
                }
                required
              />
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "end" }}>
              <button type="submit" className="btn" disabled={editSaving}>
                {editSaving ? "Updating..." : "Update Client"}
              </button>

              <button
                type="button"
                className="btn secondary"
                onClick={cancelEditClient}
                disabled={editSaving}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h2>Clients</h2>

        {clients.length === 0 ? (
          <p>No clients found.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Email</th>
                <th>Status</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <strong>{client.name}</strong>
                    <br />
                    <small>ID: {client.id}</small>
                  </td>

                  <td>{client.email}</td>

                  <td>
                    <span className={`badge ${client.status}`}>
                      {client.status}
                    </span>
                  </td>

                  <td>
                    {client.createdAt ? client.createdAt.slice(0, 10) : "-"}
                  </td>

                  <td>
                    <div className="row-actions">
                      <button
                        className="btn secondary small-btn"
                        type="button"
                        onClick={() => startEditClient(client)}
                      >
                        Edit
                      </button>

                      {client.status !== "active" ? (
                        <button
                          className="btn small-btn"
                          disabled={updatingStatus === client.id + "active"}
                          onClick={() =>
                            updateClientStatus(client.id, "active")
                          }
                        >
                          Activate
                        </button>
                      ) : null}

                      {client.status !== "blocked" ? (
                        <button
                          className="btn danger small-btn"
                          disabled={updatingStatus === client.id + "blocked"}
                          onClick={() =>
                            updateClientStatus(client.id, "blocked")
                          }
                        >
                          Block
                        </button>
                      ) : null}

                      {client.status !== "archived" ? (
                        <button
                          className="btn secondary small-btn"
                          disabled={updatingStatus === client.id + "archived"}
                          onClick={() =>
                            updateClientStatus(client.id, "archived")
                          }
                        >
                          Archive
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
    </DashboardLayout>
  );
}

export default AdminClients;
