import { useState } from "react";
import DiceRoller from "./DiceRoller";
import AvatarUpload from "@roleplayer/ui/AvatarUpload.jsx";
import HpTracker from "./HpTracker";
import SpTracker from "./SpTracker";
import CharacterTextField from "@roleplayer/ui/CharacterTextField.jsx";
import Party from "./Party";
import MapModal from "./MapModal";
import { saveCharacterDescription, saveCharacterGear } from "./api/conversations";

// The right vertical bar — mirrors LeftPanel.jsx on the left. Owns the panel's
// own layout (width/border/scroll); each thing inside (DiceRoller today,
// more later) is just a section stacked in this column, not a panel itself.
export default function RightPanel({
  conversationId,
  myCharacterName,
  myCharacterDetails,
  myAvatarUrl,
  onAvatarUploaded,
  myHp,
  onHpSaved,
  mySp,
  onSpSaved,
  myDescription,
  onDescriptionSaved,
  myGear,
  onGearSaved,
  partyCharacterName,
  partyCharacterDetails,
  partyAvatarUrl,
  partyDescription,
  partyGear,
  partyHp,
  partyReady,
}) {
  const [mapOpen, setMapOpen] = useState(false);

  return (
    <nav id="right-panel">
      {myCharacterName && (
        <>
          <strong id="character-name-header">{myCharacterName}</strong>
          {myCharacterDetails && (
            <p id="character-role-level">
              Level {myCharacterDetails.level} {myCharacterDetails.role}
            </p>
          )}
          <hr />
          <AvatarUpload conversationId={conversationId} avatarUrl={myAvatarUrl} onUploaded={onAvatarUploaded} />
          <HpTracker conversationId={conversationId} hp={myHp} onSaved={onHpSaved} />
          <SpTracker conversationId={conversationId} sp={mySp} onSaved={onSpSaved} />
          <hr />
          <div className="character-actions-row">
            <CharacterTextField
              conversationId={conversationId}
              icon="📝"
              label="Description"
              buttonLabel="Description"
              placeholder="What does your character look like?"
              value={myDescription}
              onSave={saveCharacterDescription}
              onSaved={onDescriptionSaved}
            />
            <CharacterTextField
              conversationId={conversationId}
              icon="💼"
              label="Weapons & Gear"
              buttonLabel="Gear"
              placeholder="What is your character carrying?"
              value={myGear}
              onSave={saveCharacterGear}
              onSaved={onGearSaved}
            />
            <div className="action-item">
              <button type="button" className="icon-button" onClick={() => setMapOpen(true)}>
                <span className="icon-emoji">🌐</span>
              </button>
              <span className="action-label">Map</span>
            </div>
          </div>
          {mapOpen && <MapModal onClose={() => setMapOpen(false)} />}
          <hr />
          <Party
            characterName={partyCharacterName}
            characterDetails={partyCharacterDetails}
            avatarUrl={partyAvatarUrl}
            description={partyDescription}
            gear={partyGear}
            hp={partyHp}
            ready={partyReady}
          />
          <hr />
        </>
      )}
      <DiceRoller conversationId={conversationId} />
    </nav>
  );
}
