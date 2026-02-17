import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, User } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import ActionNeededCard from "./ActionNeededCard";
import { supabase } from "../integrations/supabase/client";

export interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  created_at: string;
  metaResponse?: string;
  actionNeeded?: {
    id: string;
    type: string;
    description: string;
    fields?: Array<{
      name: string;
      label: string;
      type: "text" | "number" | "select";
      options?: string[];
      placeholder?: string;
    }>;
  };
}

const ChatView = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      content: "Hey! I'm your LifeOS assistant. I can help you manage tasks, process receipts, and stay organized. What would you like to do?",
      role: "assistant",
      created_at: new Date().toISOString(),
      metaResponse: "Displayed welcome message and offered assistance"
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const addMessage = async (content: string) => {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      content,
      role: "user",
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('chat', {
        body: { message: content }
      });

      if (error) {
        console.error('Function error:', error);
        throw error;
      }

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        content: data.message,
        role: "assistant",
        created_at: new Date().toISOString(),
        metaResponse: data.metaResponse,
        actionNeeded: data.actionNeeded
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      console.error('Chat API error:', error);
      const fallbackMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        content: "I'm having trouble connecting right now. Please try again in a moment.",
        role: "assistant",
        created_at: new Date().toISOString(),
        metaResponse: "Handled connection error"
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return { messages, addMessage, scrollRef, isLoading };
};

export const ChatViewUI = ({
  messages,
  scrollRef,
  isLoading,
  onOpenSettings,
}: {
  messages: ChatMessage[];
  scrollRef: React.RefObject<HTMLDivElement>;
  isLoading?: boolean;
  onOpenSettings?: () => void;
}) => {
  const [resolvedActions, setResolvedActions] = useState<Set<string>>(new Set());

  const handleActionSubmit = (messageId: string, actionId: string, data: Record<string, string>) => {
    console.log('Action submitted:', { messageId, actionId, data });
    setResolvedActions(prev => new Set([...prev, `${messageId}-${actionId}`]));
  };

  const handleActionDismiss = (messageId: string, actionId: string) => {
    setResolvedActions(prev => new Set([...prev, `${messageId}-${actionId}`]));
  };

  // Separate regular messages and action cards
  const regularMessages = messages.filter(msg => !msg.actionNeeded);
  const actionMessages = messages.filter(msg => 
    msg.actionNeeded && !resolvedActions.has(`${msg.id}-${msg.actionNeeded.id}`)
  );

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 pt-6 pb-44 scrollbar-hide"
    >
      <div className="max-w-2xl mx-auto space-y-4">
        <AnimatePresence initial={false}>
          {/* Regular messages */}
          {regularMessages.map((msg) => (
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

              <div className="flex flex-col max-w-[80%]">
                <div
                  className={`px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground pill"
                      : "bg-secondary text-secondary-foreground rounded-2xl rounded-tl-md"
                  }`}
                >
                  {msg.content}
                </div>
                
                {msg.role === "assistant" && msg.metaResponse && (
                  <div className="mt-2 px-2 text-xs text-muted-foreground italic">
                    {msg.metaResponse}
                  </div>
                )}
              </div>

              {msg.role === "user" && (
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-secondary flex items-center justify-center mt-1">
                  <User className="w-3.5 h-3.5 text-secondary-foreground" />
                </div>
              )}
            </motion.div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3 justify-start"
            >
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center mt-1">
                <Bot className="w-3.5 h-3.5 text-primary-foreground" />
              </div>

              <div className="flex flex-col max-w-[80%]">
                <div className="px-4 py-3 text-sm leading-relaxed bg-secondary text-secondary-foreground rounded-2xl rounded-tl-md">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" />
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse delay-75" />
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse delay-150" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Action cards - always at the bottom */}
          {actionMessages.map((msg) => (
            <ActionNeededCard
              key={`action-${msg.id}-${msg.actionNeeded?.id}`}
              action={msg.actionNeeded!}
              onSubmit={(data) => handleActionSubmit(msg.id, msg.actionNeeded!.id, data)}
              onDismiss={() => handleActionDismiss(msg.id, msg.actionNeeded!.id)}
              onOpenSettings={onOpenSettings}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ChatView;
