import { useEffect, useState } from "react";
import { generateChapterSummary, createNewChapter } from "@roleplayer/core/api/conversations.js";

const MAX_SUMMARY_LENGTH = 6000;

export default function NewChapterModal({ conversationId, onCreated, onCancel }) {
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    generateChapterSummary(conversationId)
      .then((result) => {
        if (cancelled) return;
        setSummary(result.summary);
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
  }, [conversationId]);

  async function handleApprove() {
    if (!summary.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const chapter = await createNewChapter(conversationId, summary);
      onCreated(chapter.id);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-panel wide" onClick={(e) => e.stopPropagation()}>
        <h2>Start New Chapter</h2>
        <p className="modal-subtitle">
          Review and edit the DM's summary of this chapter before it becomes part of the next one — this chapter
          locks permanently once approved.
        </p>

        {loading ? (
          <p>Summarizing the chapter so far...</p>
        ) : (
          <>
            <textarea
              className="chapter-summary-textarea"
              autoFocus
              maxLength={MAX_SUMMARY_LENGTH}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              disabled={creating}
            />
            {error && <p role="alert">{error}</p>}
            <div className="modal-actions">
              <button type="button" onClick={onCancel} disabled={creating}>
                Cancel
              </button>
              <button type="button" onClick={handleApprove} disabled={!summary.trim() || creating}>
                {creating ? "Creating chapter..." : "Approve & Start Chapter"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
