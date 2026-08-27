import { useCallback, useEffect, useState } from "react";
import { me } from "./api/auth.js";
import { listConversations } from "./api/conversations.js";
import { groupConversations } from "./groupConversations.js";

// Shared session/conversation state behind both apps' App.jsx: session
// loading, the conversation list, auto-selecting the most-recently-active
// story's latest chapter on load, and the otherUsername/isActiveChapter
// derivations several components need. Deliberately returns raw data rather
// than rendering anything - each app's own App.jsx still owns its JSX
// composition (header, NewStoryModal wrapper, RightPanel's game-specific
// props), since that's where the two apps genuinely diverge.
export function useAppSession() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);

  useEffect(() => {
    me()
      .then((result) => setSession(result))
      .finally(() => setCheckingSession(false));
  }, []);

  const refreshConversations = useCallback(async () => {
    setConversations(await listConversations());
  }, []);

  useEffect(() => {
    if (session) refreshConversations();
  }, [session, refreshConversations]);

  // Only Stories can be created going forward, so "nothing selected" should
  // be a transient loading state, not a real one a player lands on. Default
  // to the active chapter of whichever story is closest to the top of the
  // sidebar's own sort order (most recent activity) — same grouping LeftPanel
  // itself renders, so "top of the list" means the same thing in both
  // places. Does nothing once something is selected, and nothing if there's
  // no story yet (a fresh install with none created).
  useEffect(() => {
    if (selectedConversationId || conversations.length === 0) return;
    const topStory = groupConversations(conversations).find((item) => item.type === "story");
    if (!topStory) return;
    const activeChapter = topStory.chapters[topStory.chapters.length - 1];
    setSelectedConversationId(activeChapter.id);
  }, [conversations, selectedConversationId]);

  function handleConversationCreated(id) {
    setSelectedConversationId(id);
    refreshConversations();
  }

  function handleConversationDeleted(deletedId) {
    if (deletedId === selectedConversationId) {
      setSelectedConversationId(null);
    }
    refreshConversations();
  }

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);
  // The other player's username — derived from characterNames' own keys
  // rather than a separate roster fetch, since it's already right there on
  // whatever conversation is selected (always exactly one other user).
  const otherUsername = Object.keys(selectedConversation?.characterNames ?? {}).find((u) => u !== session?.username);
  // A chapter is only "active" (mutable) while no later chapter in the same
  // story exists yet — mirrors the server's own assertActiveChapter check.
  // Always true for a conversation with no storyId (regular conversations,
  // and any Story not yet part of a story).
  const isActiveChapter =
    !selectedConversation?.storyId ||
    !conversations.some(
      (c) => c.storyId === selectedConversation.storyId && new Date(c.createdAt) > new Date(selectedConversation.createdAt),
    );

  return {
    session,
    setSession,
    checkingSession,
    conversations,
    selectedConversationId,
    setSelectedConversationId,
    refreshConversations,
    handleConversationCreated,
    handleConversationDeleted,
    selectedConversation,
    otherUsername,
    isActiveChapter,
  };
}
