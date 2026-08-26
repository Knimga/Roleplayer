import { useState } from "react";
import { login } from "./api/auth";

export default function LoginScreen({ onLogin }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = await login(code);
      onLogin(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="login">
      <h2>Enter your access code</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Access code"
          autoFocus
        />
        <button type="submit" disabled={submitting || !code}>
          {submitting ? "Checking..." : "Enter"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
