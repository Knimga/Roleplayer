import { useEffect, useState } from "react";
import { renameConversation, deleteConversation } from "./api/conversations";
import { renameStory } from "./api/stories";
import NewStoryModal from "./NewStoryModal";
import NewChapterModal from "./NewChapterModal";
import SettingsModal from "./SettingsModal";

// Groups the flat conversation list into story sections (storyId set) and
// standalone conversations (storyId null), then sorts both kinds together
// by "recent activity" — a story's effective timestamp is its active
// (latest) chapter's lastMessageAt, since only that chapter can ever change.
function groupConversations(conversations) {
  const storiesById = new Map();
  const standalone = [];

  for (const c of conversations) {
    if (!c.storyId) {
      standalone.push(c);
      continue;
    }
    if (!storiesById.has(c.storyId)) {
      storiesById.set(c.storyId, { storyId: c.storyId, storyName: c.storyName, chapters: [] });
    }
    storiesById.get(c.storyId).chapters.push(c);
  }

  const storyItems = Array.from(storiesById.values()).map((story) => {
    const chapters = [...story.chapters].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const lastMessageAt = chapters.reduce(
      (max, c) => (new Date(c.lastMessageAt) > max ? new Date(c.lastMessageAt) : max),
      new Date(0),
    );
    return { type: "story", storyId: story.storyId, storyName: story.storyName, chapters, lastMessageAt };
  });

  const standaloneItems = standalone.map((c) => ({ type: "conversation", conversation: c, lastMessageAt: new Date(c.lastMessageAt) }));

  return [...storyItems, ...standaloneItems].sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

export default function Sidebar({
  conversations,
  selectedConversationId,
  onSelect,
  onNewConvo,
  onConversationCreated,
  isAdmin,
  onRenamed,
  onDeleted,
}) {
  const [openMenuId, setOpenMenuId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renamingIsStory, setRenamingIsStory] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [newChapterFor, setNewChapterFor] = useState(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  useEffect(() => {
    if (openMenuId === null) return;
    const close = () => setOpenMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenuId]);

  function startRename(id, currentName, isStory) {
    setOpenMenuId(null);
    setRenamingId(id);
    setRenamingIsStory(isStory);
    setRenameDraft(currentName);
  }

  async function commitRename(id, isStory) {
    const name = renameDraft.trim();
    setRenamingId(null);
    if (!name) return;
    if (isStory) {
      await renameStory(id, name);
    } else {
      await renameConversation(id, name);
    }
    onRenamed();
  }

  async function handleDelete(conversation, label) {
    setOpenMenuId(null);
    if (!window.confirm(`Delete "${label}"? This can't be undone.`)) return;
    await deleteConversation(conversation.id);
    onDeleted(conversation.id);
  }

  const items = groupConversations(conversations);

  return (
    <nav id="sidebar">
      <img src="/cyberpunk-red-logo.png" alt="Cyberpunk Red" id="sidebar-logo" />
      <button type="button" id="new-story" onClick={() => setShowStoryModal(true)}>
        + New Story
      </button>
      <button type="button" id="new-convo" onClick={onNewConvo}>
        + New Convo
      </button>
      <ul>
        {items.map((item) => {
          if (item.type === "conversation") {
            const c = item.conversation;
            return (
              <li key={c.id} className={c.id === selectedConversationId ? "selected" : ""}>
                {renamingId === c.id && !renamingIsStory ? (
                  <input
                    className="rename-input"
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => commitRename(c.id, false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(c.id, false);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                  />
                ) : (
                  <button type="button" className="conversation-name" onClick={() => onSelect(c.id)}>
                    {/* c.isMainStory is the API's field name (backend still says "Main Story") — UI-facing term is "Story" */}
                    {c.isMainStory && <span className="story-icon">📖</span>}
                    {c.name}
                  </button>
                )}

                <div className="conversation-menu" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="ellipsis"
                    onClick={() => setOpenMenuId((current) => (current === c.id ? null : c.id))}
                    aria-label="Conversation options"
                  >
                    &#8942;
                  </button>
                  {openMenuId === c.id && (
                    <div className="menu-popover">
                      <button type="button" onClick={() => startRename(c.id, c.name, false)}>
                        Rename
                      </button>
                      {isAdmin && (
                        <button type="button" onClick={() => handleDelete(c, c.name)}>
                          Delete Convo
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          }

          const activeChapter = item.chapters[item.chapters.length - 1];
          const storyMenuKey = `story-${item.storyId}`;

          return (
            <li key={storyMenuKey} className="story-section">
              <div className="story-header">
                {renamingId === item.storyId && renamingIsStory ? (
                  <input
                    className="rename-input"
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => commitRename(item.storyId, true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(item.storyId, true);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                  />
                ) : (
                  <button type="button" className="story-name" onClick={() => onSelect(activeChapter.id)}>
                    <span className="story-icon">📖</span>
                    {item.storyName}
                  </button>
                )}

                <div className="conversation-menu" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="ellipsis"
                    onClick={() => setOpenMenuId((current) => (current === storyMenuKey ? null : storyMenuKey))}
                    aria-label="Story options"
                  >
                    &#8942;
                  </button>
                  {openMenuId === storyMenuKey && (
                    <div className="menu-popover">
                      <button type="button" onClick={() => startRename(item.storyId, item.storyName, true)}>
                        Rename
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            setNewChapterFor(activeChapter.id);
                          }}
                        >
                          + New Chapter
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <ul className="chapter-list">
                {item.chapters.map((c) => {
                  const isActiveChapter = c.id === activeChapter.id;
                  return (
                    <li key={c.id} className={"chapter-row" + (c.id === selectedConversationId ? " selected" : "")}>
                      <button type="button" className="conversation-name" onClick={() => onSelect(c.id)}>
                        {c.name}
                      </button>

                      {isActiveChapter && isAdmin && (
                        <div className="conversation-menu" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="ellipsis"
                            onClick={() => setOpenMenuId((current) => (current === c.id ? null : c.id))}
                            aria-label="Chapter options"
                          >
                            &#8942;
                          </button>
                          {openMenuId === c.id && (
                            <div className="menu-popover">
                              <button type="button" onClick={() => handleDelete(c, `${item.storyName} — ${c.name}`)}>
                                Delete Chapter
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>

      {isAdmin && (
        <button type="button" id="settings-row" onClick={() => setShowSettingsModal(true)}>
          ⚙️ Settings
        </button>
      )}
      {showSettingsModal && <SettingsModal onClose={() => setShowSettingsModal(false)} />}

      {showStoryModal && (
        <NewStoryModal
          onCancel={() => setShowStoryModal(false)}
          onCreated={(id) => {
            setShowStoryModal(false);
            onConversationCreated(id);
          }}
        />
      )}

      {newChapterFor && (
        <NewChapterModal
          conversationId={newChapterFor}
          onCancel={() => setNewChapterFor(null)}
          onCreated={(id) => {
            setNewChapterFor(null);
            onConversationCreated(id);
          }}
        />
      )}
    </nav>
  );
}
