import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Plus,
  Loader2,
  Globe,
  List as ListIcon,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

/**
 * Variant A — "Dark Premium"
 *
 * Deep charcoal/near-black background, subtle borders, tight spacing.
 * Inspired by Vercel's dark dashboard aesthetic. Monochrome with
 * emerald-green status accents.
 */

// ── mock data ──────────────────────────────────────────────────
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
  { label: "Context", key: "context" as const, rows: 3 },
  { label: "Goals", key: "goals" as const, rows: 3, placeholder: "One per line" },
  { label: "Preferences", key: "preferences" as const, rows: 2 },
  { label: "Instructions", key: "instructions" as const, rows: 3 },
];

const PanelVariantA = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [target, setTarget] = useState<TargetType>({ kind: "space", areaId: "1" });
  const [isSyncing, setIsSyncing] = useState(false);

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
          className="px-5 py-2.5 rounded-lg bg-[#18181b] text-[#fafafa] text-sm font-medium border border-[#27272a] hover:bg-[#27272a] transition-colors"
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
          {/* backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* panel */}
          <motion.div
            initial={{ x: 420, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 420, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="absolute inset-y-3 right-3 w-[min(96%,880px)] z-50 flex flex-col rounded-2xl border border-[#27272a] bg-[#09090b] text-[#fafafa] shadow-2xl overflow-hidden"
          >
            {/* ─── header ─── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#27272a]">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.25em] text-[#a1a1aa]">
                  Settings
                </span>
                <span className="h-1 w-1 rounded-full bg-[#22c55e]" />
                <span className="text-xs text-[#52525b]">LifeOS Workspace</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-md hover:bg-[#27272a] transition-colors"
              >
                <X className="w-4 h-4 text-[#71717a]" />
              </button>
            </div>

            {/* ─── sync bar ─── */}
            <div className="flex items-center gap-3 px-6 py-3 border-b border-[#27272a]">
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="flex items-center gap-2 rounded-md bg-[#fafafa] px-3.5 py-1.5 text-xs font-medium text-[#09090b] hover:bg-[#e4e4e7] transition-colors disabled:opacity-50"
              >
                {isSyncing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                {isSyncing ? "Syncing..." : "Sync workspace"}
              </button>
              <span className="text-[11px] text-[#52525b]">
                Last synced 2 min ago
              </span>
            </div>

            {/* ─── body: sidebar + detail ─── */}
            <div className="flex flex-1 min-h-0">
              {/* sidebar */}
              <div className="w-[260px] shrink-0 border-r border-[#27272a] flex flex-col">
                <div className="px-4 pt-4 pb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#52525b]">
                    Spaces
                  </p>
                </div>

                {/* everything */}
                <button
                  onClick={() => setTarget({ kind: "everything" })}
                  className={`mx-2 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    target.kind === "everything"
                      ? "bg-[#27272a] text-[#fafafa]"
                      : "text-[#a1a1aa] hover:bg-[#18181b] hover:text-[#fafafa]"
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  Everything
                </button>

                {/* areas */}
                <div className="flex-1 overflow-y-auto px-2 pt-1 pb-4 space-y-0.5">
                  {MOCK_AREAS.map((area) => {
                    const isActive =
                      (target.kind === "space" && target.areaId === area.id) ||
                      (target.kind === "list" && target.areaId === area.id);
                    return (
                      <div key={area.id}>
                        <button
                          onClick={() =>
                            setTarget({ kind: "space", areaId: area.id })
                          }
                          className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                            target.kind === "space" && target.areaId === area.id
                              ? "bg-[#27272a] text-[#fafafa]"
                              : "text-[#a1a1aa] hover:bg-[#18181b] hover:text-[#fafafa]"
                          }`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${
                              isActive ? "bg-[#22c55e]" : "bg-[#3f3f46]"
                            }`}
                          />
                          <span className="flex-1 text-left truncate">
                            {area.name}
                          </span>
                          <span className="text-[10px] text-[#52525b]">
                            {area.clickup_lists.length}
                          </span>
                          {area.clickup_lists.length > 0 && (
                            <ChevronRight
                              className={`w-3 h-3 text-[#52525b] transition-transform ${
                                isActive ? "rotate-90" : ""
                              }`}
                            />
                          )}
                        </button>

                        {/* sub-lists */}
                        {isActive &&
                          area.clickup_lists.map((list) => (
                            <button
                              key={list.id}
                              onClick={() =>
                                setTarget({
                                  kind: "list",
                                  areaId: area.id,
                                  listId: list.id,
                                })
                              }
                              className={`ml-7 flex w-[calc(100%-1.75rem)] items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors ${
                                target.kind === "list" &&
                                target.listId === list.id
                                  ? "bg-[#27272a] text-[#fafafa]"
                                  : "text-[#71717a] hover:text-[#a1a1aa]"
                              }`}
                            >
                              <ListIcon className="w-3 h-3" />
                              <span className="truncate">{list.title}</span>
                            </button>
                          ))}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* detail */}
              <div className="flex-1 overflow-y-auto p-6">
                {target.kind === "everything" ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#52525b] mb-2">
                      Overview
                    </p>
                    <h2 className="text-xl font-semibold mb-2">
                      LifeOS Workspace
                    </h2>
                    <p className="text-sm text-[#71717a] leading-relaxed">
                      Select a space or list from the sidebar to edit its custom
                      context, goals, preferences, and instructions.
                    </p>
                    <div className="mt-6 grid grid-cols-3 gap-3">
                      {MOCK_AREAS.map((area) => (
                        <button
                          key={area.id}
                          onClick={() =>
                            setTarget({ kind: "space", areaId: area.id })
                          }
                          className="rounded-lg border border-[#27272a] bg-[#18181b] p-4 text-left hover:border-[#3f3f46] transition-colors"
                        >
                          <p className="text-sm font-medium">{area.name}</p>
                          <p className="text-xs text-[#52525b] mt-1">
                            {area.clickup_lists.length} list
                            {area.clickup_lists.length !== 1 ? "s" : ""}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : source ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#52525b] mb-1">
                      Configure{" "}
                      {target.kind === "space" ? "Space" : "List"}
                    </p>
                    <h2 className="text-xl font-semibold mb-1">
                      {target.kind === "list"
                        ? selectedList?.title
                        : selectedArea?.name}
                    </h2>
                    <p className="text-[11px] text-[#52525b] font-mono mb-6">
                      {target.kind === "list"
                        ? selectedList?.clickup_list_id
                        : selectedArea?.clickup_space_id}
                    </p>

                    <div className="space-y-5">
                      {FIELDS.map((field) => (
                        <div key={field.key}>
                          <label className="block text-[11px] font-medium uppercase tracking-[0.2em] text-[#71717a] mb-1.5">
                            {field.label}
                          </label>
                          <textarea
                            defaultValue={source[field.key]}
                            rows={field.rows}
                            placeholder={field.placeholder}
                            className="w-full rounded-lg border border-[#27272a] bg-[#18181b] px-3 py-2 text-sm text-[#fafafa] placeholder-[#3f3f46] focus:outline-none focus:ring-1 focus:ring-[#52525b] resize-none"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end mt-6">
                      <button className="rounded-md bg-[#fafafa] px-4 py-2 text-sm font-medium text-[#09090b] hover:bg-[#e4e4e7] transition-colors">
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

export default PanelVariantA;
