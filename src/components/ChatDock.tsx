import { useEffect, useState } from "react";
import { Settings, Send, Mic, Archive, RefreshCw } from "lucide-react";
import { SANDBOX_SAFE_MODE } from "../config/sandboxFlags";

export type DockMode = "chat" | "settings" | "artifacts" | "document_sync";

interface ChatDockProps {
  mode: DockMode;
  onModeChange: (mode: DockMode) => void;
  onSendMessage: (message: string) => void;
  onVoiceMessage?: (audioBlob: Blob) => void;
  isLoading?: boolean;
  keyboardOpen?: boolean;
  keyboardInsetPx?: number;
  onInputFocusChange?: (open: boolean) => void;
}

const ChatDock = ({
  mode,
  onModeChange,
  onSendMessage,
  onVoiceMessage,
  isLoading,
  keyboardOpen = false,
  keyboardInsetPx = 0,
  onInputFocusChange,
}: ChatDockProps) => {
  const [inputValue, setInputValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [transcription, setTranscription] = useState("");
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    // Prevent accidental keyboard restore on reload.
    const active = document.activeElement as HTMLElement | null;
    if (!active) return;
    const tag = active.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || active.isContentEditable) {
      setTimeout(() => active.blur(), 0);
    }
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleSend = () => {
    const messageToSend = transcription || inputValue;
    if (messageToSend.trim() && !isLoading) {
      onSendMessage(messageToSend.trim());
      setInputValue("");
      setTranscription("");
      // Switch to chat mode when sending a message
      if (mode !== "chat") {
        onModeChange("chat");
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        onVoiceMessage?.(audioBlob);
        stream.getTracks().forEach(track => track.stop());
        
        // For now, simulate transcription (you can replace with real transcription later)
        setTimeout(() => {
          setTranscription("Simulated voice transcription ready to send");
        }, 1000);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setMediaRecorder(null);
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div
      className="fixed inset-x-0 z-50"
      style={{
        bottom: isMobile
          ? keyboardOpen
            ? `${Math.max(0, keyboardInsetPx)}px`
            : "calc(env(safe-area-inset-bottom, 0px) + 20px)"
          : "20px",
      }}
    >
      <div className="px-0 md:px-4">
        <div className={`${isMobile ? "w-[calc(100%-1.5rem)] mx-auto" : "max-w-3xl mx-auto"} flex items-center ${isMobile ? "" : "gap-4"}`}>
          {!isMobile && (
            <button
              onClick={() => onModeChange("settings")}
              className={`flex-shrink-0 rounded-full w-10 h-10 md:w-12 md:h-12 glass-panel soft-lift flex items-center justify-center transition-transform hover:scale-105 ${
                mode === "settings" ? "iridescent-glow" : ""
              }`}
              disabled={SANDBOX_SAFE_MODE}
            >
              <Settings className="w-4 h-4 md:w-5 md:h-5 text-foreground" />
            </button>
          )}

          <div className="flex-1 relative">
            <div className={`glass-panel soft-lift rounded-full ${isMobile ? "px-3 py-2.5" : "px-3 md:px-6 py-2.5 md:py-4"} flex items-center gap-2 md:gap-3 border-white/40`}>
              <button
                onClick={toggleRecording}
                className={`flex-shrink-0 rounded-full ${isMobile ? "w-7 h-7" : "w-7 h-7 md:w-8 md:h-8"} glass-panel soft-lift flex items-center justify-center transition-transform hover:scale-105 relative ${
                  isRecording ? "animate-pulse" : ""
                }`}
                style={{
                  boxShadow: isRecording
                    ? "inset 0 0 15px rgba(59, 130, 246, 0.3), inset 0 0 25px rgba(236, 72, 153, 0.2)"
                    : "",
                }}
              >
                <Mic className={`w-3.5 h-3.5 text-foreground ${isRecording ? "text-red-500" : ""}`} />
              </button>

              <input
                type="text"
                value={transcription || inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (!transcription) {
                    setTranscription("");
                  }
                }}
                onFocus={() => onInputFocusChange?.(true)}
                onBlur={() => onInputFocusChange?.(false)}
                onKeyPress={handleKeyPress}
                placeholder="Message LifeOS..."
                disabled={isLoading}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="sentences"
                inputMode="text"
                enterKeyHint="send"
                className={`flex-1 bg-transparent focus:outline-none text-[16px] ${isMobile ? "" : "md:text-sm"} placeholder:text-muted-foreground min-w-0`}
              />

              <button
                onClick={handleSend}
                disabled={!(transcription || inputValue).trim() || isLoading}
                className={`flex-shrink-0 rounded-full ${isMobile ? "w-7 h-7" : "w-7 h-7 md:w-8 md:h-8"} glass-panel soft-lift flex items-center justify-center transition-transform hover:scale-105 disabled:opacity-50`}
              >
                <Send className={`text-foreground ${isMobile ? "w-3.5 h-3.5" : "w-3.5 h-3.5 md:w-4 md:h-4"}`} />
              </button>
            </div>
          </div>

          {!isMobile && (
            <>
              <button
                onClick={() => onModeChange("artifacts")}
                className={`flex-shrink-0 rounded-full w-10 h-10 md:w-12 md:h-12 glass-panel soft-lift flex items-center justify-center transition-transform hover:scale-105 ${
                  mode === "artifacts" ? "iridescent-glow" : ""
                }`}
              >
                <Archive className="w-4 h-4 md:w-5 md:h-5 text-foreground" />
              </button>
              <button
                onClick={() => onModeChange("document_sync")}
                className={`flex-shrink-0 rounded-full w-10 h-10 md:w-12 md:h-12 glass-panel soft-lift flex items-center justify-center transition-transform hover:scale-105 ${
                  mode === "document_sync" ? "iridescent-glow" : ""
                }`}
                disabled={SANDBOX_SAFE_MODE}
              >
                <RefreshCw className="w-4 h-4 md:w-5 md:h-5 text-foreground" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatDock;
