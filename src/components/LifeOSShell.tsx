import { useState } from "react";
import ChatView, { ChatViewUI } from "./ChatView";
import ReceiptsView from "./ReceiptsView";
import ChatDock, { type DockMode } from "./ChatDock";
import HierarchicalSlideOutPanel from "./HierarchicalSlideOutPanel";

const LifeOSShell = () => {
  const [mode, setMode] = useState<DockMode>("chat");
  const [slideOutOpen, setSlideOutOpen] = useState<string | null>(null);
  const { messages, addMessage, scrollRef, isLoading } = ChatView();

  const handleSend = (value: string) => {
    addMessage(value);
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

  return (
    <div className="flex flex-col h-dvh bg-background overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-foreground" />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            LifeOS
          </span>
        </div>
      </header>

      {/* Content - Always visible chat */}
      <div className="flex flex-col flex-1 min-h-0">
        <ChatViewUI messages={messages} scrollRef={scrollRef} isLoading={isLoading} onOpenSettings={openSettings} />
      </div>

      {/* Chat Dock - Only show on mobile */}
      <div className="md:hidden">
        <ChatDock 
          mode={mode} 
          onModeChange={handleModeChange}
          onSendMessage={handleSend}
          isLoading={isLoading}
        />
      </div>
      
      {/* Desktop Chat Dock - Fixed at bottom */}
      <div className="hidden md:block">
        <ChatDock 
          mode={mode} 
          onModeChange={handleModeChange}
          onSendMessage={handleSend}
          isLoading={isLoading}
        />
      </div>

      {/* Slide-out Panels */}
      <HierarchicalSlideOutPanel
        isOpen={slideOutOpen === "settings"}
        onClose={closeSlideOut}
        type="settings"
        position="left"
      />
      <HierarchicalSlideOutPanel
        isOpen={slideOutOpen === "receipts"}
        onClose={closeSlideOut}
        type="receipts"
        position="right"
      />
    </div>
  );
};

export default LifeOSShell;
