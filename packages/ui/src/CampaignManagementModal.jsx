import { useEffect, useState } from "react";
import {
  generateBlueprint,
  approveBlueprint,
  getBlueprint,
  updateSituation,
  advanceMilestone,
  revertMilestone,
} from "@roleplayer/core/api/stories.js";
import ErrorBoundary from "./ErrorBoundary.jsx";

const PREMISE_TYPES = ["Person", "Faction/Organization", "System", "Force", "Hybrid"];
const AWARENESS_LEVELS = ["unaware", "suspects", "aware", "hunting"];

// A generated-but-unapproved draft is the only state in this modal that costs
// real money to reproduce (a Sonnet run with lore tool-calls). It lives in
// component state, so a render crash, an accidental click on the overlay, or
// an ordinary browser refresh would all throw it away. Mirror it into
// localStorage so none of those do.
const draftStorageKey = (storyId) => `blueprint-draft:${storyId}`;

// Client-side mirror of the server's findMissingFields (blueprint.js). Applied
// to anything read back out of localStorage: a stale value written by an older
// shape, or one truncated by a quota error, would otherwise crash
// BlueprintDraftEditor on the very fields it dereferences unguarded.
function isCompleteDraft(draft) {
  const premise = draft?.premise;
  const opening = draft?.openingSituation;
  const milestonesOk =
    Array.isArray(draft?.milestones) &&
    draft.milestones.length > 0 &&
    draft.milestones.every((m) => m?.id && typeof m.title === "string" && typeof m.narrative === "string");

  return Boolean(
    premise?.type &&
      premise.identity &&
      premise.motivationOrNature &&
      premise.publicFace &&
      premise.resources &&
      milestonesOk &&
      opening?.objective &&
      opening.nextMove &&
      opening.antagonistMove &&
      AWARENESS_LEVELS.includes(opening.antagonistAwareness),
  );
}

function loadStoredDraft(storyId) {
  try {
    const raw = window.localStorage.getItem(draftStorageKey(storyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isCompleteDraft(parsed) ? parsed : null;
  } catch {
    return null; // Unparseable, or storage blocked entirely.
  }
}

// Admin-only. Four tabs: "Generate" (the create-a-Blueprint flow: input ->
// review editable draft -> approve/regenerate/back) plus three "danger zone"
// tabs (styled red, since viewing them means seeing spoiler content):
// Blueprint (read-only premise + arc), Milestones (arc progress, with manual
// advance/un-advance), and Situation (the DM's live working memory - the one
// editable tab, since a drifting rewrite is corrected here). See
// specs/campaign-situation.md.
export default function CampaignManagementModal({ storyId, onClose }) {
  const [activeTab, setActiveTab] = useState("generate");
  const [campaignInput, setCampaignInput] = useState("");
  // Read once on mount (storyId is fixed for this modal's lifetime - LeftPanel
  // unmounts it to close). `wasRestored` only drives the notice telling the
  // admin their draft came back rather than being freshly generated.
  const [storedDraft] = useState(() => loadStoredDraft(storyId));
  const [draft, setDraft] = useState(storedDraft);
  const [wasRestored, setWasRestored] = useState(Boolean(storedDraft));
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null); // { blueprint, situation }
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBlueprint(storyId)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  // Mirror the draft to storage on every change, and clear it the moment
  // there's no draft (approved, or discarded via Back) so a stale one can't
  // reappear on a later visit.
  useEffect(() => {
    try {
      if (draft) window.localStorage.setItem(draftStorageKey(storyId), JSON.stringify(draft));
      else window.localStorage.removeItem(draftStorageKey(storyId));
    } catch {
      // Storage full or blocked. The in-memory draft still works for this
      // session; it just won't survive a reload. Not worth interrupting for.
    }
  }, [draft, storyId]);

  async function handleGenerate() {
    if (!campaignInput.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      setDraft(await generateBlueprint(storyId, campaignInput.trim()));
      setWasRestored(false);
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
      setData(await approveBlueprint(storyId, draft));
      setDraft(null);
      setWasRestored(false);
      setActiveTab("blueprint");
    } catch (err) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  }

  // Shared by the milestone move buttons and the Situation editor: run one
  // request, replace `situation` with what the server returns.
  async function runSituationRequest(request) {
    setBusy(true);
    setError(null);
    try {
      const result = await request();
      setData((current) => ({ ...current, situation: result.situation }));
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  // path is an array of keys/indices into the draft object, e.g.
  // ["milestones", 1, "narrative"] - structuredClone keeps this a plain,
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

  // A pre-Situation Campaign Bible can still be sitting in this column on an
  // older Story: it has `centralConflict` rather than `premise`, and its arc
  // lived in the `beats_tracker` column that the Situation migration dropped
  // (see specs/campaign-situation.md). There's nothing left to salvage into a
  // working Blueprint, so require the real shape here rather than trusting
  // truthiness — otherwise every tab renders half a Blueprint and the
  // Blueprint tab hard-crashes on the missing `premise`. Approving a freshly
  // generated Blueprint overwrites the legacy value outright, which is the
  // recovery path.
  const legacyBlueprint = data?.blueprint && !data.blueprint.premise ? data.blueprint : null;
  const hasBlueprint = Boolean(data?.blueprint?.premise && data.blueprint.milestones?.length);
  const noBlueprint = legacyBlueprint ? (
    <LegacyBlueprintNotice legacy={legacyBlueprint} />
  ) : (
    <p className="modal-subtitle">No Blueprint created yet — use the Generate tab.</p>
  );

  // Back throws away a generation that cost a model run, so make it
  // deliberate rather than one misclick away from gone.
  function handleDiscardDraft() {
    if (window.confirm("Discard this generated Blueprint?\n\nRegenerating it costs another model run.")) {
      setDraft(null);
      setWasRestored(false);
    }
  }

  // Rendered in place of a tab whose content threw, instead of letting the
  // throw unmount the whole app. The modal stays up and `draft` stays in
  // state, so a crash on one of the read-only tabs can no longer cost a
  // generation. Keyed on activeTab at the usage site, so leaving the broken
  // tab clears the error.
  const tabCrashNotice = (
    <div className="campaign-management-tab-content">
      <p role="alert">
        Something went wrong displaying this tab. Any unapproved draft is still safe — switch to the Generate tab
        to find it. Details are in the browser console.
      </p>
    </div>
  );

  function tabButton(id, label, danger) {
    return (
      <button
        type="button"
        className={(danger ? "danger-tab" : "") + (activeTab === id ? " active" : "")}
        onClick={() => setActiveTab(id)}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel wide campaign-management-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Campaign Management</h2>

        <div className="campaign-management-tabs">
          {tabButton("generate", "Generate", false)}
          {tabButton("blueprint", "Blueprint", true)}
          {tabButton("milestones", "Milestones", true)}
          {tabButton("situation", "Situation", true)}
        </div>

        {error && <p role="alert">{error}</p>}

        <ErrorBoundary key={activeTab} fallback={tabCrashNotice}>
          {activeTab === "generate" && (
            <div className="campaign-management-tab-content">
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
                  {wasRestored && (
                    <p className="modal-subtitle" role="status">
                      Restored an unapproved draft from earlier — nothing was lost. Approve it below to save it to the
                      campaign.
                    </p>
                  )}
                  <p className="modal-subtitle">
                    Review and edit before creating — the premise and milestones become the campaign's permanent
                    spine; the opening situation is just the DM's starting point and will be rewritten as play goes.
                    Nothing here is saved until you approve it, but it is kept safe if you switch tabs, close this, or
                    reload.
                  </p>
                  <BlueprintDraftEditor draft={draft} onChange={updateDraftField} />
                  <div className="modal-actions">
                    <button type="button" onClick={handleDiscardDraft} disabled={approving}>
                      Back
                    </button>
                    <button type="button" onClick={handleGenerate} disabled={generating || approving}>
                      {generating ? "Regenerating..." : "Regenerate"}
                    </button>
                    <button type="button" onClick={handleApprove} disabled={approving}>
                      {approving ? "Creating..." : "Approve & Create Blueprint"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "blueprint" && (
            <div className="campaign-management-tab-content danger-zone">
              {loading ? <p>Loading...</p> : !hasBlueprint ? noBlueprint : <BlueprintView blueprint={data.blueprint} />}
            </div>
          )}

          {activeTab === "milestones" && (
            <div className="campaign-management-tab-content danger-zone">
              {loading ? (
                <p>Loading...</p>
              ) : !hasBlueprint ? (
                noBlueprint
              ) : (
                <MilestonesView
                  blueprint={data.blueprint}
                  situation={data.situation}
                  busy={busy}
                  onAdvance={() => runSituationRequest(() => advanceMilestone(storyId))}
                  onRevert={() => runSituationRequest(() => revertMilestone(storyId))}
                />
              )}
            </div>
          )}

          {activeTab === "situation" && (
            <div className="campaign-management-tab-content danger-zone">
              {loading ? (
                <p>Loading...</p>
              ) : !hasBlueprint || !data.situation ? (
                noBlueprint
              ) : (
                <SituationEditor
                  key={data.situation.revision}
                  blueprint={data.blueprint}
                  situation={data.situation}
                  busy={busy}
                  onSave={(fields) => runSituationRequest(() => updateSituation(storyId, fields))}
                />
              )}
            </div>
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}

function PremiseFields({ premise, onChange }) {
  return (
    <>
      <label>
        Type
        <select value={premise.type} onChange={(e) => onChange("type", e.target.value)}>
          {PREMISE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        Identity
        <textarea value={premise.identity} onChange={(e) => onChange("identity", e.target.value)} />
      </label>
      <label>
        Motivation / Nature
        <textarea value={premise.motivationOrNature} onChange={(e) => onChange("motivationOrNature", e.target.value)} />
      </label>
      <label>
        Public Face
        <textarea value={premise.publicFace} onChange={(e) => onChange("publicFace", e.target.value)} />
      </label>
      <label>
        Resources
        <textarea value={premise.resources} onChange={(e) => onChange("resources", e.target.value)} />
      </label>
    </>
  );
}

function BlueprintDraftEditor({ draft, onChange }) {
  const opening = draft.openingSituation;
  return (
    <div className="bible-draft-editor">
      <h3>Premise</h3>
      <PremiseFields premise={draft.premise} onChange={(field, value) => onChange(["premise", field], value)} />

      <hr />
      <h3>Milestones</h3>
      {draft.milestones.map((m, i) => (
        <div className="bible-draft-entry" key={m.id}>
          <label>
            Title ({m.id})
            <input value={m.title} onChange={(e) => onChange(["milestones", i, "title"], e.target.value)} />
          </label>
          <label>
            Narrative
            <textarea value={m.narrative} onChange={(e) => onChange(["milestones", i, "narrative"], e.target.value)} />
          </label>
        </div>
      ))}

      <hr />
      <h3>Opening Situation</h3>
      <label>
        Objective (the first problem the players face — may surface in the fiction)
        <textarea value={opening.objective} onChange={(e) => onChange(["openingSituation", "objective"], e.target.value)} />
      </label>
      <label>
        DM's first move (private)
        <textarea value={opening.nextMove} onChange={(e) => onChange(["openingSituation", "nextMove"], e.target.value)} />
      </label>
      <label>
        Antagonist's opening move (private)
        <textarea
          value={opening.antagonistMove}
          onChange={(e) => onChange(["openingSituation", "antagonistMove"], e.target.value)}
        />
      </label>
      <label>
        Antagonist's awareness of the players
        <select
          value={opening.antagonistAwareness}
          onChange={(e) => onChange(["openingSituation", "antagonistAwareness"], e.target.value)}
        >
          {AWARENESS_LEVELS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

// Shown in place of every tab's content when this Story still holds a
// pre-Situation Campaign Bible. Surfaces the original campaign input, since
// that's the one piece worth carrying into a regeneration - the rest (the old
// central conflict, and an arc whose tracker column no longer exists) can't
// be converted into a Blueprint.
function LegacyBlueprintNotice({ legacy }) {
  return (
    <div className="bible-draft-editor bible-readonly">
      <p className="modal-subtitle">
        This Story has a Campaign Bible from before the Situation system. It can't be used — its narrative
        arc lived in a tracker that no longer exists — so the campaign is running without one. Generate a new
        Blueprint on the Generate tab to replace it.
      </p>
      {legacy.campaignInput && (
        <>
          <h3>Original campaign input</h3>
          <p>{legacy.campaignInput}</p>
        </>
      )}
    </div>
  );
}

function BlueprintView({ blueprint }) {
  const { premise } = blueprint;
  return (
    <div className="bible-draft-editor bible-readonly">
      <h3>Campaign Input</h3>
      <p>{blueprint.campaignInput}</p>

      <h3>Premise</h3>
      <p>
        <strong>Type:</strong> {premise.type}
      </p>
      <p>
        <strong>Identity:</strong> {premise.identity}
      </p>
      <p>
        <strong>Motivation/Nature:</strong> {premise.motivationOrNature}
      </p>
      <p>
        <strong>Public Face:</strong> {premise.publicFace}
      </p>
      <p>
        <strong>Resources:</strong> {premise.resources}
      </p>
    </div>
  );
}

// Client-side mirror of blueprint.js's milestoneStatuses: everything before
// the active milestone is complete, after it pending, and a null active id
// means the arc is exhausted. The server re-derives regardless; this only
// drives display and button enablement.
function milestoneStatuses(blueprint, situation) {
  const milestones = blueprint.milestones ?? [];
  const activeIndex = milestones.findIndex((m) => m.id === situation?.activeMilestoneId);
  return milestones.map((m, i) => ({
    ...m,
    status: activeIndex === -1 ? "complete" : i < activeIndex ? "complete" : i === activeIndex ? "active" : "pending",
  }));
}

function MilestonesView({ blueprint, situation, busy, onAdvance, onRevert }) {
  const milestones = milestoneStatuses(blueprint, situation);
  const activeIndex = milestones.findIndex((m) => m.status === "active");
  const canAdvance = activeIndex !== -1;
  const lastCompletedIndex = activeIndex === -1 ? milestones.length - 1 : activeIndex - 1;
  const canRevert = milestones[lastCompletedIndex]?.status === "complete";

  function handleAdvanceClick() {
    const current = milestones[activeIndex];
    const next = milestones[activeIndex + 1];
    const message = next
      ? `Advance past "${current.title}"?\n\n"${next.title}" becomes the new active milestone.\n\nThis can be undone with Un-advance.`
      : `Advance past "${current.title}"?\n\nThis was the last milestone - the arc will be marked complete.\n\nThis can be undone with Un-advance.`;
    if (window.confirm(message)) onAdvance();
  }

  function handleRevertClick() {
    const reactivating = milestones[lastCompletedIndex];
    const current = activeIndex !== -1 ? milestones[activeIndex] : null;
    const message = current
      ? `Un-advance "${reactivating.title}" back to active?\n\n"${current.title}" reverts to pending.`
      : `Un-advance "${reactivating.title}" back to active?\n\nThe arc will no longer be marked complete.`;
    if (window.confirm(message)) onRevert();
  }

  return (
    <div className="bible-draft-editor bible-readonly">
      <h3>Milestones</h3>
      <div className="modal-actions beats-move-controls">
        <button type="button" onClick={handleRevertClick} disabled={!canRevert || busy}>
          ← Un-advance
        </button>
        <button type="button" onClick={handleAdvanceClick} disabled={!canAdvance || busy}>
          Advance →
        </button>
      </div>
      {milestones.map((m) => (
        <div key={m.id} className={`bible-draft-entry tracker-status-${m.status}`}>
          <p>
            <strong>{m.title}</strong> — <span className="tracker-status-label">{m.status}</span>
          </p>
          <p>{m.narrative}</p>
        </div>
      ))}
    </div>
  );
}

// Keyed on situation.revision by the parent, so a rewrite landing while this
// is open (the pass runs after every DM turn) re-seeds the form rather than
// silently diverging from what's persisted.
function SituationEditor({ blueprint, situation, busy, onSave }) {
  const [objective, setObjective] = useState(situation.objective ?? "");
  const [nextMove, setNextMove] = useState(situation.nextMove ?? "");
  const [antagonistMove, setAntagonistMove] = useState(situation.antagonist?.move ?? "");
  const [awareness, setAwareness] = useState(situation.antagonist?.awareness ?? "unaware");
  const [factsText, setFactsText] = useState((situation.facts ?? []).join("\n"));

  const active = (blueprint.milestones ?? []).find((m) => m.id === situation.activeMilestoneId);
  const facts = factsText.split("\n").map((f) => f.trim()).filter(Boolean);

  function handleSave() {
    onSave({ objective, nextMove, antagonistMove, antagonistAwareness: awareness, facts });
  }

  return (
    <div className="bible-draft-editor">
      <p className="modal-subtitle">
        The DM's working memory — rewritten after every turn (revision {situation.revision ?? 0}). Active milestone:{" "}
        <strong>{active ? active.title : "none — arc complete"}</strong>. Edit here to correct a drift; the next turn
        picks it up as-is.
      </p>
      <label>
        Objective (what the players are pursuing — may surface in the fiction)
        <textarea value={objective} onChange={(e) => setObjective(e.target.value)} disabled={busy} />
      </label>
      <label>
        DM's next move (private)
        <textarea value={nextMove} onChange={(e) => setNextMove(e.target.value)} disabled={busy} />
      </label>
      <label>
        Antagonist's current move (private)
        <textarea value={antagonistMove} onChange={(e) => setAntagonistMove(e.target.value)} disabled={busy} />
      </label>
      <label>
        Antagonist's awareness of the players
        <select value={awareness} onChange={(e) => setAwareness(e.target.value)} disabled={busy}>
          {AWARENESS_LEVELS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <label>
        Established facts (one per line, most relevant first — {facts.length} of 12)
        <textarea
          className="chapter-summary-textarea"
          value={factsText}
          onChange={(e) => setFactsText(e.target.value)}
          disabled={busy}
        />
      </label>
      <div className="modal-actions">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy || !objective.trim() || !nextMove.trim() || !antagonistMove.trim() || facts.length > 12}
        >
          {busy ? "Saving..." : "Save Situation"}
        </button>
      </div>
    </div>
  );
}
