import { useAppSession } from "@roleplayer/core/useAppSession.js";
import LoginScreen from "@roleplayer/ui/LoginScreen.jsx";
import LeftPanel from "@roleplayer/ui/LeftPanel.jsx";
import NewStoryModal from "@roleplayer/ui/NewStoryModal.jsx";
import ChatView from "@roleplayer/ui/ChatView.jsx";
import RightPanel from "./RightPanel";
import "./App.css";

const CLASSES = [
  "Barbarian",
  "Bard",
  "Cleric",
  "Druid",
  "Fighter",
  "Monk",
  "Paladin",
  "Ranger",
  "Rogue",
  "Sorcerer",
  "Warlock",
  "Wizard",
];

function Laria5eNewStoryModal(props) {
  return (
    <NewStoryModal
      {...props}
      detailField="playerClass"
      detailLabel="Class"
      detailLabelPlural="classes"
      detailOptions={CLASSES}
    />
  );
}

function App() {
  const {
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
  } = useAppSession();

  if (checkingSession) {
    return null;
  }

  if (!session) {
    return <LoginScreen onLogin={setSession} />;
  }

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
        header={
          <div className="wordmark">
            <div className="wordmark-title">LARIA</div>
            <div className="wordmark-subtitle">RP</div>
          </div>
        }
        NewStoryModal={Laria5eNewStoryModal}
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
        myAc={selectedConversation?.characterAc?.[session.username]}
        onAcSaved={refreshConversations}
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
