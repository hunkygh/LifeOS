import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import BottomPillDock, { type DockMode } from "./BottomPillDock";
import PillInput from "./PillInput";
import ChatView, { ChatViewUI } from "./ChatView";
import SettingsView from "./SettingsView";
import ReceiptsView from "./ReceiptsView";

const LifeOSShell = () => {
  const [mode, setMode] = useState<DockMode>("chat");
  const { messages, addMessage, scrollRef } = ChatView();

  const handleSend = (value: string) => {
    addMessage(value);
  };

  const composer = (
    <PillInput
      placeholder="Message LifeOS..."
      onSubmit={handleSend}
      onVoiceStart={() => console.log("Voice start")}
      onVoiceStop={() => console.log("Voice stop")}
    />
  );

  return (
    <div className="flex flex-col h-dvh bg-background overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-center px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-foreground" />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            LifeOS
          </span>
        </div>
      </header>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="flex flex-col flex-1 min-h-0"
        >
          {mode === "chat" && <ChatViewUI messages={messages} scrollRef={scrollRef} />}
          {mode === "settings" && <SettingsView />}
          {mode === "receipts" && <ReceiptsView />}
        </motion.div>
      </AnimatePresence>

      {/* Bottom Dock */}
      <BottomPillDock mode={mode} onModeChange={setMode} composer={composer} />
    </div>
  );
};

export default LifeOSShell;
