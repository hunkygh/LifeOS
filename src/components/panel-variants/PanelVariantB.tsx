import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Loader2,
  Globe,
  List as ListIcon,
  RefreshCw,
  Layers,
  ChevronDown,
} from "lucide-react";

/**
 * Variant B — "Clean Card-Based"
 *
 * Bright white surface with clearly separated cards, soft gray borders,
 * blue-500 accent for interactive elements. Inspired by Vercel's
 * project settings — stacked content cards with left sidebar navigation.
 */

const MOCK_AREAS = [
  {
    id: "1",
    name: "Health & Fitness",
    clickup_space_id: "sp_001",
    context: "Daily routines, nutrition tracking, workout plans",
    instructions: "Prioritise morning routines",
    preferences: "Metric units",
    goals: ["Run a half marathon", "Meditate daily"],
    clickup_lists: [
      {
        id: "l1",
        clickup_list_id: "cl_101",
        title: "Workouts",
        context: "Gym & home sessions",
        instructions: "",
        preferences: "",
        goals: ["3x/week strength"],
        life_area_id: "1",
      },
      {
        id: "l2",
        clickup_list_id: "cl_102",
        title: "Nutrition",
        context: "Meal prep & macros",
        instructions: "",
        preferences: "",
        goals: ["Track calories"],
        life_area_id: "1",
      },
    ],
  },
  {
    id: "2",
    name: "Career & Projects",
    clickup_space_id: "sp_002",
    context: "Professional growth, side projects",
    instructions: "",
    preferences: "",
    goals: ["Ship LifeOS v2", "Write 12 blog posts"],
    clickup_lists: [
      {
        id: "l3",
        clickup_list_id: "cl_201",
        title: "Active Sprints",
        context: "",
        instructions: "",
        preferences: "",
        goals: ["Close 5 issues/week"],
        life_area_id: "2",
      },
    ],
  },
  {
    id: "3",
    name: "Finance",
    clickup_space_id: "sp_003",
    context: "Budgets, investments, savings",
    instructions: "",
    preferences: "",
    goals: ["Save 20 % of income"],
    clickup_lists: [],
  },
];

type TargetType =
  | { kind: "everything" }
  | { kind: "space"; areaId: string }
  | { kind: "list"; areaId: string; listId: string };

const FIELDS = [
  { label: "Context", key: "context" as const, rows: 3, desc: "Background information for this area" },
  { label: "Goals", key: "goals" as const, rows: 3, placeholder: "One per line", desc: "What you want to achieve" },
  { label: "Preferences", key: "preferences" as const, rows: 2, desc: "How tasks should be handled" },
  { label: "Instructions", key: "instructions" as const, rows: 3, desc: "Specific directives for AI" },
];

const PanelVariantB = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [target, setTarget] = useState<TargetType>({ kind: "space", areaId: "1" });
  const [isSyncing, setIsSyncing] = useState(false);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set(["1"]));

  const toggleExpand = (areaId: string) => {
    setExpandedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) next.delete(areaId);
      else next.add(areaId);
      return next;
    });
  };

  const selectedArea = MOCK_AREAS.find(
    (a) =>
      (target.kind === "space" && a.id === target.areaId) ||
      (target.kind === "list" && a.id === target.areaId)
  );
  const selectedList =
    target.kind === "list"
      ? selectedArea?.clickup_lists.find((l) => l.id === target.listId)
      : null;

  const source: Record<string, string> | undefined =
    target.kind === "everything"
      ? undefined
      : target.kind === "list" && selectedList
      ? {
          context: selectedList.context || "",
          goals: (selectedList.goals ?? []).join("\n"),
          preferences: selectedList.preferences || "",
          instructions: selectedList.instructions || "",
        }
      : selectedArea
      ? {
          context: selectedArea.context || "",
          goals: (selectedArea.goals ?? []).join("\n"),
          preferences: selectedArea.preferences || "",
          instructions: selectedArea.instructions || "",
        }
      : undefined;

  const handleSync = () => {
    setIsSyncing(true);
    setTimeout(() => setIsSyncing(false), 1500);
  };

  if (!isOpen) {
    return (
      <div className="flex items-center justify-center h-full">
        <button
          onClick={() => setIsOpen(true)}
          className="px-5 py-2.5 rounded-lg bg-[#2563eb] text-[#ffffff] text-sm font-medium hover:bg-[#1d4ed8] transition-colors"
        >
          Open Panel
        </button>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#09090b]/30 z-40"
            onClick={() => setIsOpen(false)}
          />

          <motion.div
            initial={{ x: 420, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 420, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="absolute inset-y-0 right-0 w-[min(100%,920px)] z-50 flex flex-col bg-[#f4f4f5] text-[#09090b] shadow-2xl overflow-hidden"
          >
            {/* header */}
            <div className="flex items-center justify-between px-6 py-4 bg-[#ffffff] border-b border-[#e4e4e7]">
              <div>
                <h1 className="text-lg font-semibold text-[#09090b]">Settings</h1>
                <p className="text-xs text-[#71717a]">Configure your LifeOS workspace</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg hover:bg-[#f4f4f5] transition-colors"
              >
                <X className="w-4 h-4 text-[#71717a]" />
              </button>
            </div>

            {/* body */}
            <div className="flex flex-1 min-h-0">
              {/* left nav */}
              <div className="w-[240px] shrink-0 bg-[#ffffff] border-r border-[#e4e4e7] flex flex-col">
                <div className="px-4 pt-5 pb-3">
                  <button
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="w-full flex items-center justify-center gap-2 rounded-lg border border-[#e4e4e7] bg-[#ffffff] px-3 py-2 text-xs font-medium text-[#09090b] hover:bg-[#f4f4f5] transition-colors disabled:opacity-50"
                  >
                    {isSyncing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2563eb]" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-[#71717a]" />
                    )}
                    {isSyncing ? "Syncing..." : "Sync workspace"}
                  </button>
                </div>

                <nav className="flex-1 overflow-y-auto px-2 pb-4">
                  {/* everything */}
                  <button
                    onClick={() => setTarget({ kind: "everything" })}
                    className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors mb-1 ${
                      target.kind === "everything"
                        ? "bg-[#eff6ff] text-[#2563eb]"
                        : "text-[#52525b] hover:bg-[#f4f4f5] hover:text-[#09090b]"
                    }`}
                  >
                    <Globe className="w-4 h-4" />
                    Everything
                  </button>

                  <div className="h-px bg-[#e4e4e7] mx-2 my-2" />

                  {MOCK_AREAS.map((area) => {
                    const isSpaceActive =
                      target.kind === "space" && target.areaId === area.id;
                    const isExpanded = expandedAreas.has(area.id);
                    return (
                      <div key={area.id} className="mb-0.5">
                        <div className="flex items-center">
                          <button
                            onClick={() => {
                              setTarget({ kind: "space", areaId: area.id });
                              if (!isExpanded) toggleExpand(area.id);
                            }}
                            className={`flex-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                              isSpaceActive
                                ? "bg-[#eff6ff] text-[#2563eb] font-medium"
                                : "text-[#52525b] hover:bg-[#f4f4f5] hover:text-[#09090b]"
                            }`}
                          >
                            <Layers className="w-3.5 h-3.5" />
                            <span className="truncate">{area.name}</span>
                          </button>
                          {area.clickup_lists.length > 0 && (
                            <button
                              onClick={() => toggleExpand(area.id)}
                              className="p-1 mr-1 rounded hover:bg-[#f4f4f5]"
                            >
                              <ChevronDown
                                className={`w-3 h-3 text-[#a1a1aa] transition-transform ${
                                  isExpanded ? "" : "-rotate-90"
                                }`}
                              />
                            </button>
                          )}
                        </div>

                        {isExpanded &&
                          area.clickup_lists.map((list) => {
                            const isListActive =
                              target.kind === "list" &&
                              target.listId === list.id;
                            return (
                              <button
                                key={list.id}
                                onClick={() =>
                                  setTarget({
                                    kind: "list",
                                    areaId: area.id,
                                    listId: list.id,
                                  })
                                }
                                className={`ml-6 w-[calc(100%-1.5rem)] flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors ${
                                  isListActive
                                    ? "bg-[#eff6ff] text-[#2563eb] font-medium"
                                    : "text-[#71717a] hover:text-[#52525b] hover:bg-[#f4f4f5]"
                                }`}
                              >
                                <ListIcon className="w-3 h-3" />
                                {list.title}
                              </button>
                            );
                          })}
                      </div>
                    );
                  })}
                </nav>
              </div>

              {/* right content */}
              <div className="flex-1 overflow-y-auto p-6">
                {target.kind === "everything" ? (
                  <div className="rounded-xl border border-[#e4e4e7] bg-[#ffffff] p-6">
                    <h2 className="text-xl font-semibold mb-1 text-[#09090b]">LifeOS Workspace</h2>
                    <p className="text-sm text-[#71717a] leading-relaxed mb-6">
                      The "Everything" view shows all synced LifeOS spaces.
                      Select a specific space or list to edit its configuration.
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {MOCK_AREAS.map((area) => (
                        <button
                          key={area.id}
                          onClick={() =>
                            setTarget({ kind: "space", areaId: area.id })
                          }
                          className="rounded-xl border border-[#e4e4e7] bg-[#ffffff] p-4 text-left hover:border-[#2563eb] hover:shadow-sm transition-all"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <Layers className="w-4 h-4 text-[#2563eb]" />
                            <p className="text-sm font-semibold text-[#09090b]">{area.name}</p>
                          </div>
                          <p className="text-xs text-[#71717a]">
                            {area.clickup_lists.length} list
                            {area.clickup_lists.length !== 1 ? "s" : ""} &middot;{" "}
                            {area.goals.length} goal
                            {area.goals.length !== 1 ? "s" : ""}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : source ? (
                  <div className="space-y-4">
                    {/* title card */}
                    <div className="rounded-xl border border-[#e4e4e7] bg-[#ffffff] px-6 py-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-medium text-[#2563eb] uppercase tracking-wider mb-1">
                            {target.kind === "space" ? "Space" : "List"}
                          </p>
                          <h2 className="text-xl font-semibold text-[#09090b]">
                            {target.kind === "list"
                              ? selectedList?.title
                              : selectedArea?.name}
                          </h2>
                          <p className="text-xs text-[#a1a1aa] font-mono mt-1">
                            {target.kind === "list"
                              ? selectedList?.clickup_list_id
                              : selectedArea?.clickup_space_id}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* form cards */}
                    {FIELDS.map((field) => (
                      <div
                        key={field.key}
                        className="rounded-xl border border-[#e4e4e7] bg-[#ffffff] px-6 py-5"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="text-sm font-semibold text-[#09090b]">
                              {field.label}
                            </h3>
                            {field.desc && (
                              <p className="text-xs text-[#a1a1aa] mt-0.5">
                                {field.desc}
                              </p>
                            )}
                          </div>
                        </div>
                        <textarea
                          defaultValue={source[field.key]}
                          rows={field.rows}
                          placeholder={field.placeholder}
                          className="w-full rounded-lg border border-[#e4e4e7] bg-[#fafafa] px-3 py-2.5 text-sm text-[#09090b] placeholder-[#a1a1aa] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] resize-none transition-all"
                        />
                      </div>
                    ))}

                    {/* save */}
                    <div className="flex justify-end">
                      <button className="rounded-lg bg-[#2563eb] px-5 py-2.5 text-sm font-medium text-[#ffffff] hover:bg-[#1d4ed8] transition-colors">
                        Save changes
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default PanelVariantB;
