import { useEffect, useState } from "react";
import {
  generateCampaignBible,
  approveCampaignBible,
  getCampaignBible,
} from "@roleplayer/core/api/stories.js";

const CENTRAL_CONFLICT_TYPES = ["Person", "Faction/Organization", "System", "Force", "Hybrid"];

// Admin-only. Three tabs: "Generate" (the create-a-Bible flow: input -> review
// editable draft -> approve/regenerate/back) plus two read-only "danger zone"
// tabs (styled red, since viewing them means seeing spoiler content) for
// watching the persisted Bible and the live tracker state - useful while this
// feature is new and being verified against real play, per Phase 1 of
// specs/campaign-bible.md.
export default function CampaignManagementModal({ storyId, onClose }) {
  const [activeTab, setActiveTab] = useState("generate");
  const [campaignInput, setCampaignInput] = useState("");
  const [draft, setDraft] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState(null);
  const [bibleData, setBibleData] = useState(null);
  const [loadingBible, setLoadingBible] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getCampaignBible(storyId)
      .then((data) => {
        if (cancelled) return;
        setBibleData(data);
        setLoadingBible(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setLoadingBible(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  async function handleGenerate() {
    if (!campaignInput.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await generateCampaignBible(storyId, campaignInput.trim());
      setDraft(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleApprove() {
    if (!draft) return;
    setApproving(true);
    setError(null);
    try {
      const result = await approveCampaignBible(storyId, draft);
      setBibleData(result);
      setDraft(null);
      setActiveTab("bible");
    } catch (err) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  }

  // path is an array of keys/indices into the draft object, e.g.
  // ["secondaryNpcs", 1, "wants"] - structuredClone keeps this a plain,
  // dependency-free way to update one deeply-nested field immutably.
  function updateDraftField(path, value) {
    setDraft((current) => {
      const next = structuredClone(current);
      let target = next;
      for (let i = 0; i < path.length - 1; i++) target = target[path[i]];
      target[path[path.length - 1]] = value;
      return next;
    });
  }

  const hasBible = Boolean(bibleData?.campaignBible);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel wide campaign-bible-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Campaign Management</h2>

        <div className="campaign-bible-tabs">
          <button
            type="button"
            className={activeTab === "generate" ? "active" : ""}
            onClick={() => setActiveTab("generate")}
          >
            Generate
          </button>
          <button
            type="button"
            className={"danger-tab" + (activeTab === "bible" ? " active" : "")}
            onClick={() => setActiveTab("bible")}
          >
            Bible Text
          </button>
          <button
            type="button"
            className={"danger-tab" + (activeTab === "beats" ? " active" : "")}
            onClick={() => setActiveTab("beats")}
          >
            Beats
          </button>
        </div>

        {error && <p role="alert">{error}</p>}

        {activeTab === "generate" && (
          <div className="campaign-bible-tab-content">
            {!draft ? (
              <>
                <p className="modal-subtitle">
                  Describe the kind of campaign the players want — tone, themes, threats that appeal to the
                  group, any existing threads to build from.
                </p>
                <textarea
                  className="chapter-summary-textarea"
                  autoFocus
                  value={campaignInput}
                  onChange={(e) => setCampaignInput(e.target.value)}
                  disabled={generating}
                />
                <div className="modal-actions">
                  <button type="button" onClick={onClose} disabled={generating}>
                    Cancel
                  </button>
                  <button type="button" onClick={handleGenerate} disabled={!campaignInput.trim() || generating}>
                    {generating ? "Generating..." : "Generate"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="modal-subtitle">
                  Review and edit before creating — this becomes the campaign's permanent foundation.
                </p>
                <BibleDraftEditor draft={draft} onChange={updateDraftField} />
                <div className="modal-actions">
                  <button type="button" onClick={() => setDraft(null)} disabled={approving}>
                    Back
                  </button>
                  <button type="button" onClick={handleGenerate} disabled={generating || approving}>
                    {generating ? "Regenerating..." : "Regenerate"}
                  </button>
                  <button type="button" onClick={handleApprove} disabled={approving}>
                    {approving ? "Creating..." : "Approve & Create Bible"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "bible" && (
          <div className="campaign-bible-tab-content danger-zone">
            {loadingBible ? (
              <p>Loading...</p>
            ) : !hasBible ? (
              <p className="modal-subtitle">No Campaign Bible created yet — use the Generate tab.</p>
            ) : (
              <BibleTextView bible={bibleData.campaignBible} />
            )}
          </div>
        )}

        {activeTab === "beats" && (
          <div className="campaign-bible-tab-content danger-zone">
            {loadingBible ? (
              <p>Loading...</p>
            ) : !hasBible ? (
              <p className="modal-subtitle">No Campaign Bible created yet — use the Generate tab.</p>
            ) : (
              <TrackersView beatsTracker={bibleData.beatsTracker} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BibleDraftEditor({ draft, onChange }) {
  return (
    <div className="bible-draft-editor">
      <h3>Central Conflict</h3>
      <label>
        Type
        <select value={draft.centralConflict.type} onChange={(e) => onChange(["centralConflict", "type"], e.target.value)}>
          {CENTRAL_CONFLICT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        Identity
        <textarea
          value={draft.centralConflict.identity}
          onChange={(e) => onChange(["centralConflict", "identity"], e.target.value)}
        />
      </label>
      <label>
        Motivation / Nature
        <textarea
          value={draft.centralConflict.motivationOrNature}
          onChange={(e) => onChange(["centralConflict", "motivationOrNature"], e.target.value)}
        />
      </label>
      <label>
        Public Face
        <textarea
          value={draft.centralConflict.publicFace}
          onChange={(e) => onChange(["centralConflict", "publicFace"], e.target.value)}
        />
      </label>
      <label>
        Resources
        <textarea
          value={draft.centralConflict.resources}
          onChange={(e) => onChange(["centralConflict", "resources"], e.target.value)}
        />
      </label>

      <hr />
      <h3>Secondary NPC Agendas</h3>
      {draft.secondaryNpcs.map((npc, i) => (
        <div className="bible-draft-entry" key={i}>
          <label>
            Name
            <input value={npc.name} onChange={(e) => onChange(["secondaryNpcs", i, "name"], e.target.value)} />
          </label>
          <label>
            Wants
            <textarea value={npc.wants} onChange={(e) => onChange(["secondaryNpcs", i, "wants"], e.target.value)} />
          </label>
          <label>
            Knows / Doesn't Know
            <textarea
              value={npc.knowsOrDoesntKnow}
              onChange={(e) => onChange(["secondaryNpcs", i, "knowsOrDoesntKnow"], e.target.value)}
            />
          </label>
          <label>
            Reaction If Players Get Close
            <textarea
              value={npc.reactionIfPlayersGetClose}
              onChange={(e) => onChange(["secondaryNpcs", i, "reactionIfPlayersGetClose"], e.target.value)}
            />
          </label>
        </div>
      ))}

      <hr />
      <h3>Beats</h3>
      {draft.beats.map((beat, i) => (
        <div className="bible-draft-entry" key={beat.id}>
          <label>
            Title ({beat.id})
            <input value={beat.title} onChange={(e) => onChange(["beats", i, "title"], e.target.value)} />
          </label>
          <label>
            Narrative
            <textarea value={beat.narrative} onChange={(e) => onChange(["beats", i, "narrative"], e.target.value)} />
          </label>
        </div>
      ))}
    </div>
  );
}

function BibleTextView({ bible }) {
  return (
    <div className="bible-draft-editor bible-readonly">
      <h3>Campaign Input</h3>
      <p>{bible.campaignInput}</p>

      <h3>Central Conflict</h3>
      <p>
        <strong>Type:</strong> {bible.centralConflict.type}
      </p>
      <p>
        <strong>Identity:</strong> {bible.centralConflict.identity}
      </p>
      <p>
        <strong>Motivation/Nature:</strong> {bible.centralConflict.motivationOrNature}
      </p>
      <p>
        <strong>Public Face:</strong> {bible.centralConflict.publicFace}
      </p>
      <p>
        <strong>Resources:</strong> {bible.centralConflict.resources}
      </p>

      <hr />
      <h3>Secondary NPC Agendas</h3>
      {bible.secondaryNpcs.map((npc, i) => (
        <div key={i} className="bible-draft-entry">
          <p>
            <strong>{npc.name}</strong>
          </p>
          <p>Wants: {npc.wants}</p>
          <p>Knows: {npc.knowsOrDoesntKnow}</p>
          <p>Reaction: {npc.reactionIfPlayersGetClose}</p>
        </div>
      ))}
    </div>
  );
}

function TrackersView({ beatsTracker }) {
  return (
    <div className="bible-draft-editor bible-readonly">
      <h3>Beats</h3>
      {beatsTracker.map((beat) => (
        <div key={beat.id} className={`bible-draft-entry tracker-status-${beat.status}`}>
          <p>
            <strong>{beat.title}</strong> — <span className="tracker-status-label">{beat.status}</span>
          </p>
          <p>{beat.narrative}</p>
        </div>
      ))}
    </div>
  );
}
