import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { ChatMessage } from "./ChatView";
import { useState } from "react";

interface ActionNeededCardProps {
  action: NonNullable<ChatMessage["actionNeeded"]>;
  onOpenSettings?: () => void;
  onInlineSubmit?: (values: Record<string, string>) => Promise<void> | void;
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
  const inlineFields = action.metadata?.fields ?? action.fields ?? [];
  const isPlanApproval = Boolean(plan);
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
