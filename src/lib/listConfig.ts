import { z } from "zod";

export const GoalMetricSchema = z.object({
  metric: z.string().min(1),
  target: z.number().finite(),
  period: z.enum(["daily", "weekly", "monthly"]),
});

export const ListConfigSchema = z.object({
  goals: z.array(GoalMetricSchema).default([]),
  execution: z
    .object({
      require_subtasks: z.boolean().default(false),
      due_date_policy: z.enum(["required", "optional", "forbid"]).default("optional"),
      reminders: z.enum(["none", "default"]).default("none"),
    })
    .default({ require_subtasks: false, due_date_policy: "optional", reminders: "none" }),
  naming: z
    .object({
      max_words: z.number().int().min(4).max(20).default(8),
      max_chars: z.number().int().min(16).max(80).default(32),
      prefix: z.string().nullable().optional(),
    })
    .default({ max_words: 8, max_chars: 32, prefix: null }),
  description: z
    .object({
      mode: z.enum(["compact", "detailed"]).default("compact"),
      include_source: z.boolean().default(true),
    })
    .default({ mode: "compact", include_source: true }),
  terminology: z
    .object({
      item_singular: z.string().min(1).max(40).default("task"),
      item_plural: z.string().min(1).max(40).default("tasks"),
    })
    .default({ item_singular: "task", item_plural: "tasks" }),
  behavior: z
    .object({
      lead_title_mode: z.enum(["default", "company_only"]).default("default"),
      lead_followup_subtask: z.boolean().default(false),
    })
    .default({ lead_title_mode: "default", lead_followup_subtask: false }),
});

export type GoalMetric = z.infer<typeof GoalMetricSchema>;
export type ListConfig = z.infer<typeof ListConfigSchema>;

export const DEFAULT_LIST_CONFIG: ListConfig = ListConfigSchema.parse({});

export function parseGoalsText(input: string): GoalMetric[] {
  return input
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [metricRaw, targetRaw, periodRaw] = line.split("|").map((part) => part.trim());
      const target = Number(targetRaw);
      const period = (periodRaw || "").toLowerCase();
      if (!metricRaw || !Number.isFinite(target) || !["daily", "weekly", "monthly"].includes(period)) {
        return null;
      }
      return { metric: metricRaw, target, period } as GoalMetric;
    })
    .filter((goal): goal is GoalMetric => Boolean(goal));
}

export function goalsToText(goals: GoalMetric[] | unknown): string {
  if (!Array.isArray(goals)) return "";
  return goals
    .map((goal: any) => {
      if (!goal || typeof goal.metric !== "string") return null;
      const target = Number(goal.target);
      const period = String(goal.period || "").toLowerCase();
      if (!Number.isFinite(target) || !["daily", "weekly", "monthly"].includes(period)) return null;
      return `${goal.metric}|${target}|${period}`;
    })
    .filter(Boolean)
    .join("\n");
}

export function parsePreferencesJson(input: string) {
  if (!input.trim()) return {};
  try {
    const parsed = JSON.parse(input);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return null;
  }
}

export function formatPreferencesJson(config: ListConfig): string {
  return JSON.stringify(
    {
      execution: config.execution,
      naming: config.naming,
      description: config.description,
      terminology: config.terminology,
      behavior: config.behavior,
    },
    null,
    2
  );
}

export function buildListConfigFromForm(goalsText: string, preferencesText: string) {
  const parsedPreferences = parsePreferencesJson(preferencesText);
  if (parsedPreferences === null) {
    return {
      ok: false as const,
      error: "Preferences must be valid JSON.",
    };
  }
  const goals = parseGoalsText(goalsText);
  const candidate = {
    ...DEFAULT_LIST_CONFIG,
    ...(parsedPreferences || {}),
    goals,
  };
  const result = ListConfigSchema.safeParse(candidate);
  if (!result.success) {
    return {
      ok: false as const,
      error: result.error.issues[0]?.message || "Invalid list configuration.",
    };
  }
  return {
    ok: true as const,
    value: result.data,
  };
}
