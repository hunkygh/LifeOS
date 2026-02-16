import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, User } from "lucide-react";

export interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  created_at: string;
}

const ChatView = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      content: "Hey! I'm your LifeOS assistant. I can help you manage tasks, process receipts, and stay organized. What would you like to do?",
      role: "assistant",
      created_at: new Date().toISOString(),
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const addMessage = (content: string) => {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      content,
      role: "user",
      created_at: new Date().toISOString(),
    };

    const assistantMsg: ChatMessage = {
      id: `assistant-${Date.now()}`,
      content: "I'll be able to help you with that once the backend is connected. For now, I'm a preview of what's coming!",
      role: "assistant",
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
  };

  return { messages, addMessage, scrollRef };
};

export const ChatViewUI = ({
  messages,
  scrollRef,
}: {
  messages: ChatMessage[];
  scrollRef: React.RefObject<HTMLDivElement>;
}) => {
  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 pt-6 pb-44 scrollbar-hide"
    >
      <div className="max-w-2xl mx-auto space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center mt-1">
                  <Bot className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
              )}

              <div
                className={`max-w-[80%] px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground pill"
                    : "bg-secondary text-secondary-foreground rounded-2xl rounded-tl-md"
                }`}
              >
                {msg.content}
              </div>

              {msg.role === "user" && (
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-secondary flex items-center justify-center mt-1">
                  <User className="w-3.5 h-3.5 text-secondary-foreground" />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ChatView;
