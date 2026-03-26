import { useState, useRef, useEffect, type ReactNode, type RefObject } from "react";
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
  messageType?: "default" | "receipt";
  receiptUrl?: string;
  receiptSummary?: ReceiptSummary;
  metaResponse?: string;
  actionNeeded?: {
    id: string;
    type: string;
    description: string;
    metadata?: Record<string, any>;
    fields?: Array<{
      name: string;
      label: string;
      type: "text" | "number" | "select";
      options?: string[];
      placeholder?: string;
    }>;
  };
}

export type ReceiptSummary = {
  title: string;
  leadName?: string | null;
  leadId?: string | null;
  leadUrl?: string | null;
  commentSaved?: boolean;
  commentId?: string | number | null;
  fieldsUpdated?: string[];
  subtaskName?: string | null;
  subtaskId?: string | null;
  subtaskUrl?: string | null;
  dueLabel?: string | null;
  deviceTimeZone?: string | null;
  noteSummary?: string | null;
  rawNote?: string | null;
};

type InlineSubmitResult = {
  resolved?: boolean;
  receipt?: {
    artifactId?: string | null;
    title: string;
    deltaSummary?: string | null;
    priorityHint?: string | null;
  } | null;
};

type SandboxStructuredNote = {
  raw_note: string;
  note_type: string;
  target_id: string;
  summary: string;
  callback_time: string | null;
  phone: string | null;
  confidence: number;
  missing_fields: string[];
};

type SandboxValidation = {
  valid: boolean;
  missing_fields?: string[];
  issues?: string[];
};

type SandboxExtractedNote = {
  facts?: {
    candidate_business_name?: string | null;
    candidate_contact_name?: string | null;
    candidate_owner_name?: string | null;
    candidate_phone_numbers?: string[];
    candidate_owner_email?: string | null;
    candidate_address?: string | null;
    timing?: string | null;
    best_time_to_contact?: string | null;
    pos_system?: string | null;
    location_count?: number | null;
    suggested_task_title?: string | null;
  };
  intents?: Array<{ type?: string; summary?: string }>;
  uncertainty?: {
    tentative_fields?: string[];
    needs_review?: string[];
  };
};

type SandboxAction =
  | { type: "write_comment"; payload?: { comment_text?: string } }
  | { type: "write_assigned_comment"; payload?: { comment_text?: string; assignee_id?: string } }
  | {
      type: "create_follow_up_task";
      payload?: {
        title?: string;
        description?: string;
        due_hint?: string | null;
        source_target_id?: string;
        list_id?: string;
      };
    };

type SandboxActionPlan = {
  actions?: SandboxAction[];
};

type SandboxActionPlanValidation = {
  valid: boolean;
};

type WriteCommentResult = {
  success?: boolean;
  target?: { id?: string | null };
  clickupResponse?: { id?: string | number | null } | null;
  validation?: SandboxValidation;
  error?: string;
};

type CreateFollowUpTaskResult = {
  success?: boolean;
  createdTask?: { id?: string | null; name?: string | null; url?: string | null } | null;
  parentLeadId?: string | null;
  subtaskAttached?: boolean;
  error?: string;
};

type ResolveSourceItemResult = {
  success?: boolean;
  sourceItem?: {
    id?: string | null;
    name?: string | null;
    url?: string | null;
    list_id?: string | null;
    best_time_to_contact?: string | null;
    description?: string | null;
  } | null;
  candidates?: Array<{
    id?: string | null;
    name?: string | null;
    url?: string | null;
    score?: number | null;
    list_id?: string | null;
    best_time_to_contact?: string | null;
    description?: string | null;
  }>;
  created?: boolean;
  matched?: boolean;
  ambiguous?: boolean;
  proposed?: boolean;
  needsListName?: boolean;
  error?: string;
};

type UpdateLeadFieldsResult = {
  success?: boolean;
  updated?: string[];
  skipped?: string[];
  failed?: Array<{ field?: string; status?: number; details?: string }>;
  error?: string;
};

function humanizeFieldName(field: string) {
  return field.replace(/_/g, " ");
}

function describeValidationFailure(validation?: SandboxValidation) {
  const missing = (validation?.missing_fields || []).filter(Boolean);
  const issues = (validation?.issues || []).filter(Boolean);
  const lines = ["Not saved yet."];

  if (missing.length) {
    lines.push(`- Missing: ${missing.map(humanizeFieldName).join(", ")}`);
  }

  if (issues.length) {
    lines.push(`- Issue: ${issues.join(", ")}`);
  }

  if (!missing.length && !issues.length) {
    lines.push("- Validation did not pass.");
  }

  return lines.join("\n");
}

function shouldIntentCreateFollowUpTask(extractedNote?: SandboxExtractedNote) {
  return Boolean(
    (extractedNote?.intents || []).some((intent) => intent?.type === "create_linked_task")
  );
}

function ensureFollowUpTaskAction(
  actionPlan: SandboxActionPlan | undefined,
  structuredNote: SandboxStructuredNote,
  extractedNote: SandboxExtractedNote | undefined,
  sourceItem: { id?: string | null; name?: string | null; list_id?: string | null } | null | undefined,
  taskOverrides?: { title?: string; description?: string; dueHint?: string; deviceTimeZone?: string } | null
): SandboxActionPlan | undefined {
  const actions = [...(actionPlan?.actions || [])];
  const hasTaskAction = actions.some((action) => action.type === "create_follow_up_task");
  const shouldAddTaskAction =
    !hasTaskAction &&
    (shouldIntentCreateFollowUpTask(extractedNote) ||
      Boolean(taskOverrides?.title?.trim()) ||
      Boolean(taskOverrides?.dueHint?.trim()));

  if (!shouldAddTaskAction) {
    return actionPlan;
  }

  actions.push({
    type: "create_follow_up_task",
    payload: {
      title:
        taskOverrides?.title?.trim() ||
        extractedNote?.facts?.suggested_task_title ||
        structuredNote.summary,
      description:
        taskOverrides?.description?.trim() ||
        [
          `Source item: ${sourceItem?.id || structuredNote.target_id}`,
          `Lead: ${sourceItem?.name || "Source item"}`,
          `Summary: ${structuredNote.summary}`,
          taskOverrides?.dueHint || extractedNote?.facts?.timing
            ? `Timing: ${taskOverrides?.dueHint || extractedNote?.facts?.timing}`
            : null,
          `Original note: ${structuredNote.raw_note}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      due_hint: taskOverrides?.dueHint || extractedNote?.facts?.timing || structuredNote.callback_time,
      source_target_id: sourceItem?.id || structuredNote.target_id,
      list_id: sourceItem?.list_id || "",
    },
  });

  return { actions };
}

function renderMarkdownishContent(content: string) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let bulletBuffer: string[] = [];

  const flushBullets = () => {
    if (!bulletBuffer.length) return;
    blocks.push(
      <ul key={`bullets-${blocks.length}`} className="space-y-1.5 pl-5 list-disc marker:text-slate-400">
        {bulletBuffer.map((line, index) => (
          <li key={`${line}-${index}`} className="text-[15px] leading-7 text-[rgb(32,32,32)]">
            {line}
          </li>
        ))}
      </ul>
    );
    bulletBuffer = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBullets();
      return;
    }

    if (trimmed.startsWith("- ")) {
      bulletBuffer.push(trimmed.slice(2).trim());
      return;
    }

    flushBullets();
    blocks.push(
      <p key={`paragraph-${index}`} className="text-[15px] leading-7 text-[rgb(32,32,32)]">
        {trimmed}
      </p>
    );
  });

  flushBullets();

  if (!blocks.length) {
    return <p className="text-[15px] leading-7 text-[rgb(32,32,32)]">{content}</p>;
  }

  return <div className="space-y-3">{blocks}</div>;
}

function renderAssistantMessage(
  message: ChatMessage,
  onOpenReceipt?: (summary: ReceiptSummary) => void
) {
  if (message.messageType === "receipt") {
    const receiptChip = (
      <div className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200/90 bg-slate-50/70 px-2 py-[6px] text-[11px] font-medium text-[rgb(32,32,32)]">
        <img
          src="/clickup-removebg-preview.png"
          alt=""
          aria-hidden="true"
          className="h-3.5 w-3.5 object-contain"
        />
        <span>{message.content}</span>
      </div>
    );

    const viewReceiptButton =
      message.receiptSummary && onOpenReceipt ? (
        <button
          type="button"
          onClick={() => onOpenReceipt(message.receiptSummary!)}
          className="mt-1 inline-flex text-[12px] text-slate-500 transition-colors hover:text-[rgb(32,32,32)]"
        >
          view receipt
        </button>
      ) : null;

    if (message.receiptUrl) {
      return (
        <div className="inline-flex flex-col items-start">
          <a
            href={message.receiptUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block transition-opacity hover:opacity-80"
          >
            {receiptChip}
          </a>
          {viewReceiptButton}
        </div>
      );
    }

    return (
      <div className="inline-flex flex-col items-start">
        {receiptChip}
        {viewReceiptButton}
      </div>
    );
  }

  return renderMarkdownishContent(message.content);
}

const ChatView = (keyboardOpen = false) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (keyboardOpen) return;
    if (!messages.length) return;
    const timer = setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ 
          top: scrollRef.current.scrollHeight, 
          behavior: "smooth" 
        });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [messages, keyboardOpen]);

  const appendAssistantMessage = (
    content: string,
    metaResponse?: string,
    actionNeeded?: ChatMessage["actionNeeded"],
    messageType: ChatMessage["messageType"] = "default",
    receiptUrl?: string,
    receiptSummary?: ReceiptSummary
  ) => {
    const messageId = `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const assistantMsg: ChatMessage = {
      id: messageId,
      content,
      role: "assistant",
      created_at: new Date().toISOString(),
      messageType,
      receiptUrl,
      receiptSummary,
      metaResponse,
      actionNeeded,
    };
    setMessages((prev) => [...prev, assistantMsg]);
    return messageId;
  };

  const updateAssistantMessage = (id: string, updates: Partial<ChatMessage>) => {
    setMessages((prev) =>
      prev.map((message) => (message.id === id ? { ...message, ...updates } : message))
    );
  };

  const maybeWriteSandboxComment = async (
    structuredNote?: SandboxStructuredNote,
    validation?: SandboxValidation,
    extractedNote?: SandboxExtractedNote,
    actionPlan?: SandboxActionPlan,
    actionPlanValidation?: SandboxActionPlanValidation,
    sourceItemOverride?: { id?: string | null; name?: string | null; url?: string | null; list_id?: string | null } | null,
    taskOverrides?: { title?: string; description?: string; dueHint?: string; deviceTimeZone?: string } | null
  ): Promise<boolean> => {
    if (!structuredNote || !validation?.valid) {
      appendAssistantMessage(describeValidationFailure(validation));
      return false;
    }

    try {
      const receiptSummary: ReceiptSummary = {
        title: "ClickUp receipt",
        leadName: sourceItemOverride?.name || null,
        leadId: sourceItemOverride?.id || null,
        leadUrl: sourceItemOverride?.url || null,
        fieldsUpdated: [],
        noteSummary: structuredNote.summary,
        rawNote: structuredNote.raw_note,
        deviceTimeZone: taskOverrides?.deviceTimeZone || null,
      };

      let sourceResult: ResolveSourceItemResult;
      if (sourceItemOverride?.id) {
        sourceResult = {
          success: true,
          sourceItem: sourceItemOverride,
          matched: true,
          created: false,
        };
      } else {
        const sourceResultResponse = await supabase.functions.invoke("resolve-source-item", {
          body: {
            rawNote: structuredNote.raw_note,
            summary: structuredNote.summary,
            extractedNote,
            userId: APP_USER_ID,
          },
        });

        if (sourceResultResponse.error) {
          appendAssistantMessage(
            `Not saved yet.\n- ${sourceResultResponse.error.message || "Could not resolve the source item."}`
          );
          return false;
        }

        sourceResult = (sourceResultResponse.data || {}) as ResolveSourceItemResult;
      }

      if (!sourceItemOverride?.id) {
        if (!sourceResult.success && !sourceResult.ambiguous && !sourceResult.proposed && !sourceResult.sourceItem?.id) {
          appendAssistantMessage(
            sourceResult.needsListName
              ? "Not saved yet.\n- I need a list name before I can place this item."
              : `Not saved yet.\n- ${sourceResult.error || "Could not resolve the source item."}`
          );
          return false;
        }

        const suggestedCandidates = Array.isArray(sourceResult.candidates)
          ? sourceResult.candidates
          : [];

        appendAssistantMessage(
          sourceResult.matched
            ? "Here’s where I’m putting this. Confirm it, or change it."
            : sourceResult.proposed
              ? "I didn’t find a confident existing lead. Confirm a match, search again, or create this as new."
              : "Pick the lead for this note, or create a new one.",
          undefined,
          {
            id: `resolve-source-item-${Date.now()}`,
            type: "resolve_source_item",
            description: sourceResult.matched
              ? "Confirm the lead for this note."
              : "Choose the lead for this note.",
            metadata: {
              resolver_type: "resolve_source_item",
              candidates: suggestedCandidates,
              selected_source_item: sourceResult.matched ? sourceResult.sourceItem || null : null,
              proposed_source_item: sourceResult.proposed ? sourceResult.sourceItem || null : null,
              auto_selected: Boolean(sourceResult.matched && sourceResult.sourceItem?.id),
              structuredNote,
              validation,
              extractedNote,
              actionPlan,
              actionPlanValidation,
            },
          }
        );
        return false;
      }

      if (sourceResult.created) {
        appendAssistantMessage(
          "Lead created in ClickUp.",
          undefined,
          undefined,
          "receipt",
          sourceResult.sourceItem.url || undefined
        );
      }

      receiptSummary.leadName = sourceResult.sourceItem?.name || receiptSummary.leadName || null;
      receiptSummary.leadId = sourceResult.sourceItem?.id || receiptSummary.leadId || null;
      receiptSummary.leadUrl = sourceResult.sourceItem?.url || receiptSummary.leadUrl || null;

      if (extractedNote) {
        const leadFieldResponse = await supabase.functions.invoke("update-lead-fields", {
          body: {
            targetId: sourceResult.sourceItem.id,
            extractedNote,
          },
        });

        if (!leadFieldResponse.error) {
          const leadFieldResult = (leadFieldResponse.data || {}) as UpdateLeadFieldsResult;
          if (Array.isArray(leadFieldResult.updated) && leadFieldResult.updated.length > 0) {
            receiptSummary.fieldsUpdated = leadFieldResult.updated;
          }
        }
      }

      const effectiveActionPlan = ensureFollowUpTaskAction(
        actionPlan,
        structuredNote,
        extractedNote,
        sourceResult.sourceItem,
        taskOverrides
      );

      const shouldCreateFollowUpTask = Boolean(
        (effectiveActionPlan?.actions || []).some((action) => action.type === "create_follow_up_task")
      );
      console.log(
        `[LifeOS] preflight execute shouldCreateFollowUpTask=${shouldCreateFollowUpTask} actionTypes=${(effectiveActionPlan?.actions || [])
          .map((action) => action.type)
          .join(",")} sourceTargetId=${sourceResult.sourceItem?.id || ""}`
      );

      let savedReceiptId: string | null = null;

      if (!shouldCreateFollowUpTask) {
        const { data, error } = await supabase.functions.invoke("write-comment", {
          body: { note: structuredNote, targetId: sourceResult.sourceItem.id },
        });

        if (error) {
          throw error;
        }

        const result = (data || {}) as WriteCommentResult;
          if (!result.success) {
            appendAssistantMessage(
              result.validation?.valid === false
                ? describeValidationFailure(result.validation)
                : `Not saved yet.\n- ${result.error || "Write-comment returned an error."}`
            );
            return false;
          }

        receiptSummary.commentSaved = true;
        receiptSummary.commentId = result.clickupResponse?.id || null;

        savedReceiptId = appendAssistantMessage(
          "Saved to ClickUp.",
          undefined,
          undefined,
          "receipt",
          sourceResult.sourceItem.url || (result.target?.id ? `https://app.clickup.com/t/${result.target.id}` : undefined),
          receiptSummary
        );
      }

      if (!shouldCreateFollowUpTask) {
        return true;
      }

      const taskResponse = await supabase.functions.invoke("create-follow-up-task", {
        body: {
          device_time_zone: taskOverrides?.deviceTimeZone || null,
          plan: effectiveActionPlan
            ? {
                ...effectiveActionPlan,
                target_id: sourceResult.sourceItem.id,
                actions: (effectiveActionPlan.actions || []).map((action) => {
                  if (action.type !== "create_follow_up_task") return action;
                  return {
                    ...action,
                    payload: {
                      ...action.payload,
                      title: taskOverrides?.title?.trim() || action.payload?.title,
                      due_hint:
                        taskOverrides?.dueHint !== undefined
                          ? taskOverrides.dueHint || null
                          : action.payload?.due_hint,
                      source_target_id: sourceResult.sourceItem.id || undefined,
                      list_id: sourceResult.sourceItem?.list_id || action.payload?.list_id,
                      description:
                        taskOverrides?.description?.trim() ||
                        (action.payload?.description || "")
                          .replace(/Source item:\s*\S+/i, `Source item: ${sourceResult.sourceItem?.id}`)
                          .replace(/Lead:\s*.*/i, `Lead: ${sourceResult.sourceItem?.name || "Source item"}`),
                    },
                  };
                }),
              }
            : effectiveActionPlan,
        },
      });

      if (taskResponse.error) {
        appendAssistantMessage(
          `Task not created yet.\n- ${taskResponse.error.message || "Could not reach the follow-up task writer."}`
        );
        return false;
      }

      const taskResult = (taskResponse.data || {}) as CreateFollowUpTaskResult;
      if (!taskResult.success) {
        appendAssistantMessage(
          `Task not created yet.\n- ${taskResult.error || "Follow-up task writer returned an error."}`
        );
        return false;
      }

      receiptSummary.subtaskName = taskResult.createdTask?.name || null;
      receiptSummary.subtaskId = taskResult.createdTask?.id || null;
      receiptSummary.subtaskUrl = taskResult.createdTask?.url || null;
      receiptSummary.dueLabel =
        taskOverrides?.dueHint ||
        (effectiveActionPlan?.actions || []).find((action) => action.type === "create_follow_up_task")?.payload?.due_hint ||
        structuredNote.callback_time ||
        null;
      if (savedReceiptId) {
        updateAssistantMessage(savedReceiptId, { receiptSummary: { ...receiptSummary } });
      }

      appendAssistantMessage(
        "Subtask created in ClickUp.",
        undefined,
        undefined,
        "receipt",
        taskResult.createdTask?.url || undefined,
        { ...receiptSummary }
      );

      if (!taskResult.subtaskAttached) {
        appendAssistantMessage(
          "Subtask created, but parent attachment needs review."
        );
      }
      return true;
    } catch (error) {
      console.error("Write-comment error:", error);
      appendAssistantMessage(
        "Not saved yet.\n- I could not reach the fixed comment writer."
      );
      return false;
    }
  };

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
        messageType: "default",
        metaResponse: data?.safeMode ? undefined : data.metaResponse,
        actionNeeded: data.actionNeeded,
      };

      if (data?.safeMode) {
        await maybeWriteSandboxComment(
          data?.structuredNote as SandboxStructuredNote | undefined,
          data?.validation as SandboxValidation | undefined,
          data?.extractedNote as SandboxExtractedNote | undefined,
          data?.actionPlan as SandboxActionPlan | undefined,
          data?.actionPlanValidation as SandboxActionPlanValidation | undefined
        );
      } else {
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (error) {
      console.error("Chat API error:", error);
      const fallbackMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        content: "I'm having trouble connecting right now. Please try again in a moment.",
        role: "assistant",
        created_at: new Date().toISOString(),
        messageType: "default",
        metaResponse: "Handled connection error",
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const addAssistantMessage = (content: string, metaResponse?: string) => {
    appendAssistantMessage(content, metaResponse);
  };

  const submitInlineAction = async (action: NonNullable<ChatMessage['actionNeeded']>, values: Record<string, string>): Promise<InlineSubmitResult | void> => {
    if (!action.metadata) return;

    if (action.metadata?.resolver_type === "resolve_source_item") {
      const resolverMode = String(values.resolver_mode || "");
      const selectedId = String(values.source_item_id || action.metadata.selected_source_item?.id || "");
      const taskOverrides = {
        title: values.task_title || "",
        description: values.task_description || "",
        dueHint:
          values.due_date
            ? values.due_hint || `${values.due_date}${values.due_time ? `T${values.due_time}` : ""}`
            : values.due_hint || "",
        deviceTimeZone: values.device_time_zone || "",
      };
      if (resolverMode === "search" || resolverMode === "create") {
        const sourceResultResponse = await supabase.functions.invoke("resolve-source-item", {
          body: {
            rawNote: action.metadata.structuredNote?.raw_note,
            summary: action.metadata.structuredNote?.summary,
            extractedNote: action.metadata.extractedNote,
            userId: APP_USER_ID,
            forceCreate: resolverMode === "create",
            manualName: values.search_name || values.create_new_name || "",
          },
        });

        if (sourceResultResponse.error) {
          appendAssistantMessage("Not saved yet.\n- Could not resolve the lead.");
          return;
        }

        const sourceResult = (sourceResultResponse.data || {}) as ResolveSourceItemResult;
        if (sourceResult.success && sourceResult.sourceItem?.id) {
          const saved = await maybeWriteSandboxComment(
            action.metadata.structuredNote as SandboxStructuredNote | undefined,
            action.metadata.validation as SandboxValidation | undefined,
            action.metadata.extractedNote as SandboxExtractedNote | undefined,
            action.metadata.actionPlan as SandboxActionPlan | undefined,
            action.metadata.actionPlanValidation as SandboxActionPlanValidation | undefined,
            sourceResult.sourceItem || null,
            taskOverrides
          );
          return { resolved: saved };
        }

        if (sourceResult.ambiguous || sourceResult.candidates?.length) {
          appendAssistantMessage(
            "I found a few possible leads. Pick the right one, or change it again.",
            undefined,
            {
              id: `resolve-source-item-${Date.now()}`,
              type: "resolve_source_item",
              description: "Confirm the lead for this note.",
              metadata: {
                resolver_type: "resolve_source_item",
                candidates: sourceResult.candidates || [],
                selected_source_item: sourceResult.sourceItem || null,
                auto_selected: false,
                structuredNote: action.metadata.structuredNote,
                validation: action.metadata.validation,
                extractedNote: action.metadata.extractedNote,
                actionPlan: action.metadata.actionPlan,
                actionPlanValidation: action.metadata.actionPlanValidation,
              },
            }
          );
          return;
        }

        appendAssistantMessage(`Not saved yet.\n- ${sourceResult.error || "Could not resolve the lead."}`);
        return { resolved: false };
      }

      if (!selectedId) return;
      const selectedCandidate =
        (action.metadata.candidates || []).find(
          (candidate: any) => String(candidate?.id || "") === selectedId
        ) ||
        (String(action.metadata.selected_source_item?.id || "") === selectedId
          ? action.metadata.selected_source_item
          : null);

      const saved = await maybeWriteSandboxComment(
        action.metadata.structuredNote as SandboxStructuredNote | undefined,
        action.metadata.validation as SandboxValidation | undefined,
        action.metadata.extractedNote as SandboxExtractedNote | undefined,
        action.metadata.actionPlan as SandboxActionPlan | undefined,
        action.metadata.actionPlanValidation as SandboxActionPlanValidation | undefined,
        selectedCandidate || null,
        taskOverrides
      );
      return { resolved: saved };
    }

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
        messageType: "default",
        metaResponse: "Handled connection error",
      };
      setMessages((prev) => [...prev, fallbackMsg]);
      return { receipt: null };
    } finally {
      setIsLoading(false);
    }
  };

  return { messages, addMessage, addAssistantMessage, submitInlineAction, scrollRef, isLoading };
};

export const ChatViewUI = ({
  messages,
  scrollRef,
  isLoading,
  keyboardOpen = false,
  visualViewportTopPx = 0,
  onOpenSettings,
  onOpenArtifacts,
  onOpenReceipt,
  onInlineActionSubmit,
}: {
  messages: ChatMessage[];
  scrollRef: RefObject<HTMLDivElement>;
  isLoading?: boolean;
  keyboardOpen?: boolean;
  visualViewportTopPx?: number;
  onOpenSettings?: () => void;
  onOpenArtifacts?: () => void;
  onOpenReceipt?: (summary: ReceiptSummary) => void;
  onInlineActionSubmit?: (action: NonNullable<ChatMessage["actionNeeded"]>, data: Record<string, string>) => Promise<InlineSubmitResult | void> | InlineSubmitResult | void;
}) => {
  const [resolvedActions, setResolvedActions] = useState<Set<string>>(new Set());
  const [receiptCards, setReceiptCards] = useState<Record<string, { title: string; artifactId?: string | null; deltaSummary?: string | null; priorityHint?: string | null }>>({});
  const lastThreadScrollTop = useRef(0);
  const prevKeyboardOpen = useRef(false);

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
      if (sourceMessage.actionNeeded.metadata?.resolver_type === "resolve_source_item" && result?.resolved) {
        setResolvedActions((prev) => new Set([...prev, `${messageId}-${actionId}`]));
      }
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

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    if (keyboardOpen && !prevKeyboardOpen.current) {
      lastThreadScrollTop.current = container.scrollTop;
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = lastThreadScrollTop.current;
        }
      });
    }

    prevKeyboardOpen.current = keyboardOpen;
  }, [keyboardOpen, scrollRef]);

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden p-0 md:p-[1.75rem]">
      <div className="fixed md:absolute inset-0 md:inset-3 pointer-events-none">
        <div
          className="absolute inset-0 rounded-none md:rounded-[32px] border-0 md:border border-slate-200/70 bg-transparent shadow-none md:shadow-none"
        />
        <div className="absolute inset-0 rounded-none md:rounded-[32px] bg-transparent backdrop-blur-0" />
      </div>

      <div
        className="fixed left-4 z-20 pointer-events-none text-[10px] font-semibold tracking-[0.28em] text-foreground md:hidden"
        style={{ top: `calc(env(safe-area-inset-top) + 0.75rem + ${visualViewportTopPx}px)` }}
      >
        <div className="flex items-center gap-2">
          <img src="/Grant%20Logo.jpg" alt="LifeOS" className="h-6 w-6 object-contain" />
          <span>LIFEOS</span>
        </div>
      </div>

      <div className="fixed left-6 top-6 z-20 pointer-events-none hidden md:block text-xs font-semibold tracking-[0.3em] text-foreground">
        <div className="flex items-center gap-2">
          <img src="/Grant%20Logo.jpg" alt="LifeOS" className="h-6 w-6 object-contain" />
          <span>LIFEOS</span>
        </div>
      </div>

      {!hasMessages && (
        <div
          className="pointer-events-none fixed left-0 right-0 z-10 flex justify-center px-6 text-center md:hidden"
          style={{ top: `calc(42% + ${visualViewportTopPx}px)` }}
        >
          <span className="flex items-center gap-1 text-sm font-semibold uppercase tracking-[0.3em] text-[rgb(32,32,32)]/55">
            <span>Ready when you are</span>
            <span className="typing-cursor" aria-hidden="true">
              _
            </span>
          </span>
        </div>
      )}

      <div
        ref={scrollRef}
        className={`relative z-10 h-full px-3 md:px-4 pb-36 md:pb-40 scrollbar-hide ${keyboardOpen ? "overflow-hidden touch-none md:overflow-y-auto" : "overflow-y-auto"}`}
        onScroll={() => {
          if (!keyboardOpen && scrollRef.current) {
            lastThreadScrollTop.current = scrollRef.current.scrollTop;
          } else if (keyboardOpen && scrollRef.current) {
            scrollRef.current.scrollTop = lastThreadScrollTop.current;
          }
        }}
      >
        <div className={`relative mx-auto flex max-w-2xl flex-col gap-1.5 md:gap-2 pb-20 md:pb-24 ${hasMessages ? "pt-[calc(env(safe-area-inset-top)+4.5rem)] md:pt-8" : "pt-10 md:pt-12"}`}>
          {!hasMessages && <div className="min-h-[66vh] hidden md:flex items-center justify-center" />}
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
                        ? "rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-white text-[rgb(32,32,32)] shadow-[0_2px_6px_rgba(15,23,42,0.04)]"
                        : msg.messageType === "receipt"
                          ? "bg-transparent p-0 text-[rgb(32,32,32)]"
                          : "bg-transparent p-0 text-[rgb(32,32,32)]"
                    }`}
                  >
                    {msg.role === "assistant" ? renderAssistantMessage(msg, onOpenReceipt) : msg.content}
                  </div>

                  {msg.role === "assistant" && msg.metaResponse && (
                    <div className="mt-2 px-2 text-xs italic text-[rgb(32,32,32)]/55">{msg.metaResponse}</div>
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
