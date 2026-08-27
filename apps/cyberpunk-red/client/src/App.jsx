import { useCallback, useEffect, useState } from "react";
import { me } from "@roleplayer/core/api/auth.js";
import { listConversations } from "./api/conversations";
import { groupConversations } from "@roleplayer/core/groupConversations.js";
import LoginScreen from "@roleplayer/ui/LoginScreen.jsx";
import LeftPanel from "@roleplayer/ui/LeftPanel.jsx";
import NewStoryModal from "@roleplayer/ui/NewStoryModal.jsx";
import ChatView from "@roleplayer/ui/ChatView.jsx";
import RightPanel from "./RightPanel";
import "./App.css";

const ROLES = [
  "Rockerboy",
  "Solo",
  "Netrunner",
  "Tech",
  "Medtech",
  "Media",
  "Exec",
  "Lawman",
  "Fixer",
  "Nomad",
];

function CyberpunkNewStoryModal(props) {
  return (
    <NewStoryModal
      {...props}
      detailField="role"
      detailLabel="Role"
      detailLabelPlural="roles"
      detailOptions={ROLES}
    />
  );
}

function App() {
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

  if (checkingSession) {
    return null;
  }

  if (!session) {
    return <LoginScreen onLogin={setSession} />;
  }

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
  const otherUsername = Object.keys(selectedConversation?.characterNames ?? {}).find((u) => u !== session.username);
  // A chapter is only "active" (mutable) while no later chapter in the same
  // story exists yet — mirrors the server's own assertActiveChapter check.
  // Always true for a conversation with no storyId (regular conversations,
  // and any Main Story not yet part of a story).
  const isActiveChapter =
    !selectedConversation?.storyId ||
    !conversations.some(
      (c) => c.storyId === selectedConversation.storyId && new Date(c.createdAt) > new Date(selectedConversation.createdAt),
    );

  return (
    <div id="layout">
      <LeftPanel
        conversations={conversations}
        selectedConversationId={selectedConversationId}
        onSelect={setSelectedConversationId}
        onConversationCreated={handleConversationCreated}
        isAdmin={session.isAdmin}
        onRenamed={refreshConversations}
        onDeleted={handleConversationDeleted}
        header={<img src="/cyberpunk-red-logo.png" alt="Cyberpunk Red" id="sidebar-logo" />}
        NewStoryModal={CyberpunkNewStoryModal}
      />
      <ChatView
        username={session.username}
        isAdmin={session.isAdmin}
        conversationId={selectedConversationId}
        myCharacterName={selectedConversation?.characterNames?.[session.username]}
        isActiveChapter={isActiveChapter}
        onActivity={refreshConversations}
        myReady={selectedConversation?.characterReady?.[session.username]}
      />
      <RightPanel
        conversationId={selectedConversationId}
        myCharacterName={selectedConversation?.characterNames?.[session.username]}
        myCharacterDetails={selectedConversation?.characterDetails?.[session.username]}
        myAvatarUrl={selectedConversation?.avatarImages?.[session.username]}
        onAvatarUploaded={refreshConversations}
        myHp={selectedConversation?.characterHp?.[session.username]}
        onHpSaved={refreshConversations}
        mySp={selectedConversation?.characterSp?.[session.username]}
        onSpSaved={refreshConversations}
        myDescription={selectedConversation?.characterDescriptions?.[session.username]}
        onDescriptionSaved={refreshConversations}
        myGear={selectedConversation?.characterGear?.[session.username]}
        onGearSaved={refreshConversations}
        partyCharacterName={otherUsername && selectedConversation?.characterNames?.[otherUsername]}
        partyCharacterDetails={otherUsername && selectedConversation?.characterDetails?.[otherUsername]}
        partyAvatarUrl={otherUsername && selectedConversation?.avatarImages?.[otherUsername]}
        partyDescription={otherUsername && selectedConversation?.characterDescriptions?.[otherUsername]}
        partyGear={otherUsername && selectedConversation?.characterGear?.[otherUsername]}
        partyHp={otherUsername && selectedConversation?.characterHp?.[otherUsername]}
        partyReady={otherUsername && selectedConversation?.characterReady?.[otherUsername]}
      />
    </div>
  );
}

export default App;
