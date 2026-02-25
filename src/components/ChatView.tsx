import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User } from "lucide-react";
import ActionNeededCard from "./ActionNeededCard";
import { supabase } from "../integrations/supabase/client";
import { APP_USER_ID } from "../config/defaultUser";

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

type InlineSubmitResult = {
  receipt?: {
    artifactId?: string | null;
    title: string;
    deltaSummary?: string | null;
    priorityHint?: string | null;
  } | null;
};

const ChatView = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ 
          top: scrollRef.current.scrollHeight, 
          behavior: "smooth" 
        });
      }
    }, 100);
    return () => clearTimeout(timer);
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
      const { data, error } = await supabase.functions.invoke("chat", {
        body: { message: content, userId: APP_USER_ID },
      });

      if (error) {
        console.error("Function error:", error);
        throw error;
      }

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        content: data.message,
        role: "assistant",
        created_at: new Date().toISOString(),
        metaResponse: data.metaResponse,
        actionNeeded: data.actionNeeded,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      console.error("Chat API error:", error);
      const fallbackMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        content: "I'm having trouble connecting right now. Please try again in a moment.",
        role: "assistant",
        created_at: new Date().toISOString(),
        metaResponse: "Handled connection error",
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const submitInlineAction = async (action: NonNullable<ChatMessage['actionNeeded']>, values: Record<string, string>): Promise<InlineSubmitResult | void> => {
    if (!action.metadata) return;
    setIsLoading(true);

    const { original_message, clickup_list_id } = action.metadata;
    try {
      const { data, error } = await supabase.functions.invoke("chat", {
        body: {
          message: original_message || "inline-submit",
          userId: APP_USER_ID,
          metadata: {
            ...action.metadata,
            inline_fields: Object.entries(values).map(([name, value]) => ({ name, value })),
            actionId: action.id,
            clickup_list_id,
            original_message: original_message || action.metadata.original_message || "inline-submit",
          },
        },
      });

      if (error) {
        console.error("Function error:", error);
        throw error;
      }

      const receipt = data?.receipt || null;
      const hasNextAction = Boolean(data?.actionNeeded);
      // On successful approval execution, replace the staged card with a receipt only.
      if (!receipt?.title || hasNextAction) {
        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          content: data.message,
          role: "assistant",
          created_at: new Date().toISOString(),
          metaResponse: data.metaResponse,
          actionNeeded: data.actionNeeded,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
      return { receipt };
    } catch (error) {
      console.error("Chat API error:", error);
      const fallbackMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        content: "I'm having trouble connecting right now. Please try again in a moment.",
        role: "assistant",
        created_at: new Date().toISOString(),
        metaResponse: "Handled connection error",
      };
      setMessages((prev) => [...prev, fallbackMsg]);
      return { receipt: null };
    } finally {
      setIsLoading(false);
    }
  };

  return { messages, addMessage, submitInlineAction, scrollRef, isLoading };
};

export const ChatViewUI = ({
  messages,
  scrollRef,
  isLoading,
  onOpenSettings,
  onOpenArtifacts,
  onInlineActionSubmit,
}: {
  messages: ChatMessage[];
  scrollRef: React.RefObject<HTMLDivElement>;
  isLoading?: boolean;
  onOpenSettings?: () => void;
  onOpenArtifacts?: () => void;
  onInlineActionSubmit?: (action: NonNullable<ChatMessage["actionNeeded"]>, data: Record<string, string>) => Promise<InlineSubmitResult | void> | InlineSubmitResult | void;
}) => {
  const [resolvedActions, setResolvedActions] = useState<Set<string>>(new Set());
  const [receiptCards, setReceiptCards] = useState<Record<string, { title: string; artifactId?: string | null; deltaSummary?: string | null; priorityHint?: string | null }>>({});

  const regularMessages = messages.filter((msg) => !msg.actionNeeded);
  const rawActionMessages = messages.filter(
    (msg) => msg.actionNeeded && !resolvedActions.has(`${msg.id}-${msg.actionNeeded.id}`)
  );
  const actionMessages = Array.from(
    rawActionMessages.reduce((map, msg) => {
      const actionId = msg.actionNeeded?.id;
      if (actionId && !map.has(actionId)) {
        map.set(actionId, msg);
      }
      return map;
    }, new Map<string, ChatMessage>())
  ).map(([, msg]) => msg);
  const actionMessage = actionMessages[0] ?? null;
  const hasMessages = regularMessages.length > 0 || Boolean(actionMessage);

  const handleActionSubmit = async (messageId: string, actionId: string, data: Record<string, string>) => {
    console.log("Action submitted:", { messageId, actionId, data });
    const sourceMessage = actionMessages.find((msg) => msg.id === messageId);
    if (sourceMessage?.actionNeeded && onInlineActionSubmit) {
      const result = await onInlineActionSubmit(sourceMessage.actionNeeded, data);
      if (result?.receipt?.title) {
        setReceiptCards((prev) => ({
          ...prev,
          [`${messageId}-${actionId}`]: {
            title: result.receipt!.title,
            artifactId: result.receipt!.artifactId || null,
            deltaSummary: result.receipt!.deltaSummary || null,
            priorityHint: result.receipt!.priorityHint || null,
          },
        }));
        setResolvedActions((prev) => new Set([...prev, `${messageId}-${actionId}`]));
      }
      return;
    }
  };

  const handleActionDismiss = (messageId: string, actionId: string) => {
    setResolvedActions((prev) => new Set([...prev, `${messageId}-${actionId}`]));
  };

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden p-[1.75rem]">
      <div className="absolute inset-3 pointer-events-none">
        <div
          className="absolute inset-0 rounded-[32px] border border-white/25 bg-white/10 shadow-[0_-18px_35px_rgba(255,255,255,0.6),0_18px_35px_rgba(15,15,15,0.25)]"
        />
        <div
          className="absolute inset-0 bg-cover bg-center rounded-[32px]"
          style={{ backgroundImage: "url('/blue-pink-BG.jpg')" }}
        />
        <div className="absolute inset-0 rounded-[32px] bg-gradient-to-b from-white/80 via-white/50 to-gray-200/80 backdrop-blur-3xl" />
        {!hasMessages && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-semibold tracking-[0.3em] uppercase text-muted-foreground flex items-center gap-1">
              <span>Ready when you are</span>
              <span className="typing-cursor" aria-hidden="true">
                _
              </span>
            </span>
          </div>
        )}
      </div>

      <div className="absolute left-6 top-6 z-10 pointer-events-none text-xs font-semibold tracking-[0.3em] text-foreground">
        <div className="flex items-center gap-2">
          <img src="/Grant%20Logo.jpg" alt="LifeOS" className="h-6 w-6 object-contain" />
          <span>LIFEOS</span>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="relative z-10 h-full overflow-y-auto px-4 pb-40 scrollbar-hide"
      >
        <div className={`relative mx-auto flex max-w-2xl flex-col gap-4 pb-24 ${hasMessages ? "pt-8" : "pt-12"}`}>
          <AnimatePresence initial={false} mode="popLayout">
            {regularMessages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className="flex flex-col max-w-[80%]">
                  <div
                    className={`px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "text-primary-foreground bg-primary pill"
                        : "bg-secondary text-secondary-foreground rounded-2xl rounded-tl-md"
                    }`}
                  >
                    {msg.content}
                  </div>

                  {msg.role === "assistant" && msg.metaResponse && (
                    <div className="mt-2 px-2 text-xs italic text-muted-foreground">{msg.metaResponse}</div>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="flex-shrink-0 mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-secondary">
                    <User className="h-3.5 w-3.5 text-secondary-foreground" />
                  </div>
                )}
              </motion.div>
            ))}

            {actionMessage && (
              <motion.div
                key={`action-card-${actionMessage.id}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-3"
              >
                {(() => {
                  const actionKey = `${actionMessage.id}-${actionMessage.actionNeeded!.id}`;
                  const receipt = receiptCards[actionKey];
                  if (receipt) {
                    return (
                      <button
                        type="button"
                        onClick={() => onOpenArtifacts?.()}
                        className="w-full rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-left text-sm text-slate-800 hover:bg-white"
                      >
                        <div className="font-medium">{receipt.title}<span className="ml-2">→</span></div>
                        {receipt.priorityHint && (
                          <div className="mt-1 text-xs text-slate-600">Priority: {receipt.priorityHint}</div>
                        )}
                        {receipt.deltaSummary && (
                          <div className="mt-1 text-xs text-slate-500">{receipt.deltaSummary}</div>
                        )}
                      </button>
                    );
                  }
                  return (
                    <ActionNeededCard
                      action={actionMessage.actionNeeded!}
                      onOpenSettings={onOpenSettings}
                      onInlineSubmit={(values) =>
                        handleActionSubmit(actionMessage.id, actionMessage.actionNeeded!.id, values)
                      }
                    />
                  );
                })()}
              </motion.div>
            )}

            {isLoading && (
              <motion.div
                key="assistant-loading"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="flex justify-start"
              >
                <div className="flex flex-col max-w-[80%]">
                  <div className="px-4 py-3 text-sm leading-relaxed rounded-2xl rounded-tl-md bg-secondary text-secondary-foreground">
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground" />
                      <div className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground delay-75" />
                      <div className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground delay-150" />
                    </div>
                  </div>
                  <div className="mt-2 text-xs uppercase tracking-[0.35em] text-muted-foreground flex items-center gap-1">
                    <span>Thinking</span>
                    <span className="typing-cursor" aria-hidden="true">
                      _
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default ChatView;
