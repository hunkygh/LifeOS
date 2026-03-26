import { describe, expect, it } from "vitest";
import {
  coerceV2ActionPlan,
  getCreateFollowUpTaskAction,
  prepareCreateFollowUpTaskAction,
  validateV2ActionPlan,
} from "../v2ActionPlan";
import { V2_FROZEN_MANIFEST } from "../v2Manifest";

describe("create follow-up task preparation", () => {
  it("prepares a valid create_follow_up_task action", () => {
    const plan = coerceV2ActionPlan({
      target_id: V2_FROZEN_MANIFEST.default_target_task_id,
      actions: [
        {
          type: "write_comment",
          payload: { comment_text: "Met Vickie and set a soft walk-in for Friday at 2." },
        },
        {
          type: "create_follow_up_task",
          payload: {
            title: "Follow up with Vickie Friday at 2",
            description: "Source item: 86age1dqa\nContext: Soft walk-in Friday at 2.",
            due_hint: "Friday at 2 PM",
            source_target_id: V2_FROZEN_MANIFEST.default_target_task_id,
            list_id: V2_FROZEN_MANIFEST.execution_list_id,
          },
        },
      ],
    });

    const prepared = prepareCreateFollowUpTaskAction(getCreateFollowUpTaskAction(plan));

    expect(prepared.ok).toBe(true);
    expect(prepared.taskAction?.payload.list_id).toBe(V2_FROZEN_MANIFEST.execution_list_id);
  });

  it("rejects a create_follow_up_task action outside the frozen list", () => {
    const prepared = prepareCreateFollowUpTaskAction({
      type: "create_follow_up_task",
      payload: {
        title: "Follow up with Ryan",
        description: "Call Ryan back Monday.",
        due_hint: "Monday morning",
        source_target_id: V2_FROZEN_MANIFEST.default_target_task_id,
        list_id: "not-allowed",
      },
    });

    expect(prepared.ok).toBe(false);
    expect(prepared.validation.issues).toContain(
      "payload.list_id is not the frozen execution list"
    );
  });

  it("allows a runtime-resolved source target id in the surrounding action plan", () => {
    const plan = coerceV2ActionPlan({
      target_id: "86runtimelead",
      actions: [
        {
          type: "write_comment",
          payload: { comment_text: "Met with Lola's Street Kitchen and should call back tomorrow at noon." },
        },
        {
          type: "create_follow_up_task",
          payload: {
            title: "Follow up with Lola's Street Kitchen - Tomorrow at noon",
            description: "Source item: 86runtimelead\nSummary: Call back tomorrow at noon.",
            due_hint: "tomorrow around noon",
            source_target_id: "86runtimelead",
            list_id: V2_FROZEN_MANIFEST.execution_list_id,
          },
        },
      ],
    });

    const validation = validateV2ActionPlan(plan);

    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
  });
});
