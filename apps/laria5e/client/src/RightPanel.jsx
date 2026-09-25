import { useState } from "react";
import DiceRoller from "./DiceRoller";
import AvatarUpload from "@roleplayer/ui/AvatarUpload.jsx";
import HpTracker from "./HpTracker";
import MpTracker from "./MpTracker";
import DefenseStats from "./DefenseStats";
import CharacterTextField from "@roleplayer/ui/CharacterTextField.jsx";
import Party from "@roleplayer/ui/Party.jsx";
import MapModal from "./MapModal";
import SpellbookModal from "./SpellbookModal";
import CastSpell from "./CastSpell";
import { saveCharacterDescription, saveCharacterGear } from "./api/conversations";

// The right vertical bar — mirrors LeftPanel.jsx on the left. Owns the panel's
// own layout; each thing inside is just a section stacked in this column,
// not a panel itself.
//
// Layout (ui-handoff mockup, 2026-09-25): the panel never scrolls as a
// whole. The portrait shrinks first when the window is short (down to a
// floor); only then does the region below it - stats through the dice
// roller - scroll, inside its own box.
export default function RightPanel({
  conversationId,
  activeCombatId,
  myCharacterName,
  myCharacterDetails,
  myAvatarUrl,
  onAvatarUploaded,
  myHp,
  onHpSaved,
  myMp,
  onMpSaved,
  myAc,
  onAcSaved,
  mySaves,
  onSavesSaved,
  mySpells,
  onSpellsSaved,
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
  const [spellbookOpen, setSpellbookOpen] = useState(false);
  const spells = mySpells ?? [];

  if (!myCharacterName) {
    return (
      <nav id="right-panel">
        <DiceRoller conversationId={conversationId} activeCombatId={activeCombatId} />
      </nav>
    );
  }

  return (
    <nav id="right-panel" className="with-character">
      <div className="right-panel__identity">
        <strong id="character-name-header">{myCharacterName}</strong>
        {myCharacterDetails && (
          <p id="character-class-level">
            Level {myCharacterDetails.level} {myCharacterDetails.playerClass}
          </p>
        )}
      </div>
      <hr />
      <AvatarUpload conversationId={conversationId} avatarUrl={myAvatarUrl} onUploaded={onAvatarUploaded} />

      <div className="right-panel__scroll">
        <div className="right-panel__vitals">
          <HpTracker conversationId={conversationId} hp={myHp} onSaved={onHpSaved} />
          <MpTracker conversationId={conversationId} mp={myMp} onSaved={onMpSaved} />
          <DefenseStats conversationId={conversationId} ac={myAc} saves={mySaves} onAcSaved={onAcSaved} onSavesSaved={onSavesSaved} />
        </div>
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
            icon="🎒"
            label="Weapons & Gear"
            buttonLabel="Gear"
            placeholder="What is your character carrying?"
            value={myGear}
            onSave={saveCharacterGear}
            onSaved={onGearSaved}
          />
          <div className="action-item">
            <button type="button" className="icon-button" onClick={() => setSpellbookOpen(true)}>
              <span className="icon-emoji">📖</span>
            </button>
            <span className="action-label">Spellbook</span>
          </div>
          <div className="action-item">
            <button type="button" className="icon-button" onClick={() => setMapOpen(true)}>
              <span className="icon-emoji">🗺️</span>
            </button>
            <span className="action-label">Map</span>
          </div>
        </div>
        <hr />
        <Party
          characterName={partyCharacterName}
          characterDetails={partyCharacterDetails}
          avatarUrl={partyAvatarUrl}
          description={partyDescription}
          gear={partyGear}
          hp={partyHp}
          ready={partyReady}
          detailField="playerClass"
          layout="row"
        />
        <hr />
        <CastSpell conversationId={conversationId} activeCombatId={activeCombatId} spells={spells} mp={myMp} onCast={onMpSaved} />
        <hr />
        <DiceRoller conversationId={conversationId} activeCombatId={activeCombatId} />
      </div>

      {mapOpen && <MapModal onClose={() => setMapOpen(false)} />}
      {spellbookOpen && (
        <SpellbookModal
          conversationId={conversationId}
          characterName={myCharacterName}
          spells={spells}
          mp={myMp}
          onClose={() => setSpellbookOpen(false)}
          onSaved={onSpellsSaved}
        />
      )}
    </nav>
  );
}
