import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../api/apiClient";
import DashboardLayout from "../../layouts/DashboardLayout";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function buildCalendarDays(currentDate) {
  const monthStart = getMonthStart(currentDate);
  const monthEnd = getMonthEnd(currentDate);

  const start = new Date(monthStart);
  start.setDate(start.getDate() - start.getDay());

  const end = new Date(monthEnd);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const days = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function formatMonthTitle(date) {
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function getRoleTitle(role) {
  if (role === "admin") {
    return "Admin Calendar";
  }

  if (role === "office_manager") {
    return "Manager Calendar";
  }

  if (role === "therapist") {
    return "My Therapist Calendar";
  }

  if (role === "client") {
    return "My Appointment Calendar";
  }

  return "Calendar";
}

function getEventTime(event) {
  return `${event.startTime} - ${event.endTime}`;
}

function getInitials(name) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "T";
}

function getBookingRoute(role) {
  if (role === "admin") return "/admin/appointments";
  if (role === "office_manager") return "/manager/appointments";
  if (role === "client") return "/client";
  return "";
}

function CalendarPage({ role }) {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(
    toDateInputValue(new Date()),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedTherapistId, setSelectedTherapistId] = useState("");

  const days = useMemo(() => buildCalendarDays(currentDate), [currentDate]);

  const therapistOptions = useMemo(() => {
    const map = new Map();

    events.forEach((event) => {
      if (event.therapistId && event.therapistName) {
        map.set(event.therapistId, event.therapistName);
      }
    });

    return Array.from(map.entries()).map(([id, name]) => ({
      id,
      name,
    }));
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (!selectedTherapistId) {
      return events;
    }

    return events.filter((event) => {
      return event.therapistId === selectedTherapistId;
    });
  }, [events, selectedTherapistId]);

  const startDate = toDateInputValue(days[0]);
  const endDate = toDateInputValue(days[days.length - 1]);

  async function loadCalendarEvents() {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest(
        `/calendar?startDate=${startDate}&endDate=${endDate}`,
      );

      setEvents(data.events || []);
    } catch (err) {
      setError(err.message || "Could not load calendar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCalendarEvents();
  }, [startDate, endDate]);

  useEffect(() => {
    const intervalId = window.setInterval(function () {
      loadCalendarEvents();
    }, 30000);

    function handleFocus() {
      loadCalendarEvents();
    }

    window.addEventListener("focus", handleFocus);

    return function cleanup() {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [startDate, endDate]);

  function goPreviousMonth() {
    setCurrentDate((current) => {
      return new Date(current.getFullYear(), current.getMonth() - 1, 1);
    });
  }

  function goNextMonth() {
    setCurrentDate((current) => {
      return new Date(current.getFullYear(), current.getMonth() + 1, 1);
    });
  }

  function goToday() {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(toDateInputValue(today));
  }

  function getEventsForDate(dateValue) {
    return filteredEvents.filter((event) => event.date === dateValue);
  }

  const selectedDateEvents = getEventsForDate(selectedDate);

  const bookingRoute = getBookingRoute(role);

  return (
    <DashboardLayout
      title={getRoleTitle(role)}
      subtitle="View appointments in calendar format. Calendar updates automatically when new bookings are created."
    >
      {error ? <div className="alert error">{error}</div> : null}

      <div className="card">
        <div className="calendar-toolbar">
          <div>
            <h2>{formatMonthTitle(currentDate)}</h2>
            {loading ? <p>Loading calendar...</p> : null}
          </div>

          {role === "admin" || role === "office_manager" ? (
            <div className="calendar-filter">
              <label>Filter by Therapist</label>
              <select
                className="input"
                value={selectedTherapistId}
                onChange={(event) => setSelectedTherapistId(event.target.value)}
              >
                <option value="">All therapists</option>
                {therapistOptions.map((therapist) => (
                  <option key={therapist.id} value={therapist.id}>
                    {therapist.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="row-actions">
            <button
              className="btn secondary"
              type="button"
              onClick={goPreviousMonth}
            >
              Previous
            </button>

            <button className="btn secondary" type="button" onClick={goToday}>
              Today
            </button>

            <button
              className="btn secondary"
              type="button"
              onClick={goNextMonth}
            >
              Next
            </button>

            <button className="btn" type="button" onClick={loadCalendarEvents}>
              Refresh
            </button>
          </div>
        </div>

        <div className="calendar-grid calendar-week-header">
          {DAY_NAMES.map((dayName) => (
            <div key={dayName} className="calendar-day-name">
              {dayName}
            </div>
          ))}
        </div>

        <div className="calendar-grid">
          {days.map((day) => {
            const dateValue = toDateInputValue(day);
            const dayEvents = getEventsForDate(dateValue);
            const isCurrentMonth = day.getMonth() === currentDate.getMonth();
            const isSelected = selectedDate === dateValue;

            return (
              <button
                key={dateValue}
                type="button"
                className={`calendar-cell ${
                  isCurrentMonth ? "" : "calendar-cell-muted"
                } ${isSelected ? "calendar-cell-selected" : ""}`}
                onClick={() => setSelectedDate(dateValue)}
              >
                <div className="calendar-date-number">{day.getDate()}</div>

                <div className="calendar-events">
                  {dayEvents.slice(0, 3).map((event) => (
                    <div
                      key={event.id}
                      className="calendar-event-pill interactive"
                      title={`${event.startTime} ${event.clientName}`}
                    >
                      {event.startTime} {event.clientName}
                    </div>
                  ))}

                  {dayEvents.length > 3 ? (
                    <div className="calendar-more">
                      +{dayEvents.length - 3} more
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2>Appointments on {selectedDate}</h2>

        {selectedDateEvents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon" aria-hidden="true">⌁</div>
            <h3>No appointments on this date</h3>
            <p>This date is clear. Create a booking when you need one.</p>
            {bookingRoute ? (
              <button
                className="btn secondary small-btn"
                type="button"
                onClick={() => navigate(bookingRoute)}
              >
                Book one
              </button>
            ) : null}
          </div>
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
              </tr>
            </thead>

            <tbody>
              {selectedDateEvents.map((event) => (
                <tr key={event.id}>
                  <td>{getEventTime(event)}</td>
                  <td>
                    <strong>{event.clientName}</strong>
                    <br />
                    <small>{event.clientEmail}</small>
                  </td>
                  <td>
                    <div className="avatar-name">
                      <span className="initials-avatar">
                        {getInitials(event.therapistName)}
                      </span>
                      <span>{event.therapistName}</span>
                    </div>
                  </td>
                  <td>{event.serviceName}</td>
                  <td>{event.locationName}</td>
                  <td>{event.roomName || "-"}</td>
                  <td>
                    <span className={`badge ${event.status}`}>
                      {event.status}
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

export default CalendarPage;
