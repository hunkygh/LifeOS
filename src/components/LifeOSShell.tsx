import { useState } from "react";
import ChatView, { ChatViewUI } from "./ChatView";
import ChatDock, { type DockMode } from "./ChatDock";
import HierarchicalSlideOutPanel from "./HierarchicalSlideOutPanel";
import DocumentSyncView from "./DocumentSyncView";

const LifeOSShell = () => {
  const [mode, setMode] = useState<DockMode>("chat");
  const [slideOutOpen, setSlideOutOpen] = useState<string | null>(null);
  const { messages, addMessage, submitInlineAction, scrollRef, isLoading } = ChatView();

  const handleSend = (value: string) => {
    addMessage(value);
  };

  const handleVoiceMessage = async (audioBlob: Blob) => {
    // Here we would send the audio to the edge function for transcription
    // For now, let's log it and you can implement the edge function later
    console.log('Voice message received:', audioBlob);
    
    // TODO: Send to edge function for transcription and processing
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'voice-message.webm');
      
      // This would call a new edge function endpoint for voice processing
      // const { data, error } = await supabase.functions.invoke('process-voice', {
      //   body: formData
      // });
      
      // For now, just add a placeholder message
      addMessage("🎤 Voice message sent (processing...)");
    } catch (error) {
      console.error('Error processing voice message:', error);
      addMessage("❌ Error processing voice message");
    }
  };

  const handleModeChange = (newMode: DockMode) => {
    if (newMode !== "chat") {
      setSlideOutOpen(newMode);
    } else {
      setSlideOutOpen(null);
    }
  };

  const closeSlideOut = () => {
    setSlideOutOpen(null);
  };

  const openSettings = () => {
    setSlideOutOpen("settings");
  };
  const openArtifacts = () => {
    setSlideOutOpen("artifacts");
  };

  try {
    if (!messages || typeof isLoading !== "boolean") {
      return <div>Loading LifeOS...</div>;
    }

    return (
      <div className="flex flex-col min-h-[100dvh] h-[100dvh] bg-background">
        {/* Content - Chat area with proper height constraints */}
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <ChatViewUI
            messages={messages}
            scrollRef={scrollRef}
            isLoading={isLoading}
            onOpenSettings={openSettings}
            onOpenArtifacts={openArtifacts}
            onInlineActionSubmit={submitInlineAction}
          />
        </div>

        {/* Chat Dock - Fixed at bottom */}
        <div className="flex-shrink-0">
          <div className="md:hidden">
            <ChatDock
              mode={mode}
              onModeChange={handleModeChange}
              onSendMessage={handleSend}
              onVoiceMessage={handleVoiceMessage}
              isLoading={isLoading}
            />
          </div>
          <div className="hidden md:block">
            <ChatDock
              mode={mode}
              onModeChange={handleModeChange}
              onSendMessage={handleSend}
              onVoiceMessage={handleVoiceMessage}
              isLoading={isLoading}
            />
          </div>
        </div>

        {/* Slide-out Panels */}
        <HierarchicalSlideOutPanel
          isOpen={slideOutOpen === "settings"}
          onClose={closeSlideOut}
          type="settings"
          position="left"
        />
        <HierarchicalSlideOutPanel
          isOpen={slideOutOpen === "artifacts"}
          onClose={closeSlideOut}
          type="artifacts"
          position="right"
        />
        <DocumentSyncView
          isOpen={slideOutOpen === "document_sync"}
          onSyncComplete={() => {
            // Show a chat message when sync completes
            console.log('Document sync completed');
          }}
        />
      </div>
    );
  } catch (error) {
    console.error("LifeOSShell render error", error);
    return <div>Loading LifeOS...</div>;
  }
};

export default LifeOSShell;
