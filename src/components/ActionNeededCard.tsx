import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, Pencil } from "lucide-react";
import { ChatMessage } from "./ChatView";
import { useState } from "react";

interface ActionNeededCardProps {
  action: NonNullable<ChatMessage["actionNeeded"]>;
  onOpenSettings?: () => void;
  onInlineSubmit?: (values: Record<string, string>) => Promise<void> | void;
}

function getDeviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function parseDueHintPreview(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return { date: "", time: "", label: "None" };

  const isoMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})(?:[t\s](\d{2}:\d{2}))?$/i);
  if (isoMatch) {
    const date = isoMatch[1];
    const time = isoMatch[2] || "";
    const dt = new Date(time ? `${date}T${time}:00` : `${date}T09:00:00`);
    return {
      date,
      time,
      label: dt.toLocaleString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: time ? "numeric" : undefined,
        minute: time ? "2-digit" : undefined,
      }),
    };
  }

  const result = new Date();
  result.setSeconds(0, 0);
  if (normalized.includes("tomorrow")) {
    result.setDate(result.getDate() + 1);
  } else if (!normalized.includes("today")) {
    const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
    const shortToFull: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const weekdayMatch = normalized.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b/);
    if (weekdayMatch) {
      const raw = weekdayMatch[1];
      const targetDay =
        raw.length <= 3 ? shortToFull[raw.slice(0, 3) as keyof typeof shortToFull] : weekdays.indexOf(raw as (typeof weekdays)[number]);
      const currentDay = result.getDay();
      let daysAhead = (targetDay - currentDay + 7) % 7;
      if (daysAhead === 0) daysAhead = 7;
      result.setDate(result.getDate() + daysAhead);
    }
  }

  let hour = 9;
  let minute = 0;
  const explicit = normalized.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (explicit) {
    hour = Number(explicit[1]) % 12;
    minute = explicit[2] ? Number(explicit[2]) : 0;
    if (explicit[3] === "pm") hour += 12;
  } else if (/\bmorning\b/.test(normalized)) {
    hour = 9;
  } else if (/\bafternoon\b/.test(normalized)) {
    hour = 15;
  } else if (/\btonight\b|\bnight\b|\bevening\b/.test(normalized)) {
    hour = 19;
  }
  result.setHours(hour, minute, 0, 0);

  const date = `${result.getFullYear()}-${String(result.getMonth() + 1).padStart(2, "0")}-${String(result.getDate()).padStart(2, "0")}`;
  const time = `${String(result.getHours()).padStart(2, "0")}:${String(result.getMinutes()).padStart(2, "0")}`;
  return {
    date,
    time,
    label: result.toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

function toOffsetDateTime(date: string, time: string) {
  if (!date) return "";
  const safeTime = time || "09:00";
  const local = new Date(`${date}T${safeTime}:00`);
  if (Number.isNaN(local.getTime())) return `${date}T${safeTime}`;
  const offsetMinutes = -local.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absMinutes / 60)).padStart(2, "0");
  const remainderMinutes = String(absMinutes % 60).padStart(2, "0");
  return `${date}T${safeTime}:00${sign}${offsetHours}:${remainderMinutes}`;
}

function buildFallbackTaskTitle(
  actionLabel: string | null,
  leadLabel: string | null,
  dueHint: string | null
) {
  const timeOnlyMatch = (dueHint || "").match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  const timeOnly = timeOnlyMatch
    ? `${timeOnlyMatch[1]}${timeOnlyMatch[2] ? `:${timeOnlyMatch[2]}` : ""} ${timeOnlyMatch[3].toUpperCase()}`
    : null;
  return [actionLabel || "Follow Up", leadLabel || "Lead", timeOnly].filter(Boolean).join(" - ");
}

const ActionNeededCard = ({ action, onOpenSettings, onInlineSubmit }: ActionNeededCardProps) => {
  const plan = action.metadata?.plan;
  const message =
    action.metadata?.description ||
    plan?.summary ||
    action.description ||
    "Sync your ClickUp workspace to proceed with this action.";
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showModify, setShowModify] = useState(false);
  const [showResolverOverride, setShowResolverOverride] = useState(false);
  const [editingField, setEditingField] = useState<null | "lead" | "title" | "due" | "notes">(null);
  const inlineFields = action.metadata?.fields ?? action.fields ?? [];
  const isPlanApproval = Boolean(plan);
  const isSourceResolver = action.metadata?.resolver_type === "resolve_source_item";
  const overrideOptions = action.metadata?.override_options || {};
  const overrideSpaces = Array.isArray(overrideOptions.spaces) ? overrideOptions.spaces : [];
  const overrideLists = Array.isArray(overrideOptions.lists) ? overrideOptions.lists : [];
  const goalDeltas = Array.isArray(action.metadata?.deltas) ? action.metadata.deltas : [];

  const handleChange = (name: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const resolveSuggestedTargetLabel = () => {
    const targetField = inlineFields.find((field) => field.name === "target_list_id");
    if (!targetField) return null;
    const options = targetField.options || [];
    const suggestedId = action.metadata?.target_list_id || plan?.target?.listId;
    if (!suggestedId) return null;
    const suggested = options.find((option) => option.startsWith(`${suggestedId}|`));
    if (!suggested) return null;
    const [, label] = suggested.split("|");
    return label || null;
  };

  const suggestedTargetLabel = resolveSuggestedTargetLabel();
  const suggestedSpaceId = action.metadata?.clickup_space_id || "";
  const selectedSpaceId = formValues.target_space_id || suggestedSpaceId || "";
  const filteredLists = selectedSpaceId
    ? overrideLists.filter((entry: any) => String(entry?.spaceId || "") === String(selectedSpaceId))
    : overrideLists;
  const preview = action.metadata?.preview || {};
  const formatPreviewDateTime = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  const handleSubmit = async (values: Record<string, string>) => {
    if (!onInlineSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onInlineSubmit(values);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resolveCompactSelectValue = (fieldName: string, options?: string[]) => {
    const explicitValue = formValues[fieldName];
    if (explicitValue) return explicitValue;
    if (isSourceResolver && options?.length) {
      const [firstOption = ""] = options;
      const [firstValue] = firstOption.includes("|") ? firstOption.split("|") : [firstOption];
      return firstValue;
    }
    return "";
  };

  if (isSourceResolver) {
    const candidates = Array.isArray(action.metadata?.candidates) ? action.metadata.candidates : [];
    const selectedSourceItem = action.metadata?.selected_source_item || null;
    const proposedSourceItem = action.metadata?.proposed_source_item || null;
    const resolverMode = formValues.resolver_mode || "search";
    const searchName = formValues.search_name ?? "";
    const createName = formValues.create_new_name ?? "";
    const selectedValue = String(formValues.source_item_id || selectedSourceItem?.id || candidates[0]?.id || "");
    const selectedCandidate =
      candidates.find((candidate: any) => String(candidate?.id || "") === selectedValue) ||
      selectedSourceItem ||
      proposedSourceItem ||
      null;
    const selectedLabel = selectedCandidate?.name || "Suggested lead";
    const selectedLeadDescription = selectedCandidate?.description || null;
    const hasOverrideOptions = candidates.length > 0 || Boolean(proposedSourceItem?.name);
    const taskAction =
      (action.metadata?.actionPlan?.actions || action.metadata?.action_plan?.actions || []).find(
        (entry: any) => entry?.type === "create_follow_up_task"
      ) || null;
    const rawNote = String(action.metadata?.structuredNote?.raw_note || "").toLowerCase();
    const inferredActionLabel =
      /\b(confirm|confirmation)\b/.test(rawNote) && /\b(appt|appointment|walk-?in|visit|meeting)\b/.test(rawNote)
        ? "Confirm Appt"
        : /\bemail|e-mail\b/.test(rawNote)
          ? "Email"
          : /\btext|sms\b/.test(rawNote)
            ? "Text"
            : /\bswing by|stop by|head to|go by|visit|walk-?in|meet|meeting\b/.test(rawNote)
              ? "Visit"
              : /\bcall|called|call back|reach|voicemail\b/.test(rawNote)
                ? "Call"
                : "Follow Up";
    const resolvedDueHint =
      formValues.due_hint ??
      taskAction?.payload?.due_hint ??
      action.metadata?.extractedNote?.facts?.timing ??
      action.metadata?.structuredNote?.callback_time ??
      "";
    const previewTaskTitle =
      formValues.task_title ??
      taskAction?.payload?.title ??
      action.metadata?.extractedNote?.facts?.suggested_task_title ??
      buildFallbackTaskTitle(inferredActionLabel, selectedLabel, resolvedDueHint);
    const previewDueHint = resolvedDueHint;
    const parsedDue = parseDueHintPreview(previewDueHint);
    const basePreviewDescription =
      taskAction?.payload?.description ||
      [
        action.metadata?.structuredNote?.summary ? `Summary: ${action.metadata.structuredNote.summary}` : null,
        selectedLeadDescription ? `Lead context: ${selectedLeadDescription}` : null,
      ]
        .filter(Boolean)
        .join("\n\n");
    const previewDescription = formValues.task_description ?? basePreviewDescription;
    const resolvedDueValue = toOffsetDateTime(
      formValues.due_date ?? parsedDue.date,
      formValues.due_time ?? parsedDue.time
    );
    const pushValues = {
      ...formValues,
      source_item_id: selectedValue,
      task_title: previewTaskTitle,
      task_description: previewDescription,
      due_hint: resolvedDueValue || previewDueHint,
      device_time_zone: getDeviceTimeZone(),
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="mt-1 w-full max-w-[640px]"
      >
        <div className="w-full text-[13px] text-[rgb(32,32,32)]">
          <div className="flex items-start gap-2 px-1 py-1">
            <img
              src="/clickup-removebg-preview.png"
              alt=""
              aria-hidden="true"
              className="mt-[3px] h-3.5 w-3.5 object-contain"
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-slate-500">Will create subtask:</span>
                {editingField === "title" ? (
                  <input
                    type="text"
                    value={previewTaskTitle}
                    onChange={(event) => handleChange("task_title", event.target.value)}
                    onBlur={() => setEditingField(null)}
                    className="min-w-0 flex-1 border-b border-slate-200 bg-transparent px-0 py-0.5 font-medium focus-visible:outline-none"
                    autoFocus
                  />
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate font-medium">{previewTaskTitle || "Untitled subtask"}</span>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setEditingField("title")}
                      className="text-slate-400 transition-colors hover:text-[rgb(32,32,32)]"
                      aria-label="Edit subtask title"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="shrink-0 text-slate-500">Under lead:</span>
                <span className="min-w-0 flex-1 truncate font-medium">{selectedLabel}</span>
                {hasOverrideOptions && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setShowResolverOverride((value) => !value);
                      setEditingField("lead");
                    }}
                    className="text-slate-400 transition-colors hover:text-[rgb(32,32,32)]"
                    aria-label="Change target lead"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="shrink-0 text-slate-500">Due:</span>
                {editingField === "due" ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      type="date"
                      value={formValues.due_date ?? parsedDue.date}
                      onChange={(event) => handleChange("due_date", event.target.value)}
                      className="rounded-[8px] border border-slate-200 bg-transparent px-2 py-1 text-[12px] font-medium focus-visible:outline-none"
                      autoFocus
                    />
                    <input
                      type="time"
                      value={formValues.due_time ?? parsedDue.time}
                      onChange={(event) => handleChange("due_time", event.target.value)}
                      className="rounded-[8px] border border-slate-200 bg-transparent px-2 py-1 text-[12px] font-medium focus-visible:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        handleChange(
                          "due_hint",
                          toOffsetDateTime(
                            formValues.due_date ?? parsedDue.date,
                            formValues.due_time ?? parsedDue.time
                          )
                        );
                        setEditingField(null);
                      }}
                      className="text-[11px] font-medium text-slate-500 transition-colors hover:text-[rgb(32,32,32)]"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate font-medium">{parsedDue.label}</span>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setEditingField("due")}
                      className="text-slate-400 transition-colors hover:text-[rgb(32,32,32)]"
                      aria-label="Edit due time"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>

              {previewDescription && (
                <div className="flex items-start gap-2 pt-1">
                  <span className="shrink-0 text-slate-500">Notes:</span>
                  {editingField === "notes" ? (
                    <div className="min-w-0 flex-1 space-y-2">
                      <textarea
                        value={previewDescription}
                        onChange={(event) => handleChange("task_description", event.target.value)}
                        onBlur={() => setEditingField(null)}
                        rows={6}
                        className="min-h-[120px] w-full rounded-[10px] border border-slate-200 bg-transparent px-3 py-2 text-[12px] leading-5 text-slate-600 focus-visible:outline-none"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1 whitespace-pre-wrap text-[12px] leading-5 text-slate-600">
                        {previewDescription}
                      </div>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => setEditingField("notes")}
                        className="text-slate-400 transition-colors hover:text-[rgb(32,32,32)]"
                        aria-label="Edit notes"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="ml-6 mt-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit(pushValues)}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[rgb(38,38,38)] px-3.5 text-[11px] font-medium text-white shadow-[0_1px_3px_rgba(15,15,15,0.08)] transition-colors hover:bg-[rgb(28,28,28)] disabled:opacity-60"
              aria-label="Push lead"
            >
              <span>Push</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        {showResolverOverride && (
          <div className="ml-6 flex flex-col gap-2 pb-1 pt-2 text-[12px] text-[rgb(32,32,32)]">
            {candidates.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-slate-500">Use existing:</span>
                <select
                  disabled={isSubmitting}
                  value={selectedValue}
                  onChange={(event) => handleChange("source_item_id", event.target.value)}
                  className="min-w-0 flex-1 appearance-none bg-transparent px-0 py-1 text-[12px] font-medium text-[rgb(32,32,32)] focus-visible:outline-none"
                >
                  {candidates.map((candidate: any) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() =>
                    handleSubmit({
                      ...pushValues,
                      source_item_id: selectedValue,
                    })
                  }
                  className="ml-auto inline-flex h-8 items-center justify-center rounded-[8px] bg-[rgb(32,32,32)] px-3 text-[11px] font-medium text-white transition-colors hover:bg-black disabled:opacity-60"
                  aria-label="Push selected lead"
                >
                  Push
                </button>
              </div>
            )}
            {proposedSourceItem?.name && (
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-slate-500">Create new:</span>
                <div className="min-w-0 flex-1 truncate px-0 py-1 text-left text-[12px] font-medium text-[rgb(32,32,32)]">
                  {proposedSourceItem.name}
                </div>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() =>
                    handleSubmit({
                      ...pushValues,
                      resolver_mode: "create",
                      create_new_name: proposedSourceItem.name,
                    })
                  }
                  className="ml-auto inline-flex h-8 items-center justify-center rounded-[8px] bg-[rgb(32,32,32)] px-3 text-[11px] font-medium text-white transition-colors hover:bg-black disabled:opacity-60"
                  aria-label="Create proposed lead"
                >
                  Push
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-slate-500">{resolverMode === "create" ? "Create by name:" : "Search by name:"}</span>
              <input
                type="text"
                value={resolverMode === "create" ? createName : searchName}
                onChange={(event) =>
                  handleChange(resolverMode === "create" ? "create_new_name" : "search_name", event.target.value)
                }
                placeholder={resolverMode === "create" ? "Create new lead" : "Search lead name"}
                className="min-w-0 flex-1 border-b border-slate-200 bg-transparent px-0 py-1 text-[12px] font-medium text-[rgb(32,32,32)] placeholder:text-slate-400 focus-visible:outline-none"
              />
              <div className="inline-flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => handleChange("resolver_mode", "search")}
                  className={`rounded-[6px] px-2 py-1 ${resolverMode === "search" ? "bg-slate-100 text-[rgb(32,32,32)]" : "text-slate-500"}`}
                >
                  Search
                </button>
                <button
                  type="button"
                  onClick={() => handleChange("resolver_mode", "create")}
                  className={`rounded-[6px] px-2 py-1 ${resolverMode === "create" ? "bg-slate-100 text-[rgb(32,32,32)]" : "text-slate-500"}`}
                >
                  Create
                </button>
              </div>
              <button
                type="button"
                disabled={isSubmitting || !(resolverMode === "create" ? createName.trim() : searchName.trim())}
                onClick={() =>
                  handleSubmit({
                    ...pushValues,
                    resolver_mode: resolverMode,
                    search_name: searchName.trim(),
                    create_new_name: createName.trim(),
                  })
                }
                className="ml-auto inline-flex h-8 items-center justify-center rounded-[8px] bg-[rgb(32,32,32)] px-3 text-[11px] font-medium text-white transition-colors hover:bg-black disabled:opacity-60"
                aria-label={resolverMode === "create" ? "Create lead" : "Search lead"}
              >
                Push
              </button>
            </div>
          </div>
        )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="bg-slate-50/80 border border-white/60 rounded-[34px] p-6 shadow-[0_30px_60px_rgba(15,15,15,0.18)]"
    >
      <div className="flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-muted-foreground" />
        <p className="text-[9px] font-black tracking-[0.5em] uppercase text-muted-foreground">
          Action required
        </p>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-slate-900">
        {message}
      </p>
      {plan && plan.details && (
        <div className="mt-4 space-y-2 text-xs text-slate-600">
          {plan.details.map((detail, index) => (
            <p key={index} className="leading-snug">
              {detail}
            </p>
          ))}
        </div>
      )}
      {isPlanApproval && (
        <div className="mt-4 space-y-3">
          {(preview?.name || preview?.date || preview?.tags?.length || preview?.recurrence) && (
            <div className="rounded-xl border border-slate-200 bg-white/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Details</div>
              <div className="mt-1 space-y-1 text-xs text-slate-700">
                {preview?.name && <div>Name: {preview.name}</div>}
                {preview?.date && <div>When: {preview.date}</div>}
                {formatPreviewDateTime(preview?.start) && <div>Start: {formatPreviewDateTime(preview.start)}</div>}
                {formatPreviewDateTime(preview?.due) && <div>End: {formatPreviewDateTime(preview.due)}</div>}
                {preview?.recurrence && <div>Repeat: {preview.recurrence}</div>}
                {Array.isArray(preview?.tags) && preview.tags.length > 0 && (
                  <div>Tags: {preview.tags.join(", ")}</div>
                )}
                {preview?.description && (
                  <div className="line-clamp-3">Description: {preview.description}</div>
                )}
              </div>
            </div>
          )}
          <div className="text-xs text-slate-500">
            Destination: {suggestedTargetLabel || "Use suggested target"}
          </div>
          {goalDeltas.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Delta</div>
              <div className="mt-1 space-y-1 text-xs text-slate-700">
                {goalDeltas.slice(0, 3).map((delta: any) => (
                  <div key={`${delta.metric}-${delta.period}`}>
                    {delta.metric}: {delta.actual}/{delta.target} ({delta.period})
                  </div>
                ))}
              </div>
            </div>
          )}

          {showModify && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  Modify request
                </label>
                <textarea
                  disabled={isSubmitting}
                  value={formValues.modify_request ?? ""}
                  onChange={(event) => handleChange("modify_request", event.target.value)}
                  placeholder="e.g., Move this to next Tuesday at 2pm and shorten the title"
                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm focus-visible:outline-none min-h-20"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  Rename title
                </label>
                <input
                  disabled={isSubmitting}
                  value={formValues.rename_to ?? ""}
                  onChange={(event) => handleChange("rename_to", event.target.value)}
                  placeholder="Short clear title"
                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm focus-visible:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    Start
                  </label>
                  <input
                    disabled={isSubmitting}
                    type="datetime-local"
                    value={formValues.start_at ?? ""}
                    onChange={(event) => handleChange("start_at", event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm focus-visible:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    End
                  </label>
                  <input
                    disabled={isSubmitting}
                    type="datetime-local"
                    value={formValues.end_at ?? ""}
                    onChange={(event) => handleChange("end_at", event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm focus-visible:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    Repeat
                  </label>
                  <select
                    disabled={isSubmitting}
                    value={formValues.recurrence ?? ""}
                    onChange={(event) => handleChange("recurrence", event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm focus-visible:outline-none"
                  >
                    <option value="">No change</option>
                    <option value="none">None</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    Assignee ID
                  </label>
                  <input
                    disabled={isSubmitting}
                    value={formValues.assignee_id ?? ""}
                    onChange={(event) => handleChange("assignee_id", event.target.value)}
                    placeholder="ClickUp assignee ID"
                    className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm focus-visible:outline-none"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  Description override
                </label>
                <textarea
                  disabled={isSubmitting}
                  value={formValues.description_override ?? ""}
                  onChange={(event) => handleChange("description_override", event.target.value)}
                  placeholder="Optional custom description for this task"
                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm focus-visible:outline-none min-h-20"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  Destination space
                </label>
                <select
                  disabled={isSubmitting}
                  value={formValues.target_space_id ?? ""}
                  onChange={(event) => handleChange("target_space_id", event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm focus-visible:outline-none"
                >
                  <option value="">Use suggested space</option>
                  {overrideSpaces.map((space: any) => (
                    <option key={space.id} value={space.id}>
                      {space.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  Destination list
                </label>
                <select
                  disabled={isSubmitting}
                  value={formValues.target_list_id ?? ""}
                  onChange={(event) => handleChange("target_list_id", event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm focus-visible:outline-none"
                >
                  <option value="">Use suggested target</option>
                  {filteredLists.map((entry: any) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label || entry.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={isSubmitting}
              className="flex-1 rounded-2xl px-6 py-3 bg-black text-white transition-colors hover:bg-neutral-900 focus-visible:outline-none"
              onClick={() => handleSubmit({ ...formValues, approval: "confirm" })}
            >
              {isSubmitting ? "Approving…" : "Approve →"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isSubmitting}
              className="rounded-2xl px-4 py-3"
              onClick={() => setShowModify((prev) => !prev)}
            >
              {showModify ? "Hide modify" : "Modify"}
            </Button>
            {showModify && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={isSubmitting}
                className="rounded-2xl px-4 py-3"
                onClick={() => handleSubmit({ ...formValues })}
              >
                Refresh
              </Button>
            )}
          </div>
        </div>
      )}

      {!isPlanApproval && inlineFields.length > 0 && (
        <div className="mt-4 space-y-3">
          {inlineFields.map((field) => (
            <div key={field.name} className="space-y-1">
              <label className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                {field.label}
              </label>
              {field.name === "target_list_id" && suggestedTargetLabel && (
                <p className="text-xs text-slate-500">Suggested: {suggestedTargetLabel}</p>
              )}
              {field.type === "select" ? (
                <select
                  disabled={isSubmitting}
                  value={formValues[field.name] ?? ""}
                  onChange={(event) => handleChange(field.name, event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm focus-visible:outline-none"
                >
                  <option value="">
                    Use suggested target
                  </option>
                  {(field.options || []).map((option) => {
                    const [value, label] = option.includes("|") ? option.split("|") : [option, option];
                    return (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <input
                  disabled={isSubmitting}
                  type={field.type === "number" ? "number" : "text"}
                  value={formValues[field.name] ?? ""}
                  placeholder={field.placeholder}
                  onChange={(event) => handleChange(field.name, event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm focus-visible:outline-none"
                />
              )}
            </div>
          ))}
          <Button
            size="sm"
            disabled={isSubmitting}
            className="w-full rounded-2xl px-6 py-3 bg-black text-white transition-colors hover:bg-neutral-900 focus-visible:outline-none"
            onClick={() => handleSubmit(plan ? { ...formValues, approval: "confirm" } : formValues)}
          >
            {plan ? (isSubmitting ? 'Approving…' : 'Approve →') : (isSubmitting ? 'Submitting…' : 'Submit details')}
          </Button>
        </div>
      )}
      {!inlineFields.length && onOpenSettings && (
        <Button
          size="sm"
          className="mt-6 w-full rounded-2xl px-6 py-3 bg-black text-white shadow-[0_20px_40px_rgba(0,0,0,0.25)] transition-colors hover:bg-neutral-800"
          onClick={onOpenSettings}
        >
          Open Settings
        </Button>
      )}
    </motion.div>
  );
};

export default ActionNeededCard;
