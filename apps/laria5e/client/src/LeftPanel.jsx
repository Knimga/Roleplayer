import { useEffect, useState } from "react";
import { renameConversation, deleteConversation } from "./api/conversations";
import { renameStory } from "@roleplayer/core/api/stories.js";
import { groupConversations } from "@roleplayer/core/groupConversations.js";
import NewStoryModal from "./NewStoryModal";
import NewChapterModal from "./NewChapterModal";
import SettingsModal from "@roleplayer/ui/SettingsModal.jsx";

export default function LeftPanel({
  conversations,
  selectedConversationId,
  onSelect,
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
      <div className="wordmark">
        <div className="wordmark-title">LARIA</div>
        <div className="wordmark-subtitle">RP</div>
      </div>
      <button type="button" id="new-story" onClick={() => setShowStoryModal(true)}>
        + New Story
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
                    {/* Dead in practice: this branch only renders standalone (non-story)
                        conversations, so c.storyId is always null here. Left as the
                        correct check rather than removed, in case a legacy standalone
                        conversation is ever attached to a story some other way. */}
                    {c.storyId && <span className="story-icon">📖</span>}
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
