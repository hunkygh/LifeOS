export type FrozenTarget = {
  id: string;
  kind: "task";
  label: string;
  listId: string;
};

export const V2_FROZEN_MANIFEST = {
  workspaceId: "TODO_WORKSPACE_ID",
  listIds: ["TODO_LIST_ID_PRIMARY"],
  execution_list_id: "901326567375",
  connected_lead_field_id: "5f4284be-6062-44a3-a42e-557ae97426c4",
  lead_owner_email_field_id: "01256e8a-9099-4a6b-8bb6-8e3fae46f4f7",
  lead_pos_system_field_id: "090f8b6f-12ac-4c34-bafa-20d77ddf4496",
  lead_owner_names_field_id: "160fa321-0556-486b-b52b-e52a361258ec",
  lead_next_step_field_id: "37582480-903e-46cc-90a3-92c4b4d9d3a9",
  lead_best_time_to_contact_field_id: "5cf003ef-2c94-45b2-aac4-c59f34a4910f",
  lead_phone_field_id: "c1745e1a-ab61-4424-876a-b663175facef",
  lead_location_count_field_id: null,
  grant_clickup_user_id: "114094508",
  default_target_task_id: "86age1dqa",
  default_source_space_name: "Global Payments",
  default_source_list_name: "Genius POS Leads",
  default_source_list_id: "901326132392",
  targets: [
    {
      id: "86age1dqa",
      kind: "task",
      label: "Sales Comment Sink",
      listId: "TODO_LIST_ID_PRIMARY",
    },
  ] as FrozenTarget[],
} as const;

export function getFrozenTarget(targetId: string) {
  return V2_FROZEN_MANIFEST.targets.find((target) => target.id === targetId) || null;
}

export function isAllowedFrozenTarget(targetId: string) {
  return targetId === V2_FROZEN_MANIFEST.default_target_task_id;
}

export function isAllowedExecutionList(listId: string) {
  return listId === V2_FROZEN_MANIFEST.execution_list_id;
}

export function isAllowedTaskContainerList(listId: string) {
  return listId === V2_FROZEN_MANIFEST.default_source_list_id || listId === V2_FROZEN_MANIFEST.execution_list_id;
}

export function isAllowedAssignee(userId: string) {
  return userId === V2_FROZEN_MANIFEST.grant_clickup_user_id;
}
