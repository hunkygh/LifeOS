import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, RefreshCw, Loader2, List as ListIcon } from "lucide-react";
import { Button } from "./ui/button";
import { supabase } from "../integrations/supabase/client";
import { DEFAULT_USER_ID } from "../config/defaultUser";
import type { ReceiptSummary } from "./ChatView";
import {
  ListConfigSchema,
  DEFAULT_LIST_CONFIG,
  formatPreferencesJson,
  goalsToText,
} from "../lib/listConfig";

interface ClickUpList {
  id: string;
  clickup_list_id: string;
  title: string;
  reference_name?: string | null;
  context: string | null;
  instructions: string | null;
  preferences: string | null;
  goals: any[];
  space_id?: string | null;
  metadata?: Record<string, any> | null;
}

interface ClickUpWorkspace {
  id: string;
  clickup_workspace_id: string;
  name: string | null;
  metadata?: Record<string, any> | null;
}

interface ClickUpSpaceNode {
  id: string;
  name: string;
  context: string | null;
  instructions: string | null;
  preferences: string | null;
  goals: any[];
  clickup_space_id: string | null;
  clickup_lists: ClickUpList[];
  is_virtual?: boolean;
}


type Target =
  | { type: "space"; area: ClickUpSpaceNode }
  | { type: "list"; area: ClickUpSpaceNode; list: ClickUpList };

type FormValues = {
  context: string;
  instructions: string;
  preferences: string;
  goals: string;
  itemSingular: string;
  itemPlural: string;
  dueDatePolicy: "required" | "optional" | "forbid";
  descriptionMode: "compact" | "detailed";
  includeSource: boolean;
  maxWords: string;
  maxChars: string;
  namingPrefix: string;
  leadTitleMode: "default" | "company_only";
  leadFollowupSubtask: boolean;
};

const DEFAULT_FORM: FormValues = {
  context: "",
  instructions: "",
  preferences: "",
  goals: "",
  itemSingular: "task",
  itemPlural: "tasks",
  dueDatePolicy: "optional",
  descriptionMode: "compact",
  includeSource: true,
  maxWords: "8",
  maxChars: "32",
  namingPrefix: "",
  leadTitleMode: "default",
  leadFollowupSubtask: false,
};

const FIELD_DEFINITIONS: { label: string; key: keyof FormValues; rows: number; placeholder?: string }[] = [
  { label: "Context", key: "context", rows: 3 },
  { label: "Goals", key: "goals", rows: 3, placeholder: "metric|target|period (e.g. protein|170|daily)" },
  { label: "Instructions", key: "instructions", rows: 3 },
];

const panelVariants = {
  hidden: (offset: number) => ({
    x: offset,
    opacity: 0,
    transition: { x: { type: "spring", damping: 22, stiffness: 320, mass: 0.8 }, opacity: { duration: 0.12 } },
  }),
  visible: {
    x: 0,
    opacity: 1,
    transition: { type: "spring", damping: 25, stiffness: 270, mass: 1 },
  },
  exit: (offset: number) => ({
    x: offset,
    opacity: 0,
    transition: { x: { type: "spring", damping: 35, stiffness: 430, mass: 1 }, opacity: { duration: 0.1 } },
  }),
};

const PRIMARY_WORKSPACE_EXACT_NAME = "life os";
const PRIMARY_WORKSPACE_ID = import.meta.env.VITE_CLICKUP_WORKSPACE_ID || "";

const displayListName = (list: ClickUpList) => {
  const sourceName = (list.metadata as any)?.source_name;
  const value = list.title || list.reference_name || sourceName || null;
  if (value && value !== "ClickUp list") return value;
  return list.clickup_list_id ? `List ${list.clickup_list_id}` : "Untitled list";
};

const SlideOutPanel = ({ isOpen, onClose, type, position, artifactReceipt }: SlideOutPanelProps) => {
  const [spaceNodes, setSpaceNodes] = useState<ClickUpSpaceNode[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<Target | null>(null);
  const [formValues, setFormValues] = useState<FormValues>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [primaryWorkspace, setPrimaryWorkspace] = useState<ClickUpWorkspace | null>(null);
  const [primaryWorkspaceId, setPrimaryWorkspaceId] = useState<string | null>(null);
  const [expandedAreaIds, setExpandedAreaIds] = useState<string[]>([]);
  const [workspaceList, setWorkspaceList] = useState<ClickUpWorkspace[]>([]);
  const [showOtherWorkspaces, setShowOtherWorkspaces] = useState(false);
  const [hasUserInput, setHasUserInput] = useState(false);
  const autoSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const panelRadiusClass = "rounded-[32px]";
  const panelOffset = position === "left" ? -400 : 400;

  const workspaceNameMatchesPrimary = (name?: string | null) => {
    if (!name) return false;
    return name.trim().toLowerCase() === PRIMARY_WORKSPACE_EXACT_NAME;
  };

  const resolvePrimaryWorkspace = (
    workspaceList: ClickUpWorkspace[],
    preferredId?: string | null
  ) => {
    if (!workspaceList.length) return null;

    if (PRIMARY_WORKSPACE_ID) {
      const byConfiguredId = workspaceList.find(
        (workspace) => workspace.clickup_workspace_id === PRIMARY_WORKSPACE_ID
      );
      if (byConfiguredId) return byConfiguredId;
    }

    if (preferredId) {
      const existing = workspaceList.find((workspace) => workspace.clickup_workspace_id === preferredId);
      if (existing) return existing;
    }

    const exactMatch = workspaceList.find((workspace) =>
      workspaceNameMatchesPrimary(workspace.name)
    );
    return exactMatch || null;
  };

  const applyPrimaryWorkspace = (workspace: ClickUpWorkspace | null) => {
    setPrimaryWorkspace(workspace);
    setPrimaryWorkspaceId(workspace?.clickup_workspace_id || null);
  };

  const reselectTarget = (candidate: Target | null, areas: ClickUpSpaceNode[]) => {
    if (!areas.length) {
      setSelectedTarget(null);
      return;
    }

    if (!candidate) {
      setSelectedTarget({ type: "space", area: areas[0] });
      return;
    }

    const area = areas.find((entry) => entry.id === candidate.area.id);
    if (!area) {
      setSelectedTarget({ type: "space", area: areas[0] });
      return;
    }

    if (candidate.type === "space") {
      setSelectedTarget({ type: "space", area });
      return;
    }

    const list = area.clickup_lists?.find((entry) => entry.id === candidate.list?.id);
    if (list) {
      setSelectedTarget({ type: "list", area, list });
    } else {
      setSelectedTarget({ type: "space", area });
    }
  };

  const fetchSpaceNodes = async (targetToKeep: Target | null = null) => {
    setLoading(true);
    try {
      const userId = DEFAULT_USER_ID;
      const preserve = targetToKeep ?? selectedTarget;

      let { data: workspaceData, error: workspaceError } = await supabase
        .from("clickup_workspaces")
        .select("id, clickup_workspace_id, name, metadata")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (workspaceError) {
        console.error("Workspace fetch failed", workspaceError);
      }
      if (!workspaceData?.length) {
        const fallback = await supabase
          .from("clickup_workspaces")
          .select("id, clickup_workspace_id, name, metadata")
          .order("created_at", { ascending: true });
        workspaceData = fallback.data || [];
      }

      workspaceData = (workspaceData || []).filter((workspace: any) => {
        if (PRIMARY_WORKSPACE_ID) {
          return workspace.clickup_workspace_id === PRIMARY_WORKSPACE_ID;
        }
        if (workspace?.metadata?.single_tenant_target) {
          return true;
        }
        return workspaceNameMatchesPrimary(workspace.name);
      });

      const workspaces = workspaceData || [];
      setWorkspaceList(workspaces);
      const primary = resolvePrimaryWorkspace(workspaces, primaryWorkspaceId);
      applyPrimaryWorkspace(primary);

      if (!primary) {
        setSpaceNodes([]);
        setSelectedTarget(null);
        setSyncMessage("Life OS workspace not found. Set VITE_CLICKUP_WORKSPACE_ID / APP_CLICKUP_WORKSPACE_ID.");
        return;
      }

      let { data: spacesData, error: spaceError } = await supabase
        .from("clickup_spaces")
        .select("clickup_space_id, name, workspace_id, metadata")
        .eq("user_id", userId)
        .eq("workspace_id", primary.clickup_workspace_id)
        .order("created_at", { ascending: true });

      if (spaceError) {
        console.error("Space fetch failed", spaceError);
      }
      if (!spacesData?.length) {
        const fallback = await supabase
          .from("clickup_spaces")
          .select("clickup_space_id, name, workspace_id, metadata")
          .eq("workspace_id", primary.clickup_workspace_id)
          .order("created_at", { ascending: true });
        spacesData = fallback.data || [];
      }

      const allSpaces = (spacesData || []) as Array<{ clickup_space_id: string; name: string | null; workspace_id?: string | null; metadata?: Record<string, any> | null }>;
      const spaceRows = allSpaces;
      const spaceIds = (spaceRows || [])
        .map((row) => row.clickup_space_id)
        .filter((value): value is string => Boolean(value));

      if (!spaceIds.length) {
        setSpaceNodes([]);
        setSelectedTarget(null);
      } else {
        let listRows: ClickUpList[] = [];
        let { data: listsData, error: listsError } = await supabase
          .from("clickup_lists")
          .select("id, clickup_list_id, title, reference_name, context, instructions, preferences, goals, space_id, metadata")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });

        if (listsError) {
          console.error("List fetch failed", listsError);
        }
        if (!listsData?.length) {
          const fallback = await supabase
            .from("clickup_lists")
            .select("id, clickup_list_id, title, reference_name, context, instructions, preferences, goals, space_id, metadata")
            .order("updated_at", { ascending: false });
          listsData = fallback.data || [];
        }
        listRows = (listsData as ClickUpList[]) || [];

        const listsBySpace = new Map<string, ClickUpList[]>();
        listRows.forEach((list) => {
          const spaceId =
            list.space_id ||
            (list.metadata as any)?.space_id ||
            null;
          if (spaceId) {
            const existingBySpace = listsBySpace.get(spaceId) || [];
            existingBySpace.push(list);
            listsBySpace.set(spaceId, existingBySpace);
          }
        });

        const normalizedFromSpaces: ClickUpSpaceNode[] = spaceRows.map((space) => {
          const areaMetadata = (space.metadata || {}) as Record<string, any>;
          const areaId = `space-${space.clickup_space_id}`;
          const areaLists = (listsBySpace.get(space.clickup_space_id) || [])
            .filter((list, index, arr) => arr.findIndex((entry) => entry.id === list.id) === index);
          return {
            id: areaId,
            name: space.name || "Untitled space",
            context: areaMetadata.context || null,
            instructions: areaMetadata.instructions || null,
            preferences: areaMetadata.preferences || null,
            goals: Array.isArray(areaMetadata.goals) ? areaMetadata.goals : [],
            clickup_space_id: space.clickup_space_id,
            clickup_lists: areaLists,
            is_virtual: true,
          };
        });
        setSpaceNodes(normalizedFromSpaces);
        reselectTarget(preserve, normalizedFromSpaces);
      }
    } catch (error) {
      console.error("Error fetching spaces/lists:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncSpaces = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncMessage("Syncing spaces and lists from ClickUp…");
    try {
      const { data, error } = await supabase.functions.invoke("sync-clickup", {
        body: { userId: DEFAULT_USER_ID },
      });

      if (error || !data?.success) {
        throw error || new Error(data?.error || "Sync failed");
      }

      if (data.workspaces) {
        const primary = resolvePrimaryWorkspace(data.workspaces, primaryWorkspaceId);
        applyPrimaryWorkspace(primary);
      }

      await fetchSpaceNodes(selectedTarget);
      setSyncMessage(
        `Synced ${data.synced_workspaces ?? data.workspaces?.length ?? 0} workspace(s) · ${data.total_spaces ?? 0} spaces · ${data.total_lists ?? 0} lists.`
      );
      setTimeout(() => setSyncMessage(null), 2500);
    } catch (error) {
      console.error("Sync failed", error);
      setSyncMessage("Sync failed. Check console for details.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleWorkspaceEnable = (workspace: ClickUpWorkspace) => {
    applyPrimaryWorkspace(workspace);
    fetchSpaceNodes(null);
  };

  const toggleArea = (areaId: string) => {
    setExpandedAreaIds((prev) =>
      prev.includes(areaId) ? prev.filter((id) => id !== areaId) : [...prev, areaId]
    );
  };

  const handleAreaSelect = (area: ClickUpSpaceNode) => {
    setSelectedTarget({ type: "space", area });
  };

  const handleListSelect = (area: ClickUpSpaceNode, list: ClickUpList) => {
    setSelectedTarget({ type: "list", area, list });
  };

  const handleFieldChange = (key: keyof FormValues, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    setHasUserInput(true);
  };
  const setFormValue = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    setHasUserInput(true);
  };

  const handleSave = async () => {
    if (!selectedTarget) return;
    setIsSaving(true);
    const targetBeforeSave = selectedTarget;

    try {
      if (selectedTarget.type === "space") {
        const goalsArray = formValues.goals
          .split(/\n|,/)
          .map((entry) => entry.trim())
          .filter(Boolean);
        const nextMetadata = {
          context: formValues.context || null,
          instructions: formValues.instructions || null,
          preferences: formValues.preferences || null,
          goals: goalsArray,
        };
        await supabase
          .from("clickup_spaces")
          .update({
            metadata: nextMetadata,
            updated_at: new Date().toISOString(),
          })
          .eq("clickup_space_id", selectedTarget.area.clickup_space_id);
        setSyncMessage("Space configuration saved.");
      } else {
        const parsedGoals = formValues.goals
          .split(/\n|,/)
          .map((entry) => entry.trim())
          .filter(Boolean)
          .map((entry) => {
            const [metricRaw, targetRaw, periodRaw] = entry.split("|").map((part) => part.trim());
            const target = Number(targetRaw);
            return {
              metric: metricRaw,
              target,
              period: periodRaw as "daily" | "weekly" | "monthly",
            };
          })
          .filter((goal) => goal.metric && Number.isFinite(goal.target) && ["daily", "weekly", "monthly"].includes(goal.period));
        const listConfigCandidate = {
          goals: parsedGoals,
          execution: {
            require_subtasks: formValues.leadFollowupSubtask,
            due_date_policy: formValues.dueDatePolicy,
            reminders: "none",
          },
          naming: {
            max_words: Number(formValues.maxWords || "8"),
            max_chars: Number(formValues.maxChars || "32"),
            prefix: formValues.namingPrefix || null,
          },
          description: {
            mode: formValues.descriptionMode,
            include_source: formValues.includeSource,
          },
          terminology: {
            item_singular: formValues.itemSingular || "task",
            item_plural: formValues.itemPlural || "tasks",
          },
          behavior: {
            lead_title_mode: formValues.leadTitleMode,
            lead_followup_subtask: formValues.leadFollowupSubtask,
          },
        };
        const listConfigResult = ListConfigSchema.safeParse(listConfigCandidate);
        if (!listConfigResult.success) {
          setSyncMessage(`Save failed: ${listConfigResult.error.issues[0]?.message || "Invalid list config"}`);
          setIsSaving(false);
          return;
        }
        const listConfig = listConfigResult.data;
        const existingMetadata =
          selectedTarget.list.metadata && typeof selectedTarget.list.metadata === "object"
            ? selectedTarget.list.metadata
            : {};
        await supabase
          .from("clickup_lists")
          .update({
            context: formValues.context || null,
            instructions: formValues.instructions || null,
            preferences: JSON.stringify({
              execution: listConfig.execution,
              naming: listConfig.naming,
              description: listConfig.description,
            }),
            goals: listConfig.goals,
            metadata: {
              ...existingMetadata,
              list_config: listConfig,
            },
          })
          .eq("id", selectedTarget.list.id);
        setSyncMessage("List configuration saved.");
      }
      await fetchSpaceNodes(targetBeforeSave);
      setTimeout(() => setSyncMessage(null), 2500);
      setHasUserInput(false);
    } catch (error) {
      console.error("Config save failed", error);
      setSyncMessage("Save failed. See console for details.");
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (autoSaveTimeout.current) {
      clearTimeout(autoSaveTimeout.current);
    }

    if (!selectedTarget || !hasUserInput) {
      return;
    }

    autoSaveTimeout.current = setTimeout(() => {
      handleSave();
    }, 2000);

    return () => {
      if (autoSaveTimeout.current) {
        clearTimeout(autoSaveTimeout.current);
      }
    };
  }, [formValues, selectedTarget, hasUserInput]);

  useEffect(() => {
    if (isOpen && type === "settings") {
      fetchSpaceNodes();
    }
  }, [isOpen, type]);

  useEffect(() => {
    if (!selectedTarget) {
      setFormValues(DEFAULT_FORM);
      setHasUserInput(false);
      return;
    }

    const source = selectedTarget.type === "space" ? selectedTarget.area : selectedTarget.list;
    const listConfig =
      selectedTarget.type === "list" &&
      selectedTarget.list.metadata &&
      typeof selectedTarget.list.metadata === "object" &&
      (selectedTarget.list.metadata as any).list_config
        ? (selectedTarget.list.metadata as any).list_config
        : DEFAULT_LIST_CONFIG;
    const mergedListConfig = {
      ...DEFAULT_LIST_CONFIG,
      ...listConfig,
      goals: Array.isArray(source.goals) ? source.goals : [],
    };
    setFormValues({
      context: source.context || "",
      instructions: source.instructions || "",
      preferences:
        selectedTarget.type === "list"
          ? formatPreferencesJson(mergedListConfig)
          : source.preferences || "",
      goals: goalsToText(source.goals),
      itemSingular: mergedListConfig.terminology?.item_singular || "task",
      itemPlural: mergedListConfig.terminology?.item_plural || "tasks",
      dueDatePolicy: mergedListConfig.execution?.due_date_policy || "optional",
      descriptionMode: mergedListConfig.description?.mode || "compact",
      includeSource: Boolean(mergedListConfig.description?.include_source),
      maxWords: String(mergedListConfig.naming?.max_words ?? 8),
      maxChars: String(mergedListConfig.naming?.max_chars ?? 32),
      namingPrefix: mergedListConfig.naming?.prefix || "",
      leadTitleMode: mergedListConfig.behavior?.lead_title_mode || "default",
      leadFollowupSubtask: Boolean(mergedListConfig.behavior?.lead_followup_subtask),
    });
    setHasUserInput(false);
  }, [selectedTarget]);

  const renderSpaceList = () => (
    <div className="rounded-[30px] border border-white/70 bg-white/90 p-4">
      {loading ? (
        <p className="text-sm text-slate-500">Loading spaces…</p>
      ) : !spaceNodes.length ? (
        <p className="text-sm text-slate-500">No synced spaces yet. Sync to pull them down.</p>
      ) : (
        <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
          {spaceNodes.map((area) => {
            const areaLists = area.clickup_lists || [];
            const isSelectedSpace = selectedTarget?.type === "space" && selectedTarget.area.id === area.id;
            const isExpanded = expandedAreaIds.includes(area.id);

            return (
              <div key={area.id} className="space-y-1">
                <div className="space-y-0 rounded-[20px] border border-slate-100 bg-slate-50/50">
                  <div className="flex items-center gap-2 px-4 py-3">
                    <button
                      type="button"
                      aria-label={isExpanded ? "Collapse lists" : "Expand lists"}
                      onClick={() => toggleArea(area.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-[14px] border border-transparent bg-slate-100 text-slate-400 transition hover:border-slate-200 hover:bg-slate-50"
                    >
                      {isExpanded ? "▾" : "▸"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAreaSelect(area)}
                      className={`flex-1 text-left text-sm font-semibold tracking-tight transition-colors ${
                        isSelectedSpace
                          ? "text-slate-900"
                          : "text-slate-700 hover:text-slate-900"
                      }`}
                    >
                      {area.name || "Untitled space"}
                    </button>
                  </div>
                  {isExpanded && areaLists.length > 0 && (
                    <div className="space-y-2 border-t border-slate-200 px-4 pb-3">
                      {areaLists.map((list) => {
                        const isSelectedList = selectedTarget?.type === "list" && selectedTarget.list?.id === list.id;
                        return (
                          <button
                            key={list.id}
                            onClick={() => handleListSelect(area, list)}
                            type="button"
                            className={`flex w-full items-center justify-between rounded-[14px] px-3 py-2 text-sm transition ${
                              isSelectedList
                                ? "bg-white text-slate-900"
                                : "bg-transparent text-slate-500 hover:bg-white"
                            }`}
                          >
                            <span className="flex items-center gap-2 text-[13px] text-slate-700">
                              <ListIcon className="h-4 w-4 text-slate-400" />
                              <span>{displayListName(list)}</span>
                            </span>
                            <span className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                              {list.goals?.length ?? 0} goals
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  );
  const renderDetailPanel = () => {
    if (!selectedTarget) {
      return (
        <div className="relative overflow-hidden rounded-[34px] border border-white/60 bg-white/70 shadow-[0_12px_40px_rgba(15,15,15,0.08)] min-h-[360px]">
          <div className="absolute inset-3 rounded-[30px] bg-gradient-to-br from-white/80 to-white/70 opacity-70" />
          <div className="relative z-10 p-6 flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">Select a space or a list to configure its context.</p>
          </div>
        </div>
      );
    }

    const headerText =
      selectedTarget.type === "space" ? selectedTarget.area.name : displayListName(selectedTarget.list);

    return (
      <div className="rounded-[34px] border border-white/60 bg-white/70 min-h-[360px]">
        <div className="flex flex-col gap-5 p-6">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Configure {selectedTarget.type === "space" ? "Space" : "List"}</p>
            <h3 className="text-2xl font-semibold text-foreground">{headerText}</h3>
            <p className="text-xs text-slate-500 uppercase tracking-[0.2em]">
              {selectedTarget.type === "space"
                ? selectedTarget.area.clickup_space_id || "No space ID"
                : selectedTarget.list.clickup_list_id || "No list ID"}
            </p>
          </div>
          <div className="space-y-4">
            {FIELD_DEFINITIONS.map((field) => (
              <div key={field.label} className="space-y-2">
                <label className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{field.label}</label>
                <div className="rounded-2xl border border-slate-200 bg-white/90 p-1">
                  <textarea
                    value={formValues[field.key]}
                    onChange={(event) => handleFieldChange(field.key, event.target.value)}
                    className="w-full resize-none border-none bg-transparent px-3 py-2 text-sm focus:outline-none"
                    rows={field.rows}
                    placeholder={field.placeholder}
                  />
                </div>
              </div>
            ))}
            {selectedTarget.type === "list" && (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 space-y-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Terminology</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Singular label</label>
                      <input
                        value={formValues.itemSingular}
                        onChange={(event) => setFormValue("itemSingular", event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none"
                        placeholder="lead"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Plural label</label>
                      <input
                        value={formValues.itemPlural}
                        onChange={(event) => setFormValue("itemPlural", event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none"
                        placeholder="leads"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 space-y-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Naming behavior</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Lead title mode</label>
                      <select
                        value={formValues.leadTitleMode}
                        onChange={(event) => setFormValue("leadTitleMode", event.target.value as FormValues["leadTitleMode"])}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none"
                      >
                        <option value="default">Default</option>
                        <option value="company_only">Company only</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Title prefix</label>
                      <input
                        value={formValues.namingPrefix}
                        onChange={(event) => setFormValue("namingPrefix", event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none"
                        placeholder="optional"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Max words</label>
                      <input
                        type="number"
                        value={formValues.maxWords}
                        onChange={(event) => setFormValue("maxWords", event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Max chars</label>
                      <input
                        type="number"
                        value={formValues.maxChars}
                        onChange={(event) => setFormValue("maxChars", event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 space-y-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Execution rules</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Due date policy</label>
                      <select
                        value={formValues.dueDatePolicy}
                        onChange={(event) => setFormValue("dueDatePolicy", event.target.value as FormValues["dueDatePolicy"])}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none"
                      >
                        <option value="optional">Optional</option>
                        <option value="required">Required</option>
                        <option value="forbid">Forbidden</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Description mode</label>
                      <select
                        value={formValues.descriptionMode}
                        onChange={(event) => setFormValue("descriptionMode", event.target.value as FormValues["descriptionMode"])}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none"
                      >
                        <option value="compact">Compact</option>
                        <option value="detailed">Detailed</option>
                      </select>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={formValues.includeSource}
                      onChange={(event) => setFormValue("includeSource", event.target.checked)}
                    />
                    Include source text in description
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={formValues.leadFollowupSubtask}
                      onChange={(event) => setFormValue("leadFollowupSubtask", event.target.checked)}
                    />
                    Auto-create follow-up subtask for leads
                  </label>
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="bg-slate-900 text-white shadow-none hover:bg-slate-800 focus-visible:ring-0 focus-visible:ring-offset-0"
            >
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderReceiptSummary = (receipt: ReceiptSummary | null | undefined) => {
    if (!receipt) {
      return (
        <div className="h-full overflow-y-auto p-6">
          <h2 className="text-2xl font-bold mb-4">Artifacts</h2>
          <p className="text-sm text-muted-foreground">
            Open a receipt from the chat thread to inspect what LifeOS staged or wrote into ClickUp.
          </p>
        </div>
      );
    }

    return (
      <div className="h-full overflow-y-auto p-6">
        <div className="flex items-center justify-between gap-4 pb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-slate-400">Receipt</p>
            <h2 className="mt-2 text-2xl font-semibold text-[rgb(32,32,32)]">{receipt.title}</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="p-2 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,15,15,0.05)]">
          <div className="space-y-1">
            <div className="text-[12px] uppercase tracking-[0.24em] text-slate-400">Lead</div>
            <div className="text-[16px] font-medium text-[rgb(32,32,32)]">{receipt.leadName || "Not set"}</div>
            {receipt.leadId && <div className="text-xs text-slate-500">Task ID: {receipt.leadId}</div>}
          </div>

          <div className="space-y-1">
            <div className="text-[12px] uppercase tracking-[0.24em] text-slate-400">Comment</div>
            <div className="text-[16px] font-medium text-[rgb(32,32,32)]">
              {receipt.commentSaved ? "Saved to ClickUp" : "Not saved"}
            </div>
            {receipt.commentId && <div className="text-xs text-slate-500">Comment ID: {receipt.commentId}</div>}
          </div>

          <div className="space-y-1">
            <div className="text-[12px] uppercase tracking-[0.24em] text-slate-400">Subtask</div>
            <div className="text-[16px] font-medium text-[rgb(32,32,32)]">{receipt.subtaskName || "Not created"}</div>
            {receipt.subtaskId && <div className="text-xs text-slate-500">Task ID: {receipt.subtaskId}</div>}
          </div>

          <div className="space-y-1">
            <div className="text-[12px] uppercase tracking-[0.24em] text-slate-400">Due</div>
            <div className="text-[16px] font-medium text-[rgb(32,32,32)]">{receipt.dueLabel || "No due date"}</div>
            {receipt.deviceTimeZone && (
              <div className="text-xs text-slate-500">Timezone: {receipt.deviceTimeZone}</div>
            )}
          </div>

          {receipt.fieldsUpdated && receipt.fieldsUpdated.length > 0 && (
            <div className="space-y-1">
              <div className="text-[12px] uppercase tracking-[0.24em] text-slate-400">Lead fields updated</div>
              <div className="text-[14px] text-[rgb(32,32,32)]">{receipt.fieldsUpdated.join(", ")}</div>
            </div>
          )}

          {receipt.noteSummary && (
            <div className="space-y-1">
              <div className="text-[12px] uppercase tracking-[0.24em] text-slate-400">Summary</div>
              <div className="text-[14px] leading-6 text-[rgb(32,32,32)]">{receipt.noteSummary}</div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {receipt.leadUrl && (
              <a
                href={receipt.leadUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-[10px] border border-slate-200 px-3 py-2 text-sm text-[rgb(32,32,32)] transition-colors hover:bg-slate-50"
              >
                Open lead
              </a>
            )}
            {receipt.subtaskUrl && (
              <a
                href={receipt.subtaskUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-[10px] border border-slate-200 px-3 py-2 text-sm text-[rgb(32,32,32)] transition-colors hover:bg-slate-50"
              >
                Open subtask
              </a>
            )}
          </div>
        </div>
      </div>
    );
  };

  const panelContent = () => {
    const otherWorkspaces = workspaceList.filter(
      (workspace) => workspace.clickup_workspace_id !== primaryWorkspaceId
    );
    if (type === "artifacts") {
      return renderReceiptSummary(artifactReceipt);
    }

    return (
      <div className="h-full overflow-y-auto pr-2">
        <div className="space-y-6 pt-2">
          <div className="flex items-center justify-between pb-2">
            <p className="text-lg font-semibold uppercase tracking-[0.45em]">SETTINGS</p>
            <Button variant="ghost" size="sm" onClick={onClose} className="p-2 hover:bg-white/10">
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-semibold text-foreground leading-tight">Life OS</h2>
            </div>
            <Button
              size="sm"
              onClick={handleSyncSpaces}
              disabled={isSyncing}
              className="flex items-center gap-2 rounded-full px-4 py-1 text-xs bg-slate-900 text-white shadow-none hover:bg-slate-800"
            >
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <RefreshCw className="w-4 h-4" />}
              {isSyncing ? "Syncing…" : "Sync"}
            </Button>
          </div>
          {syncMessage && <p className="text-sm text-foreground/70">{syncMessage}</p>}
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-[300px,1fr]">
            <section className="relative overflow-hidden">
              {renderSpaceList()}
            </section>
            <section className="relative overflow-hidden">
              {renderDetailPanel()}
            </section>
          </div>
          <section className="mt-6 space-y-3 border-t border-white/40 pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Sync workspace</p>
              <Button size="sm" variant="outline" className="text-xs" onClick={handleSyncSpaces} disabled={isSyncing}>
                {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : "Refresh"}
              </Button>
            </div>
            {otherWorkspaces.length ? (
              <div className="border-t border-white/40 pt-3">
                <button
                  type="button"
                  onClick={() => setShowOtherWorkspaces((prev) => !prev)}
                  className="flex w-full items-center justify-between text-sm font-semibold text-slate-700"
                >
                  <span>{showOtherWorkspaces ? "Hide workspaces" : "Show other workspaces"}</span>
                  <span className="text-xs text-slate-400">{showOtherWorkspaces ? "▾" : "▸"}</span>
                </button>
                {showOtherWorkspaces && (
                  <div className="space-y-2 pt-3">
                    {otherWorkspaces.map((workspace) => (
                      <div
                        key={workspace.clickup_workspace_id}
                        className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm"
                      >
                        <span>{workspace.name || "Unnamed workspace"}</span>
                        <Button size="sm" variant="ghost" onClick={() => handleWorkspaceEnable(workspace)}>
                          Enable
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No other workspaces found. Add one through your ClickUp account to make it available for preview.</p>
            )}
          </section>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-20 z-40"
            onClick={onClose}
          />
            <motion.div
              custom={panelOffset}
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              drag="x"
              dragDirectionLock
              dragMomentum={false}
              dragElastic={0.15}
              onDragEnd={(_, info) => {
                if (info.offset.x > 90 || info.velocity.x > 500) {
                  onClose();
                }
              }}
              className={`${
                type === "artifacts"
                  ? "fixed left-2 right-2 top-[calc(env(safe-area-inset-top)+0.5rem)] bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] md:top-6 md:bottom-6 md:left-auto md:right-6 md:w-[430px] lg:w-[480px]"
                  : "fixed left-2 right-2 top-[calc(env(safe-area-inset-top)+0.5rem)] bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] md:inset-3"
              } ${panelRadiusClass} glass-panel soft-lift z-50 overflow-hidden p-3 md:p-6`}
            >
            {panelContent()}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SlideOutPanel;

export interface SlideOutPanelProps {
  isOpen: boolean;
  onClose: () => void;
  type: "settings" | "artifacts";
  position: "left" | "right";
  artifactReceipt?: ReceiptSummary | null;
}
