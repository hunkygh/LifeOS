import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import ChatView, { ChatViewUI, type ReceiptSummary } from "./ChatView";
import ChatDock, { type DockMode } from "./ChatDock";
import HierarchicalSlideOutPanel from "./HierarchicalSlideOutPanel";
import DocumentSyncView from "./DocumentSyncView";
import { SANDBOX_SAFE_MODE } from "../config/sandboxFlags";

const LifeOSShell = () => {
  const [mode, setMode] = useState<DockMode>("chat");
  const [slideOutOpen, setSlideOutOpen] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptSummary | null>(null);
  const [documentSyncOpen, setDocumentSyncOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardInsetPx, setKeyboardInsetPx] = useState(0);
  const [visualViewportTopPx, setVisualViewportTopPx] = useState(0);
  const keyboardFocusFallback = useRef(false);
  const keyboardMeasureTimer = useRef<number | null>(null);
  const { messages, addMessage, addAssistantMessage, submitInlineAction, scrollRef, isLoading } = ChatView(keyboardOpen);

  useEffect(() => {
    const isMobile = () => window.innerWidth < 768;
    const computeFromViewport = () => {
      if (!isMobile()) {
        setKeyboardOpen(false);
        setKeyboardInsetPx(0);
        setVisualViewportTopPx(0);
        return;
      }

      const vv = window.visualViewport;
      if (!vv) {
        setKeyboardOpen(keyboardFocusFallback.current);
        setKeyboardInsetPx(0);
        setVisualViewportTopPx(0);
        return;
      }

      const rawInset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      const inset = rawInset < 4 ? 0 : rawInset;
      const vvTop = Math.max(0, vv.offsetTop || 0);
      const open = inset > 80 || (keyboardFocusFallback.current && inset > 20);
      setKeyboardInsetPx(inset);
      setVisualViewportTopPx(vvTop < 2 ? 0 : vvTop);
      setKeyboardOpen(open);
    };

    const scheduleMeasure = () => {
      if (keyboardMeasureTimer.current) {
        window.clearTimeout(keyboardMeasureTimer.current);
      }
      keyboardMeasureTimer.current = window.setTimeout(computeFromViewport, 40);
    };

    computeFromViewport();
    window.addEventListener("resize", scheduleMeasure);
    window.visualViewport?.addEventListener("resize", scheduleMeasure);
    window.visualViewport?.addEventListener("scroll", scheduleMeasure);

    return () => {
      window.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("scroll", scheduleMeasure);
      if (keyboardMeasureTimer.current) {
        window.clearTimeout(keyboardMeasureTimer.current);
      }
    };
  }, []);

  const handleInputFocusChange = (open: boolean) => {
    keyboardFocusFallback.current = open;
    if (open) {
      window.scrollTo(0, 0);
      requestAnimationFrame(() => window.scrollTo(0, 0));
      setTimeout(() => window.scrollTo(0, 0), 50);
      setTimeout(() => window.scrollTo(0, 0), 150);
    }
    if (!window.visualViewport) {
      setKeyboardOpen(open);
      setKeyboardInsetPx(0);
      setVisualViewportTopPx(0);
      return;
    }

    if (keyboardMeasureTimer.current) {
      window.clearTimeout(keyboardMeasureTimer.current);
    }
    keyboardMeasureTimer.current = window.setTimeout(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      const rawInset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      const inset = rawInset < 4 ? 0 : rawInset;
      const vvTop = Math.max(0, vv.offsetTop || 0);
      setKeyboardInsetPx(inset);
      setVisualViewportTopPx(vvTop < 2 ? 0 : vvTop);
      setKeyboardOpen(open || inset > 80);
    }, 40);
  };

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
    if (SANDBOX_SAFE_MODE && (newMode === "settings" || newMode === "document_sync")) {
      addAssistantMessage(
        "Sandbox mode is active, so sync and workspace configuration are temporarily disabled."
      );
      setMode("chat");
      setSlideOutOpen(null);
      setDocumentSyncOpen(false);
      return;
    }

    setMode(newMode);
    if (newMode === "document_sync") {
      setSlideOutOpen(null);
      addAssistantMessage("Thinking through workspace-level Docs that need sorting…");
      setDocumentSyncOpen(true);
      return;
    }
    if (newMode !== "chat") {
      setSlideOutOpen(newMode);
      setDocumentSyncOpen(false);
    } else {
      setSlideOutOpen(null);
      setDocumentSyncOpen(false);
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
  const openReceipt = (summary: ReceiptSummary) => {
    setSelectedReceipt(summary);
    setSlideOutOpen("artifacts");
  };

  try {
    if (!messages || typeof isLoading !== "boolean") {
      return <div>Loading LifeOS...</div>;
    }

    return (
      <div
        className="flex flex-col min-h-[100dvh] h-[100dvh] bg-background"
        data-keyboard-open={keyboardOpen ? "true" : "false"}
      >
        <div
          className="fixed right-3 z-30 md:hidden"
          style={{ top: `calc(env(safe-area-inset-top) + 0.75rem + ${visualViewportTopPx}px)` }}
        >
          <div className="relative">
            <button
              className="rounded-full w-10 h-10 glass-panel soft-lift flex items-center justify-center"
              aria-label="Open quick actions"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
            >
              <Menu className="w-4 h-4 text-foreground" />
            </button>
            {mobileMenuOpen && (
              <div className="absolute right-0 mt-2 w-44 rounded-2xl border border-white/70 bg-white/95 p-2 shadow-[0_12px_30px_rgba(15,15,15,0.18)]">
                <button
                  type="button"
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleModeChange("settings");
                  }}
                  disabled={SANDBOX_SAFE_MODE}
                >
                  Settings
                </button>
                <button
                  type="button"
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleModeChange("artifacts");
                  }}
                >
                  Artifacts
                </button>
                <button
                  type="button"
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleModeChange("document_sync");
                  }}
                  disabled={SANDBOX_SAFE_MODE}
                >
                  Document Sync
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Content - Chat area with proper height constraints */}
        <div className="relative z-10 flex flex-col flex-1 min-h-0 overflow-hidden">
          <ChatViewUI
            messages={messages}
            scrollRef={scrollRef}
            isLoading={isLoading}
            keyboardOpen={keyboardOpen}
            visualViewportTopPx={visualViewportTopPx}
            onOpenSettings={openSettings}
            onOpenArtifacts={openArtifacts}
            onOpenReceipt={openReceipt}
            onInlineActionSubmit={submitInlineAction}
          />
        </div>

        {/* Chat Dock - Fixed at bottom */}
        <div className="flex-shrink-0">
          <ChatDock
            mode={mode}
            onModeChange={handleModeChange}
            onSendMessage={handleSend}
            onVoiceMessage={handleVoiceMessage}
            isLoading={isLoading}
            keyboardOpen={keyboardOpen}
            keyboardInsetPx={keyboardInsetPx}
            onInputFocusChange={handleInputFocusChange}
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
          isOpen={slideOutOpen === "artifacts"}
          onClose={closeSlideOut}
          type="artifacts"
          position="right"
          artifactReceipt={selectedReceipt}
        />
        <DocumentSyncView
          isOpen={documentSyncOpen}
          onStatusMessage={(message) => addAssistantMessage(message)}
          onClose={() => {
            setDocumentSyncOpen(false);
            setMode("chat");
          }}
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
