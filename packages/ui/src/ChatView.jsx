import { useEffect, useRef, useState } from "react";
import {
  getMessages,
  sendMessage,
  requestReply,
  sendTypingPing,
  saveCharacterReady,
  subscribeToEvents,
  editMessage,
  deleteMessage,
} from "@roleplayer/core/api/conversations.js";
import {
  getActiveCombat,
  sendCombatMessage,
  requestCombatReply,
  endCombat,
  editCombatMessage,
  deleteCombatMessage,
} from "@roleplayer/core/api/combats.js";

// The sender the server stamps on a fight's outcome message
// (packages/server-core/src/combatsRouter.js) - rendered visually marked, per
// specs/combat-encounters.md Open Questions.
const COMBAT_OUTCOME_SENDER = "Combat Outcome";

function messageClassName(m) {
  if (m.sender === "Story So Far") return `${m.role} recap`;
  if (m.sender === COMBAT_OUTCOME_SENDER) return `${m.role} outcome`;
  return m.role;
}

const TYPING_PING_THROTTLE_MS = 2000;
const TYPING_INDICATOR_TIMEOUT_MS = 4000;
import AnimatedGMReply from "@roleplayer/ui/AnimatedGMReply.jsx";

// Renders **bold** and *italic* asterisk markup as <strong>/<em> instead of
// showing the literal asterisks. Not full markdown — just what the DM's
// narration actually uses.
function formatContent(text) {
  const parts = text.split(/(\*\*[^*]+?\*\*|\*[^*]+?\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

export default function ChatView({
  username,
  isAdmin,
  conversationId,
  myCharacterName,
  isActiveChapter = true,
  onActivity,
  myReady,
  onActiveCombatChange,
}) {
  const [messages, setMessages] = useState([]);
  // The chapter's active combat - { id, messages } - or null. While set, the
  // composer, "Ask the DM" and the dice roller all post to the combat routes
  // and the combat's transcript renders as a block after the main messages
  // (specs/combat-encounters.md §5.5). Lifted to the app via
  // onActiveCombatChange so the roller and the sidebar can see it too.
  const [activeCombat, setActiveCombat] = useState(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState(null);
  const [awaitingReply, setAwaitingReply] = useState(false);
  // Text shown alongside the pending-reply spinner, e.g. "DM is rolling..."
  // - null shows just the bare spinner (the pre-existing default). Reset on
  // every fresh "generating" event so a status from an earlier turn can't
  // linger into the next one.
  const [pendingStatusText, setPendingStatusText] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  // Which transcript editingId belongs to - main chapter or the active
  // combat - so commitEdit/handleDeleteMessage route to the right API.
  // Meaningless while editingId is null.
  const [editingInCombat, setEditingInCombat] = useState(false);
  // GM messages that arrived live over SSE this session — only these get
  // the typewriter/fade-in animation. History loaded on mount or on a
  // conversation switch renders instantly, so revisiting a long
  // conversation never forces a replay.
  const [liveMessageIds, setLiveMessageIds] = useState(() => new Set());
  const [typingSender, setTypingSender] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const lastTypingPingRef = useRef(0);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    // Reset local state on every conversation switch (including to "none
    // selected") before (re)establishing history + SSE for the new id.
    setMessages([]);
    setActiveCombat(null);
    onActiveCombatChange?.(null);
    setAwaitingReply(false);
    setPendingStatusText(null);
    setNotice(null);
    setLiveMessageIds(new Set());
    setEditingId(null);
    setTypingSender(null);
    clearTimeout(typingTimeoutRef.current);
    lastTypingPingRef.current = 0;

    if (!conversationId) return;

    // `cancelled` guards against React StrictMode's dev-only double-invoke
    // (mount -> cleanup -> mount): without it, cleanup can run before this
    // async function reaches subscribeToEvents(), leaking the first
    // EventSource connection and causing every message to arrive twice. Also
    // guards against a fast conversation switch resolving after a newer one.
    let cancelled = false;
    let unsubscribe = () => {};

    (async () => {
      const [history, { combat }] = await Promise.all([getMessages(conversationId), getActiveCombat(conversationId)]);
      if (cancelled) return;
      setMessages(history);
      setActiveCombat(combat);
      onActiveCombatChange?.(combat ? { id: combat.id, conversationId } : null);

      unsubscribe = subscribeToEvents(conversationId, ({ type, message, sender, senderUsername, text, combat: startedCombat }) => {
        // "generating"/"failed" have no message row — they only toggle the
        // shared spinner, for both players, not just whoever clicked "Ask
        // the DM". Handled first and returned early so they don't fall into
        // the message-list branches below or trigger onActivity for nothing.
        if (type === "generating") {
          setAwaitingReply(true);
          setPendingStatusText(null);
          return;
        }
        if (type === "failed") {
          setAwaitingReply(false);
          setPendingStatusText(null);
          return;
        }
        // Also no message row - a live status update for the pending-reply
        // spinner (e.g. "DM is rolling...") fired mid-generation.
        if (type === "status") {
          setPendingStatusText(text ?? null);
          return;
        }
        // No message row either — a character field (currently just HP)
        // changed on the server. Nothing for the message list to do; just
        // refresh the conversation list so the Party panel's derived Wound
        // State picks up the new value.
        if (type === "character-updated") {
          onActivity?.();
          return;
        }
        // Also no message row — a presence ping, not a persisted event.
        // Ignore our own typing; otherwise (re)arm the auto-clear timer so
        // the indicator disappears ~4s after the other player goes idle.
        if (type === "typing") {
          if (senderUsername !== username) {
            setTypingSender(sender);
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => setTypingSender(null), TYPING_INDICATOR_TIMEOUT_MS);
          }
          return;
        }
        // Combat mode events, all on this chapter's own channel. A fight
        // starting or ending also brings the shared spinner down: the turn
        // that started it (the cut-in) is over, and the outcome message
        // below is the reply that ends the turn that ended it.
        if (type === "combat-started") {
          setActiveCombat(startedCombat);
          onActiveCombatChange?.({ id: startedCombat.id, conversationId });
          setAwaitingReply(false);
          setPendingStatusText(null);
          onActivity?.();
          return;
        }
        if (type === "combat-message") {
          setActiveCombat((prev) => (prev ? { ...prev, messages: [...prev.messages, message] } : prev));
          if (message.role === "assistant") {
            setAwaitingReply(false);
            setPendingStatusText(null);
            setLiveMessageIds((prev) => new Set(prev).add(message.id));
          }
          setTypingSender(null);
          clearTimeout(typingTimeoutRef.current);
          onActivity?.();
          return;
        }
        if (type === "combat-message-updated") {
          setActiveCombat((prev) =>
            prev ? { ...prev, messages: prev.messages.map((m) => (m.id === message.id ? message : m)) } : prev,
          );
          return;
        }
        if (type === "combat-message-deleted") {
          setActiveCombat((prev) => (prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== message.id) } : prev));
          return;
        }
        if (type === "combat-ended") {
          setActiveCombat(null);
          onActiveCombatChange?.(null);
          setMessages((prev) => [...prev, message]);
          setLiveMessageIds((prev) => new Set(prev).add(message.id));
          setAwaitingReply(false);
          setPendingStatusText(null);
          onActivity?.();
          return;
        }
        if (type === "updated") {
          setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
        } else if (type === "deleted") {
          setMessages((prev) => prev.filter((m) => m.id !== message.id));
        } else {
          setMessages((prev) => [...prev, message]);
          if (message.role === "assistant") {
            setAwaitingReply(false);
            setPendingStatusText(null);
            setLiveMessageIds((prev) => new Set(prev).add(message.id));
          }
          // A message just landed, so whatever was being typed for it is
          // sent — no need to wait out the rest of the auto-clear timer.
          setTypingSender(null);
          clearTimeout(typingTimeoutRef.current);
        }
        onActivity?.();
      });
    })();

    return () => {
      cancelled = true;
      clearTimeout(typingTimeoutRef.current);
      unsubscribe();
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeCombat, awaitingReply]);

  // Auto-grow the textarea to fit its content; CSS max-height + overflow-y
  // takes over once it hits the cap.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  // In combat the guard reads the combat's own transcript: an empty one is
  // the fight's opening turn, which the combat DM takes first.
  const guardedMessages = activeCombat ? activeCombat.messages : messages;
  const lastMessage = guardedMessages[guardedMessages.length - 1];
  const dmCanRespond = !lastMessage || lastMessage.role !== "assistant";

  function handleDraftChange(value) {
    setDraft(value);
    if (!conversationId || !value.trim()) return;
    const now = Date.now();
    if (now - lastTypingPingRef.current < TYPING_PING_THROTTLE_MS) return;
    lastTypingPingRef.current = now;
    sendTypingPing(conversationId).catch(() => {});
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!conversationId) return;
    const content = draft.trim();
    if (!content) return;
    setDraft("");
    setNotice(null);
    try {
      if (activeCombat) {
        await sendCombatMessage(activeCombat.id, content);
      } else {
        await sendMessage(conversationId, content);
      }
    } catch (err) {
      setNotice(err.message);
      setDraft(content);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  async function handleAskDm() {
    setNotice(null);
    setAwaitingReply(true);
    try {
      // Resolves as soon as the server accepts the request (202) — the
      // actual reply is generated in the background and arrives later over
      // SSE, which is what actually clears awaitingReply (see the
      // subscribeToEvents callback above). Only clear it here on failure.
      if (activeCombat) {
        await requestCombatReply(activeCombat.id);
      } else {
        await requestReply(conversationId);
      }
    } catch (err) {
      setNotice(err.message);
      setAwaitingReply(false);
    }
  }

  // Admin manual override (specs/combat-encounters.md §5.4): the combat DM is
  // made to produce the outcome from the transcript as it stands. The
  // combat-ended event does the rest.
  async function handleEndCombat() {
    if (!activeCombat) return;
    if (!window.confirm("End this combat now? The combat DM will write up the outcome from the fight so far.")) return;
    setNotice(null);
    setAwaitingReply(true);
    try {
      await endCombat(activeCombat.id);
    } catch (err) {
      setNotice(err.message);
      setAwaitingReply(false);
    }
  }

  // Purely a signal to the other player (shown on their Party panel) — has
  // no effect on "Ask the DM" itself, which stays governed entirely by
  // dmCanRespond/awaitingReply above.
  async function handleToggleReady() {
    try {
      await saveCharacterReady(conversationId, !myReady);
      onActivity?.();
    } catch (err) {
      setNotice(err.message);
    }
  }

  // Client-side mirror of the server's lock check, for showing/hiding the
  // edit/delete icons — the server re-checks regardless on every request, so
  // this only controls UI visibility, not actual enforcement. `list` is
  // whichever transcript `m` belongs to - the main chapter or the active
  // combat's own messages - since each is locked independently (a combat DM
  // reply only locks that combat's own earlier messages, never the chapter's).
  function isLocked(list, index) {
    return list.slice(index + 1).some((m) => m.role === "assistant");
  }

  function canEdit(list, m, index) {
    return isActiveChapter && m.role === "user" && (isAdmin || m.authorUsername === username) && !isLocked(list, index);
  }

  // Delete-only escape hatch, mirroring the server's allowAdminDeleteLatest:
  // admin can always delete the single most recent message in the list, even
  // the DM's own reply, to cleanly retry a bad response - never extended to
  // editing.
  function canDelete(list, m, index) {
    return canEdit(list, m, index) || (isAdmin && isActiveChapter && index === list.length - 1);
  }

  function startEdit(m, inCombat = false) {
    setEditingId(m.id);
    setEditDraft(m.content);
    setEditingInCombat(inCombat);
  }

  async function commitEdit(messageId, inCombat = editingInCombat) {
    const content = editDraft.trim();
    setEditingId(null);
    if (!content) return;
    try {
      if (inCombat) {
        await editCombatMessage(activeCombat.id, messageId, content);
      } else {
        await editMessage(conversationId, messageId, content);
      }
    } catch (err) {
      setNotice(err.message);
    }
  }

  function handleEditKeyDown(e, messageId, inCombat) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitEdit(messageId, inCombat);
    }
    if (e.key === "Escape") {
      setEditingId(null);
    }
  }

  async function handleDeleteMessage(m, inCombat = false) {
    if (!window.confirm("Delete this message? This can't be undone.")) return;
    try {
      if (inCombat) {
        await deleteCombatMessage(activeCombat.id, m.id);
      } else {
        await deleteMessage(conversationId, m.id);
      }
    } catch (err) {
      setNotice(err.message);
    }
  }

  return (
    <section id="chat">
      <div className="chat-inner">
        <ul id="messages">
          {messages.map((m, i) => (
            <li key={m.id} className={messageClassName(m)}>
              <span className="sender">{m.sender}</span>
              {editingId === m.id ? (
                <textarea
                  className="edit-textarea"
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onBlur={() => commitEdit(m.id, false)}
                  onKeyDown={(e) => handleEditKeyDown(e, m.id, false)}
                />
              ) : (
                <div className="bubble">
                  {m.role === "assistant" && m.sender !== "Story So Far" && m.sender !== COMBAT_OUTCOME_SENDER && liveMessageIds.has(m.id) ? (
                    <AnimatedGMReply text={m.content} />
                  ) : (
                    formatContent(m.content)
                  )}
                  {m.edited && <span className="edited-label">(edited)</span>}
                </div>
              )}
              {editingId !== m.id && (canEdit(messages, m, i) || canDelete(messages, m, i)) && (
                <div className="message-actions">
                  {canEdit(messages, m, i) && (
                    <button type="button" onClick={() => startEdit(m, false)} aria-label="Edit message">
                      ✎
                    </button>
                  )}
                  {canDelete(messages, m, i) && (
                    <button type="button" onClick={() => handleDeleteMessage(m, false)} aria-label="Delete message">
                      🗑
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
          {activeCombat && (
            <li className="combat-block">
              <div className="combat-divider">
                <span>⚔ Combat</span>
                {isAdmin && (
                  <button type="button" className="combat-end-button" onClick={handleEndCombat} disabled={awaitingReply}>
                    End combat
                  </button>
                )}
              </div>
              <ul className="combat-messages">
                {activeCombat.messages.length === 0 && (
                  <li className="combat-empty">The fight is on. Ask the DM to open it.</li>
                )}
                {activeCombat.messages.map((m, i) => (
                  <li key={m.id} className={m.role}>
                    <span className="sender">{m.sender}</span>
                    {editingId === m.id ? (
                      <textarea
                        className="edit-textarea"
                        autoFocus
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onBlur={() => commitEdit(m.id, true)}
                        onKeyDown={(e) => handleEditKeyDown(e, m.id, true)}
                      />
                    ) : (
                      <div className="bubble">
                        {m.role === "assistant" && liveMessageIds.has(m.id) ? <AnimatedGMReply text={m.content} /> : formatContent(m.content)}
                        {m.edited && <span className="edited-label">(edited)</span>}
                      </div>
                    )}
                    {editingId !== m.id && (canEdit(activeCombat.messages, m, i) || canDelete(activeCombat.messages, m, i)) && (
                      <div className="message-actions">
                        {canEdit(activeCombat.messages, m, i) && (
                          <button type="button" onClick={() => startEdit(m, true)} aria-label="Edit message">
                            ✎
                          </button>
                        )}
                        {canDelete(activeCombat.messages, m, i) && (
                          <button type="button" onClick={() => handleDeleteMessage(m, true)} aria-label="Delete message">
                            🗑
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <div className="combat-divider combat-divider-bottom">
                <span>⚔</span>
              </div>
            </li>
          )}
          {awaitingReply && (
            <li className="pending">
              <span className="spinner" aria-label="Waiting for the DM" />
              {pendingStatusText && <span className="pending-status-text">{pendingStatusText}</span>}
            </li>
          )}
          <div ref={bottomRef} />
        </ul>

        {notice && <p role="alert">{notice}</p>}

        {!conversationId ? (
          <p className="chat-notice">Start a new Story to begin.</p>
        ) : isActiveChapter ? (
          <>
            {/* Anchored to the message box rather than inserted into #messages
                — as a list item it silently sat below the fold on any
                conversation long enough to need scrolling. */}
            {typingSender && (
              <div className="typing-indicator-bar">
                <span className="typing-dots" aria-hidden="true">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
                <span>{typingSender} is typing...</span>
              </div>
            )}
            <form onSubmit={handleSend}>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => handleDraftChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message as ${myCharacterName ?? username}${activeCombat ? " (combat)" : ""}`}
                rows={1}
              />
              <button type="submit" disabled={!draft.trim()}>
                Send
              </button>
            </form>

            <div className="dm-actions-row">
              <button type="button" onClick={handleAskDm} disabled={!dmCanRespond || awaitingReply}>
                {awaitingReply ? "Asking the DM..." : "Ask the DM"}
              </button>
              <button
                type="button"
                className={`ready-toggle${myReady ? " active" : ""}`}
                onClick={handleToggleReady}
              >
                <span className={`ready-dot${myReady ? " active" : ""}`} />
                <span className="ready-label">{myReady ? "Ready for DM" : "Mark Ready"}</span>
              </button>
            </div>
          </>
        ) : (
          <p className="chat-notice">This chapter is locked — view only.</p>
        )}
      </div>
    </section>
  );
}
