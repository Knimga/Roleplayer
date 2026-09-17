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
//
// layout: "card" (default; Cyberpunk Red) is the headed block - name, level
// line, ready dot + label, wound state. "row" (Laria 5e, from
// ui-handoff/party-row.html) is one line: inline PARTY label, name with the
// level in its tooltip, a lone status dot, the health word on the right.
// Both open the same modal.
export default function Party({ characterName, characterDetails, avatarUrl, description, gear, hp, ready, detailField, layout = "card" }) {
  const [modalOpen, setModalOpen] = useState(false);

  if (!characterName || !characterDetails) return null;

  const woundState = computeWoundState(hp?.current, hp?.max);
  const colorClass = woundStateColorClass(woundState);
  const levelLine = `Level ${characterDetails.level} ${characterDetails[detailField]}`;
  const readyLabel = ready ? "Ready for DM" : "Still writing…";

  return (
    <section id="party">
      {layout === "row" ? (
        <div className="party-row" onClick={() => setModalOpen(true)}>
          <span className="party-row__label">Party</span>
          <span className="party-row__name" title={levelLine}>
            {characterName}
          </span>
          <span className={`party-row__dot${ready ? " is-ready" : ""}`} title={readyLabel} />
          {woundState && <span className="party-row__health">{woundState}</span>}
        </div>
      ) : (
        <>
          <strong className="section-header">Party</strong>
          <div className="party-member" onClick={() => setModalOpen(true)}>
            <div className="party-member-info">
              <strong className="party-member-name">{characterName.toUpperCase()}</strong>
              <span className="party-member-level-detail">{levelLine}</span>
              <span className="party-ready-status">
                <span className={`party-ready-dot${ready ? " active" : ""}`} />
                <span className={`party-ready-label${ready ? " active" : ""}`}>{readyLabel}</span>
              </span>
            </div>
            {woundState && <span className={`wound-state ${colorClass}`}>{woundState}</span>}
          </div>
        </>
      )}
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
