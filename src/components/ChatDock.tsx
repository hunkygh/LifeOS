import { useState } from "react";
import { Settings, Send, Mic, Archive, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "./ui/button";

export type DockMode = "chat" | "settings" | "artifacts" | "document_sync";

interface ChatDockProps {
  mode: DockMode;
  onModeChange: (mode: DockMode) => void;
  onSendMessage: (message: string) => void;
  onVoiceMessage?: (audioBlob: Blob) => void;
  isLoading?: boolean;
}

const ChatDock = ({ mode, onModeChange, onSendMessage, onVoiceMessage, isLoading }: ChatDockProps) => {
  const [inputValue, setInputValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [transcription, setTranscription] = useState("");

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
    <div className="fixed bottom-3 md:bottom-8 inset-x-0 z-50 safe-bottom">
      <div className="px-2 md:px-4">
        <div className="flex items-center gap-2 md:gap-4 max-w-3xl mx-auto">
          {/* Settings Coin */}
          <button
            onClick={() => onModeChange("settings")}
            className={`flex-shrink-0 rounded-full w-10 h-10 md:w-12 md:h-12 glass-panel soft-lift flex items-center justify-center transition-transform hover:scale-105 ${
              mode === "settings" ? "iridescent-glow" : ""
            }`}
          >
            <Settings className="w-4 h-4 md:w-5 md:h-5 text-foreground" />
          </button>

          {/* Floating Input Pill with Voice and Send Buttons */}
          <div className="flex-1 relative">
            <div className="glass-panel soft-lift rounded-full px-3 md:px-6 py-2.5 md:py-4 flex items-center gap-2 md:gap-3 border-white/40">
              {/* Voice Mode Button */}
              <button
                onClick={toggleRecording}
                className={`flex-shrink-0 rounded-full w-7 h-7 md:w-8 md:h-8 glass-panel soft-lift flex items-center justify-center transition-transform hover:scale-105 relative ${
                  isRecording ? "animate-pulse" : ""
                }`}
                style={{
                  boxShadow: isRecording 
                    ? 'inset 0 0 15px rgba(59, 130, 246, 0.3), inset 0 0 25px rgba(236, 72, 153, 0.2)'
                    : ''
                }}
              >
                <Mic className={`w-3.5 h-3.5 md:w-4 md:h-4 text-foreground ${isRecording ? "text-red-500" : ""}`} />
              </button>

              {/* Input Field */}
              <input
                type="text"
                value={transcription || inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (!transcription) {
                    setTranscription("");
                  }
                }}
                onKeyPress={handleKeyPress}
                placeholder="Message LifeOS..."
                disabled={isLoading}
                className="flex-1 bg-transparent focus:outline-none text-sm placeholder:text-muted-foreground min-w-0"
              />
              
              {/* Send Button */}
              <button
                onClick={handleSend}
                disabled={!(transcription || inputValue).trim() || isLoading}
                className="flex-shrink-0 rounded-full w-7 h-7 md:w-8 md:h-8 glass-panel soft-lift flex items-center justify-center transition-transform hover:scale-105 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5 md:w-4 md:h-4 text-foreground" />
              </button>
            </div>
          </div>

          {/* Artifacts Coin */}
          <button
            onClick={() => onModeChange("artifacts")}
            className={`flex-shrink-0 rounded-full w-10 h-10 md:w-12 md:h-12 glass-panel soft-lift flex items-center justify-center transition-transform hover:scale-105 ${
              mode === "artifacts" ? "iridescent-glow" : ""
            }`}
          >
            <Archive className="w-4 h-4 md:w-5 md:h-5 text-foreground" />
          </button>

          {/* Document Sync Coin */}
          <button
            onClick={() => onModeChange("document_sync")}
            className={`flex-shrink-0 rounded-full w-10 h-10 md:w-12 md:h-12 glass-panel soft-lift flex items-center justify-center transition-transform hover:scale-105 ${
              mode === "document_sync" ? "iridescent-glow" : ""
            }`}
          >
            <RefreshCw className="w-4 h-4 md:w-5 md:h-5 text-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatDock;
