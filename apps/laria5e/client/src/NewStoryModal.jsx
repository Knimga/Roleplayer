import { useEffect, useState } from "react";
import { listUsers } from "@roleplayer/core/api/auth.js";
import { createStory } from "./api/conversations";

const CLASSES = [
  "Barbarian",
  "Bard",
  "Cleric",
  "Druid",
  "Fighter",
  "Monk",
  "Paladin",
  "Ranger",
  "Rogue",
  "Sorcerer",
  "Warlock",
  "Wizard",
];

function capitalize(name) {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function isValidLevel(level) {
  const n = Number(level);
  return level !== "" && Number.isInteger(n) && n >= 1 && n <= 20;
}

export default function NewStoryModal({ onCreated, onCancel }) {
  const [roster, setRoster] = useState([]);
  const [names, setNames] = useState({});
  const [details, setDetails] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listUsers().then(setRoster);
  }, []);

  const allFilled =
    roster.length > 0 &&
    roster.every((u) => {
      const d = details[u.username] ?? {};
      return names[u.username]?.trim() && CLASSES.includes(d.playerClass) && isValidLevel(d.level);
    });

  function updateDetail(username, field, value) {
    setDetails((prev) => ({ ...prev, [username]: { ...prev[username], [field]: value } }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!allFilled) return;
    setSubmitting(true);
    setError(null);
    try {
      const characterNames = Object.fromEntries(
        Object.entries(names).map(([username, name]) => [username, capitalize(name)]),
      );
      const characterDetails = Object.fromEntries(
        roster.map((u) => [
          u.username,
          { playerClass: details[u.username].playerClass, level: Number(details[u.username].level) },
        ]),
      );
      const conversation = await createStory(characterNames, characterDetails);
      onCreated(conversation.id);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h2>New Story</h2>
        <p className="modal-subtitle">
          Character names, classes, and levels are locked in once this story begins.
        </p>
        <form onSubmit={handleSubmit}>
          {roster.map((u, index) => (
            <div key={u.username}>
              {index > 0 && <hr />}
              <label>
                Character name for {u.username}
                <input
                  value={names[u.username] ?? ""}
                  onChange={(e) => setNames((prev) => ({ ...prev, [u.username]: e.target.value }))}
                  autoFocus={roster[0]?.username === u.username}
                />
              </label>
              <label>
                Class
                <select
                  value={details[u.username]?.playerClass ?? ""}
                  onChange={(e) => updateDetail(u.username, "playerClass", e.target.value)}
                >
                  <option value="" disabled>
                    Select...
                  </option>
                  {CLASSES.map((characterClass) => (
                    <option key={characterClass} value={characterClass}>
                      {characterClass}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Level
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={details[u.username]?.level ?? ""}
                  onChange={(e) => updateDetail(u.username, "level", e.target.value)}
                />
              </label>
            </div>
          ))}
          {error && <p role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" disabled={!allFilled || submitting}>
              {submitting ? "Starting..." : "Begin"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
