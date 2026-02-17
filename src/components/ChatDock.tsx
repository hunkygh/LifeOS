import { useState } from "react";
import { Settings, Receipt, Send } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "./ui/button";

export type DockMode = "chat" | "settings" | "receipts";

interface ChatDockProps {
  mode: DockMode;
  onModeChange: (mode: DockMode) => void;
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
}

const ChatDock = ({ mode, onModeChange, onSendMessage, isLoading }: ChatDockProps) => {
  const [inputValue, setInputValue] = useState("");

  const handleSend = () => {
    if (inputValue.trim() && !isLoading) {
      onSendMessage(inputValue.trim());
      setInputValue("");
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

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 safe-bottom">
      <div className="px-4 pb-4">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          {/* Settings Button */}
          <Button
            variant={mode === "settings" ? "default" : "ghost"}
            size="sm"
            onClick={() => onModeChange("settings")}
            className={`flex-shrink-0 transition-all duration-200 ${
              mode === "settings" 
                ? "gradient-border bg-transparent text-foreground" 
                : "hover:bg-gray-100 text-foreground"
            }`}
          >
            <Settings className="w-4 h-4" />
          </Button>

          {/* Chat Input with Gradient Border */}
          <div className="flex-1 relative">
            <div className="relative gradient-border pill">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Message LifeOS..."
                disabled={isLoading}
                className="w-full px-4 py-3 bg-background rounded-full focus:outline-none text-sm relative z-10"
              />
            </div>
          </div>

          {/* Receipts Button */}
          <Button
            variant={mode === "receipts" ? "default" : "ghost"}
            size="sm"
            onClick={() => onModeChange("receipts")}
            className={`flex-shrink-0 transition-all duration-200 ${
              mode === "receipts" 
                ? "gradient-border bg-transparent text-foreground" 
                : "hover:bg-gray-100 text-foreground"
            }`}
          >
            <Receipt className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatDock;
