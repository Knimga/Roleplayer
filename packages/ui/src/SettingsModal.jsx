import { useEffect, useState } from "react";
import { getSettings, updateSettings } from "@roleplayer/core/api/settings.js";

export default function SettingsModal({ onClose }) {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch((err) => setError(err.message));
  }, []);

  async function toggle() {
    try {
      const updated = await updateSettings(!settings.discordNotificationsEnabled);
      setSettings(updated);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        {error && <p role="alert">{error}</p>}
        {settings && (
          <div className="settings-row">
            <span>Discord Notifications</span>
            <button
              type="button"
              className={`ready-toggle${settings.discordNotificationsEnabled ? " active" : ""}`}
              onClick={toggle}
            >
              <span className={`ready-dot${settings.discordNotificationsEnabled ? " active" : ""}`} />
              <span className="ready-label">{settings.discordNotificationsEnabled ? "On" : "Off"}</span>
            </button>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
