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
}) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState(null);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
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
    setAwaitingReply(false);
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
      const history = await getMessages(conversationId);
      if (cancelled) return;
      setMessages(history);

      unsubscribe = subscribeToEvents(conversationId, ({ type, message, sender, senderUsername }) => {
        // "generating"/"failed" have no message row — they only toggle the
        // shared spinner, for both players, not just whoever clicked "Ask
        // the DM". Handled first and returned early so they don't fall into
        // the message-list branches below or trigger onActivity for nothing.
        if (type === "generating") {
          setAwaitingReply(true);
          return;
        }
        if (type === "failed") {
          setAwaitingReply(false);
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
        if (type === "updated") {
          setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
        } else if (type === "deleted") {
          setMessages((prev) => prev.filter((m) => m.id !== message.id));
        } else {
          setMessages((prev) => [...prev, message]);
          if (message.role === "assistant") {
            setAwaitingReply(false);
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
  }, [messages, awaitingReply]);

  // Auto-grow the textarea to fit its content; CSS max-height + overflow-y
  // takes over once it hits the cap.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const lastMessage = messages[messages.length - 1];
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
    await sendMessage(conversationId, content);
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
      await requestReply(conversationId);
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
  // this only controls UI visibility, not actual enforcement.
  function isLocked(index) {
    return messages.slice(index + 1).some((m) => m.role === "assistant");
  }

  function canModify(m, index) {
    return isActiveChapter && m.role === "user" && (isAdmin || m.authorUsername === username) && !isLocked(index);
  }

  function startEdit(m) {
    setEditingId(m.id);
    setEditDraft(m.content);
  }

  async function commitEdit(messageId) {
    const content = editDraft.trim();
    setEditingId(null);
    if (!content) return;
    try {
      await editMessage(conversationId, messageId, content);
    } catch (err) {
      setNotice(err.message);
    }
  }

  function handleEditKeyDown(e, messageId) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitEdit(messageId);
    }
    if (e.key === "Escape") {
      setEditingId(null);
    }
  }

  async function handleDeleteMessage(m) {
    if (!window.confirm("Delete this message? This can't be undone.")) return;
    try {
      await deleteMessage(conversationId, m.id);
    } catch (err) {
      setNotice(err.message);
    }
  }

  return (
    <section id="chat">
      <div className="chat-inner">
        <ul id="messages">
          {messages.map((m, i) => (
            <li key={m.id} className={m.sender === "Story So Far" ? `${m.role} recap` : m.role}>
              <span className="sender">{m.sender}</span>
              {editingId === m.id ? (
                <textarea
                  className="edit-textarea"
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onBlur={() => commitEdit(m.id)}
                  onKeyDown={(e) => handleEditKeyDown(e, m.id)}
                />
              ) : (
                <div className="bubble">
                  {m.role === "assistant" && m.sender !== "Story So Far" && liveMessageIds.has(m.id) ? (
                    <AnimatedGMReply text={m.content} />
                  ) : (
                    formatContent(m.content)
                  )}
                  {m.edited && <span className="edited-label">(edited)</span>}
                </div>
              )}
              {canModify(m, i) && editingId !== m.id && (
                <div className="message-actions">
                  <button type="button" onClick={() => startEdit(m)} aria-label="Edit message">
                    ✎
                  </button>
                  <button type="button" onClick={() => handleDeleteMessage(m)} aria-label="Delete message">
                    🗑
                  </button>
                </div>
              )}
            </li>
          ))}
          {awaitingReply && (
            <li className="pending">
              <span className="spinner" aria-label="Waiting for the DM" />
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
                placeholder={`Message as ${myCharacterName ?? username}`}
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
