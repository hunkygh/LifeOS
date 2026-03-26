import {
  V2_FROZEN_MANIFEST,
  isAllowedAssignee,
  isAllowedTaskContainerList,
} from "./v2Manifest.ts";

export const V2_ACTION_PLAN_VERSION = "v2-action-plan" as const;

export const V2_ACTION_TYPES = [
  "write_comment",
  "write_assigned_comment",
  "create_follow_up_task",
] as const;

export type V2ActionType = (typeof V2_ACTION_TYPES)[number];

export type WriteCommentAction = {
  type: "write_comment";
  payload: {
    comment_text: string;
  };
};

export type CreateFollowUpTaskAction = {
  type: "create_follow_up_task";
  payload: {
    title: string;
    description: string;
    due_hint: string | null;
    source_target_id: string;
    list_id: string;
  };
};

export type WriteAssignedCommentAction = {
  type: "write_assigned_comment";
  payload: {
    comment_text: string;
    assignee_id: string;
  };
};

export type V2Action = WriteCommentAction | WriteAssignedCommentAction | CreateFollowUpTaskAction;

export type V2ActionPlan = {
  version: typeof V2_ACTION_PLAN_VERSION;
  target_id: string;
  actions: V2Action[];
};

export type V2ActionPlanValidation = {
  valid: boolean;
  missing_fields: string[];
  issues: string[];
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeMultilineText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

function normalizeNullableString(value: unknown) {
  if (value == null) return null;
  const normalized = normalizeWhitespace(String(value));
  return normalized || null;
}

function coerceWriteCommentAction(input: Record<string, unknown>): WriteCommentAction {
  const payload = (input.payload ?? {}) as Record<string, unknown>;

  return {
    type: "write_comment",
    payload: {
      comment_text: normalizeWhitespace(String(payload.comment_text ?? "")),
    },
  };
}

function coerceWriteAssignedCommentAction(input: Record<string, unknown>): WriteAssignedCommentAction {
  const payload = (input.payload ?? {}) as Record<string, unknown>;

  return {
    type: "write_assigned_comment",
    payload: {
      comment_text: normalizeWhitespace(String(payload.comment_text ?? "")),
      assignee_id: normalizeWhitespace(
        String(payload.assignee_id ?? V2_FROZEN_MANIFEST.grant_clickup_user_id)
      ),
    },
  };
}

function coerceCreateFollowUpTaskAction(
  input: Record<string, unknown>,
  fallbackTargetId: string
): CreateFollowUpTaskAction {
  const payload = (input.payload ?? {}) as Record<string, unknown>;

  return {
    type: "create_follow_up_task",
    payload: {
      title: normalizeWhitespace(String(payload.title ?? "")),
      description: normalizeMultilineText(String(payload.description ?? "")),
      due_hint: normalizeNullableString(payload.due_hint),
      source_target_id: normalizeWhitespace(
        String(payload.source_target_id ?? fallbackTargetId)
      ),
      list_id: normalizeWhitespace(
        String(payload.list_id ?? V2_FROZEN_MANIFEST.default_source_list_id)
      ),
    },
  };
}

export function coerceV2ActionPlan(input: unknown): V2ActionPlan {
  const source = (input ?? {}) as Record<string, unknown>;
  const target_id = normalizeWhitespace(
    String(source.target_id ?? V2_FROZEN_MANIFEST.default_target_task_id)
  );
  const rawActions = Array.isArray(source.actions) ? source.actions : [];

  const actions = rawActions
    .map((rawAction) => {
      const action = (rawAction ?? {}) as Record<string, unknown>;
      const type = String(action.type ?? "").trim();

      if (type === "write_comment") {
        return coerceWriteCommentAction(action);
      }

      if (type === "write_assigned_comment") {
        return coerceWriteAssignedCommentAction(action);
      }

      if (type === "create_follow_up_task") {
        return coerceCreateFollowUpTaskAction(action, target_id);
      }

      return null;
    })
    .filter((action): action is V2Action => Boolean(action));

  return {
    version: V2_ACTION_PLAN_VERSION,
    target_id,
    actions,
  };
}

export function validateV2ActionPlan(plan: V2ActionPlan): V2ActionPlanValidation {
  const missing_fields: string[] = [];
  const issues: string[] = [];

  if (plan.version !== V2_ACTION_PLAN_VERSION) {
    issues.push("version must be v2-action-plan");
  }

  if (!plan.target_id) {
    missing_fields.push("target_id");
  }

  if (!Array.isArray(plan.actions) || plan.actions.length === 0) {
    missing_fields.push("actions");
  }

  if (plan.actions.length > 2) {
    issues.push("action plan may contain at most 2 actions");
  }

  const actionTypes = plan.actions.map((action) => action.type);

  if (
    actionTypes.includes("create_follow_up_task") &&
    !actionTypes.some((type) => type === "write_comment" || type === "write_assigned_comment")
  ) {
    issues.push("create_follow_up_task currently requires a comment action in the same plan");
  }

  const duplicateTypes = actionTypes.filter(
    (type, index) => actionTypes.indexOf(type) !== index
  );
  if (duplicateTypes.length) {
    issues.push("action plan may not contain duplicate action types");
  }

  plan.actions.forEach((action, index) => {
    if (action.type === "write_comment") {
      if (!action.payload.comment_text) {
        missing_fields.push(`actions[${index}].payload.comment_text`);
      }
      return;
    }

    if (action.type === "write_assigned_comment") {
      if (!action.payload.comment_text) {
        missing_fields.push(`actions[${index}].payload.comment_text`);
      }

      if (!action.payload.assignee_id) {
        missing_fields.push(`actions[${index}].payload.assignee_id`);
      } else if (!isAllowedAssignee(action.payload.assignee_id)) {
        issues.push(`actions[${index}].payload.assignee_id is not the frozen Grant assignee`);
      }
      return;
    }

    if (!action.payload.title) {
      missing_fields.push(`actions[${index}].payload.title`);
    }

    if (!action.payload.description) {
      missing_fields.push(`actions[${index}].payload.description`);
    }

    if (!action.payload.source_target_id) {
      missing_fields.push(`actions[${index}].payload.source_target_id`);
    }

    if (!action.payload.list_id) {
      missing_fields.push(`actions[${index}].payload.list_id`);
    } else if (!isAllowedTaskContainerList(action.payload.list_id)) {
      issues.push(`actions[${index}].payload.list_id is not an allowed task container list`);
    }
  });

  return {
    valid: missing_fields.length === 0 && issues.length === 0,
    missing_fields: Array.from(new Set(missing_fields)),
    issues: Array.from(new Set(issues)),
  };
}

export function getCreateFollowUpTaskAction(plan?: V2ActionPlan | null) {
  if (!plan?.actions?.length) return null;
  return (
    plan.actions.find(
      (action): action is CreateFollowUpTaskAction => action.type === "create_follow_up_task"
    ) || null
  );
}

export function prepareCreateFollowUpTaskAction(action?: CreateFollowUpTaskAction | null) {
  const missing_fields: string[] = [];
  const issues: string[] = [];

  if (!action) {
    missing_fields.push("action");
    return {
      ok: false as const,
      validation: {
        valid: false,
        missing_fields,
        issues,
      },
      taskAction: null,
    };
  }

  if (!action.payload.title) {
    missing_fields.push("payload.title");
  }

  if (!action.payload.description) {
    missing_fields.push("payload.description");
  }

  if (!action.payload.source_target_id) {
    missing_fields.push("payload.source_target_id");
  }

  if (!action.payload.list_id) {
    missing_fields.push("payload.list_id");
  } else if (!isAllowedTaskContainerList(action.payload.list_id)) {
    issues.push("payload.list_id is not an allowed task container list");
  }

  if (missing_fields.length || issues.length) {
    return {
      ok: false as const,
      validation: {
        valid: false,
        missing_fields: Array.from(new Set(missing_fields)),
        issues: Array.from(new Set(issues)),
      },
      taskAction: null,
    };
  }

  return {
    ok: true as const,
    validation: {
      valid: true,
      missing_fields: [],
      issues: [],
    },
    taskAction: action,
  };
}
