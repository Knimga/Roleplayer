import { useState } from "react";
import PartyMemberModal from "./PartyMemberModal.jsx";
import { computeWoundState, woundStateColorClass } from "@roleplayer/core/woundState.js";

// The other player's character, at a glance — read-only, sourced entirely
// from data the conversation list already carries (characterNames/Details/
// avatarImages/characterDescriptions/characterGear/characterHp/characterReady),
// no fetch of its own. Wound State and ready status both update live via the
// "character-updated" SSE event handled in ChatView.jsx, which triggers the
// same refetch that keeps everything else here current.
//
// detailField is per-app: the second locked-in character attribute is "role"
// (Cyberpunk Red) or "playerClass" (Laria 5e) - see NewStoryModal.jsx. The
// CSS class on that line is a fixed "party-member-level-detail" regardless
// of app; each app's own App.css styles it identically either way, so this
// is just one shared selector instead of two identically-styled ones.
export default function Party({ characterName, characterDetails, avatarUrl, description, gear, hp, ready, detailField }) {
  const [modalOpen, setModalOpen] = useState(false);

  if (!characterName || !characterDetails) return null;

  const woundState = computeWoundState(hp?.current, hp?.max);
  const colorClass = woundStateColorClass(woundState);

  return (
    <section id="party">
      <strong className="section-header">Party</strong>
      <div className="party-member" onClick={() => setModalOpen(true)}>
        <div className="party-member-info">
          <strong className="party-member-name">{characterName.toUpperCase()}</strong>
          <span className="party-member-level-detail">
            Level {characterDetails.level} {characterDetails[detailField]}
          </span>
          <span className="party-ready-status">
            <span className={`party-ready-dot${ready ? " active" : ""}`} />
            <span className={`party-ready-label${ready ? " active" : ""}`}>
              {ready ? "Ready for DM" : "Still writing…"}
            </span>
          </span>
        </div>
        {woundState && <span className={`wound-state ${colorClass}`}>{woundState}</span>}
      </div>
      {modalOpen && (
        <PartyMemberModal
          characterName={characterName}
          characterDetails={characterDetails}
          avatarUrl={avatarUrl}
          description={description}
          gear={gear}
          detailField={detailField}
          onClose={() => setModalOpen(false)}
        />
      )}
    </section>
  );
}
