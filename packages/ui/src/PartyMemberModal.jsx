// detailField is per-app: the second locked-in character attribute is
// "role" (Cyberpunk Red) or "playerClass" (Laria 5e) - see NewStoryModal.jsx.
export default function PartyMemberModal({ characterName, characterDetails, avatarUrl, description, gear, detailField, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel party-member-modal" onClick={(e) => e.stopPropagation()}>
        <div className="party-member-modal-header">
          <span className="party-member-modal-name">{characterName}</span>
          <span className="party-member-modal-level">
            Level {characterDetails.level} {characterDetails[detailField]}
          </span>
        </div>
        <div className="party-member-modal-body">
          <div className="avatar-frame party-member-modal-avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt={`${characterName} avatar`} />
            ) : (
              <div className="avatar-placeholder">
                <span>No image</span>
              </div>
            )}
          </div>
          <div className="party-member-modal-fields">
            <div>
              <p className="party-member-modal-field-header">Description</p>
              <p className="party-member-modal-field-text">{description || "—"}</p>
            </div>
            <div>
              <p className="party-member-modal-field-header">Weapons &amp; Gear</p>
              <p className="party-member-modal-field-text">{gear || "—"}</p>
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Okay
          </button>
        </div>
      </div>
    </div>
  );
}
