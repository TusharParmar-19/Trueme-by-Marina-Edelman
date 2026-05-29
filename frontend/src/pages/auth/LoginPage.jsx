import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../../api/apiClient";
import { saveAuth } from "../../utils/auth";

function LoginPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "admin@trueme.com",
    password: "Admin12345"
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleChange(event) {
    setForm({
      ...form,
      [event.target.name]: event.target.value
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      const data = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify(form)
      });

      saveAuth(data.token, data.user);

     if (data.user.role === "admin") {
  navigate("/admin");
  return;
}

if (data.user.role === "office_manager") {
  navigate("/manager");
  return;
}

      if (data.user.role === "therapist") {
        navigate("/therapist");
        return;
      }

      if (data.user.role === "client") {
        navigate("/client");
        return;
      }

      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>TrueMe Scheduling</h1>
        <p>Login to continue</p>

        <form onSubmit={handleSubmit} className="grid">
          <div>
            <label>Email</label>
            <input
              className="input"
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="admin@trueme.com"
            />
          </div>

          <div>
            <label>Password</label>
            <input
              className="input"
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Password"
            />
          </div>

          {error ? <div className="error">{error}</div> : null}

          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;