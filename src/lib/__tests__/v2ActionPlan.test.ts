import { describe, expect, it } from "vitest";
import {
  coerceV2ActionPlan,
  validateV2ActionPlan,
  V2_ACTION_PLAN_VERSION,
} from "../v2ActionPlan";
import { V2_FROZEN_MANIFEST } from "../v2Manifest";

describe("v2 action plan", () => {
  it("coerces a valid comment + follow-up task plan", () => {
    const plan = coerceV2ActionPlan({
      version: V2_ACTION_PLAN_VERSION,
      target_id: V2_FROZEN_MANIFEST.default_target_task_id,
      actions: [
        {
          type: "write_comment",
          payload: {
            comment_text: "Met Vickie at the restaurant. Soft walk-in Friday at 2.",
          },
        },
        {
          type: "create_follow_up_task",
          payload: {
            title: "Follow up with Vickie Friday at 2",
            description: "Origin: LifeOS note. Soft walk-in Friday at 2.",
            due_hint: "Friday at 2",
            source_target_id: V2_FROZEN_MANIFEST.default_target_task_id,
            list_id: V2_FROZEN_MANIFEST.execution_list_id,
          },
        },
      ],
    });

    const validation = validateV2ActionPlan(plan);

    expect(plan.version).toBe(V2_ACTION_PLAN_VERSION);
    expect(plan.actions).toHaveLength(2);
    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it("coerces a valid assigned comment plan for Grant", () => {
    const plan = coerceV2ActionPlan({
      version: V2_ACTION_PLAN_VERSION,
      target_id: V2_FROZEN_MANIFEST.default_target_task_id,
      actions: [
        {
          type: "write_assigned_comment",
          payload: {
            comment_text: "Text Vickie Thursday night to confirm Friday at 2.",
            assignee_id: V2_FROZEN_MANIFEST.grant_clickup_user_id,
          },
        },
      ],
    });

    const validation = validateV2ActionPlan(plan);

    expect(plan.actions).toHaveLength(1);
    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it("rejects a follow-up task action without a comment action", () => {
    const plan = coerceV2ActionPlan({
      target_id: V2_FROZEN_MANIFEST.default_target_task_id,
      actions: [
        {
          type: "create_follow_up_task",
          payload: {
            title: "Follow up with Ryan",
            description: "Call Ryan back Monday morning.",
            source_target_id: V2_FROZEN_MANIFEST.default_target_task_id,
            list_id: V2_FROZEN_MANIFEST.execution_list_id,
          },
        },
      ],
    });

    const validation = validateV2ActionPlan(plan);

    expect(validation.valid).toBe(false);
    expect(validation.issues).toContain(
      "create_follow_up_task currently requires a comment action in the same plan"
    );
  });

  it("rejects an assigned comment for a non-frozen assignee", () => {
    const plan = coerceV2ActionPlan({
      target_id: V2_FROZEN_MANIFEST.default_target_task_id,
      actions: [
        {
          type: "write_assigned_comment",
          payload: {
            comment_text: "Text Ryan tomorrow morning.",
            assignee_id: "some-other-user",
          },
        },
      ],
    });

    const validation = validateV2ActionPlan(plan);

    expect(validation.valid).toBe(false);
    expect(validation.issues).toContain(
      "actions[0].payload.assignee_id is not the frozen Grant assignee"
    );
  });

  it("rejects an execution list outside the frozen manifest", () => {
    const plan = coerceV2ActionPlan({
      target_id: V2_FROZEN_MANIFEST.default_target_task_id,
      actions: [
        {
          type: "write_comment",
          payload: {
            comment_text: "Left voicemail for Ryan.",
          },
        },
        {
          type: "create_follow_up_task",
          payload: {
            title: "Try Ryan again Monday",
            description: "Left voicemail for Ryan. Try again Monday morning.",
            source_target_id: V2_FROZEN_MANIFEST.default_target_task_id,
            list_id: "some-other-list",
          },
        },
      ],
    });

    const validation = validateV2ActionPlan(plan);

    expect(validation.valid).toBe(false);
    expect(validation.issues).toContain(
      "actions[1].payload.list_id is not the frozen execution list"
    );
  });
});
