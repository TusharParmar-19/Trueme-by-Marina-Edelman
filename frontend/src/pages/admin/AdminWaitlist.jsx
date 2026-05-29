import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../../api/apiClient";
import DashboardLayout from "../../layouts/DashboardLayout";

function AdminWaitlist() {
  const navigate = useNavigate();

  const [waitlist, setWaitlist] = useState([]);
  const [status, setStatus] = useState("active");
  const [date, setDate] = useState("2026-06-08");
  const [useDateFilter, setUseDateFilter] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadWaitlist(selectedStatus = status, selectedDate = date) {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const params = new URLSearchParams();

      if (selectedStatus !== "all") {
        params.set("status", selectedStatus);
      }

      if (useDateFilter && selectedDate) {
        params.set("date", selectedDate);
      }

      const query = params.toString();
      const path = query ? `/waitlist?${query}` : "/waitlist";

      const data = await apiRequest(path);
      setWaitlist(data.waitlist || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateWaitlistStatus(waitlistId, newStatus) {
    setError("");
    setMessage("");

    try {
      await apiRequest(`/waitlist/${waitlistId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: newStatus,
          notes: `Status changed to ${newStatus} from admin frontend.`
        })
      });

      setMessage(`Waitlist entry marked as ${newStatus}.`);
      loadWaitlist(status, date);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleStatusChange(event) {
    const selectedStatus = event.target.value;
    setStatus(selectedStatus);
    loadWaitlist(selectedStatus, date);
  }

  function handleDateChange(event) {
    const selectedDate = event.target.value;
    setDate(selectedDate);
    loadWaitlist(status, selectedDate);
  }

  function handleUseDateFilterChange(event) {
    setUseDateFilter(event.target.checked);
  }

  useEffect(() => {
    loadWaitlist(status, date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useDateFilter]);

  return (
    <DashboardLayout
    title="Waitlist"
    subtitle="View and manage clients waiting for appointment slots."
  >
      {/* <div className="dashboard-header">
        <div>
          <h1>Waitlist</h1>
          <p>View and manage clients waiting for appointment slots.</p>
        </div>

        <div className="header-actions">
          <button className="btn secondary" onClick={() => navigate("/admin")}>
            Back to Dashboard
          </button>

          <button className="btn" onClick={() => loadWaitlist(status, date)}>
            Refresh
          </button>
        </div>
      </div> */}

      <div className="card">
        <h2>Filters</h2>

        <div className="form-grid">
          <div>
            <label>Status</label>
            <select
              className="input"
              value={status}
              onChange={handleStatusChange}
            >
              <option value="active">Active</option>
              <option value="notified">Notified</option>
              <option value="booked">Booked</option>
              <option value="cancelled">Cancelled</option>
              <option value="all">All</option>
            </select>
          </div>

          <div>
            <label>Date</label>
            <input
              className="input"
              type="date"
              value={date}
              onChange={handleDateChange}
              disabled={!useDateFilter}
            />
          </div>

          <div className="checkbox-field">
            <label>
              <input
                type="checkbox"
                checked={useDateFilter}
                onChange={handleUseDateFilterChange}
              />{" "}
              Filter by date
            </label>
          </div>
        </div>
      </div>

      {loading ? <div className="card">Loading waitlist...</div> : null}

      {error ? <div className="card error">{error}</div> : null}

      {message ? <div className="card success">{message}</div> : null}

      <div className="card">
        <h2>Waitlist Entries</h2>

        {waitlist.length === 0 ? (
          <p>No waitlist entries found.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Service</th>
                <th>Location</th>
                <th>Preference</th>
                <th>Status</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {waitlist.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <strong>{entry.clientName}</strong>
                    <br />
                    <small>{entry.clientEmail}</small>
                  </td>

                  <td>{entry.serviceName}</td>

                  <td>{entry.locationName}</td>

                  <td>
                    <strong>{entry.preferredDate}</strong>
                    <br />
                    <small>
                      {entry.appointmentType}
                      {entry.preferredStartTime
                        ? ` | ${entry.preferredStartTime}`
                        : ""}
                      {entry.preferredEndTime
                        ? ` - ${entry.preferredEndTime}`
                        : ""}
                    </small>
                  </td>

                  <td>
                    <span className={`badge ${entry.status}`}>
                      {entry.status}
                    </span>
                  </td>

                  <td>{entry.notes || "-"}</td>

                  <td>
                    <div className="row-actions">
                      {entry.status === "active" ? (
                        <>
                          <button
                            className="btn small-btn"
                            onClick={() =>
                              updateWaitlistStatus(entry.id, "notified")
                            }
                          >
                            Notify
                          </button>

                          <button
                            className="btn danger small-btn"
                            onClick={() =>
                              updateWaitlistStatus(entry.id, "cancelled")
                            }
                          >
                            Cancel
                          </button>
                        </>
                      ) : null}

                      {entry.status === "notified" ? (
                        <>
                          <button
                            className="btn small-btn"
                            onClick={() =>
                              updateWaitlistStatus(entry.id, "booked")
                            }
                          >
                            Mark Booked
                          </button>

                          <button
                            className="btn secondary small-btn"
                            onClick={() =>
                              updateWaitlistStatus(entry.id, "active")
                            }
                          >
                            Back to Active
                          </button>

                          <button
                            className="btn danger small-btn"
                            onClick={() =>
                              updateWaitlistStatus(entry.id, "cancelled")
                            }
                          >
                            Cancel
                          </button>
                        </>
                      ) : null}

                      {entry.status === "booked" ||
                      entry.status === "cancelled" ? (
                        <button
                          className="btn secondary small-btn"
                          onClick={() =>
                            updateWaitlistStatus(entry.id, "active")
                          }
                        >
                          Reactivate
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

export default AdminWaitlist;