import { useState, useRef, useCallback } from "react";
import { Send, Mic, MicOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PillInputProps {
  placeholder?: string;
  onSubmit: (value: string) => void;
  onVoiceStart?: () => void;
  onVoiceStop?: () => void;
  isRecording?: boolean;
  transcription?: string;
  disabled?: boolean;
}

const PillInput = ({
  placeholder = "Message LifeOS...",
  onSubmit,
  onVoiceStart,
  onVoiceStop,
  isRecording = false,
  transcription,
  disabled = false,
}: PillInputProps) => {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const displayValue = transcription || value;

  const handleSubmit = useCallback(() => {
    const trimmed = displayValue.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
  }, [displayValue, onSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const toggleVoice = () => {
    if (isRecording) {
      onVoiceStop?.();
    } else {
      onVoiceStart?.();
    }
  };

  return (
    <div className="relative flex items-center w-full gap-2">
      <div className="flex-1 flex items-center bg-secondary pill px-4 py-3 transition-all focus-within:ring-2 focus-within:ring-ring/20">
        <input
          ref={inputRef}
          type="text"
          value={transcription ?? value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isRecording}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          aria-label="Message input"
        />

        <div className="flex items-center gap-1 ml-2">
          {onVoiceStart && (
            <button
              type="button"
              onClick={toggleVoice}
              className="relative p-2 rounded-full transition-colors hover:bg-accent"
              aria-label={isRecording ? "Stop recording" : "Start recording"}
            >
              <AnimatePresence mode="wait">
                {isRecording ? (
                  <motion.div
                    key="recording"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.8 }}
                  >
                    <MicOff className="w-4 h-4 text-destructive" />
                    <span className="absolute inset-0 rounded-full border-2 border-destructive/40 animate-pulse-ring" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.8 }}
                  >
                    <Mic className="w-4 h-4 text-muted-foreground" />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!displayValue.trim() || disabled}
            className="p-2 rounded-full bg-primary text-primary-foreground transition-all hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PillInput;
