export function createExecutionPlan(intentPayload: any, resolutionPoint: any, steps: any) {
  const decision = intentPayload?.operationType === "update" ? "update" : "create"
  const listId = resolutionPoint?.listId || "list_pending"
  const summaryAction = decision === "update" ? "Update item" : "Create item"
  const summaryTarget = listId && listId !== "list_pending" ? `in list ${listId}` : "in the best matching list"
  return {
    summary: `${summaryAction} ${summaryTarget}.`,
    target: { listId },
    decision,
    intent: intentPayload,
    resolution: resolutionPoint,
    steps: Array.isArray(steps) ? steps : [],
  }
}

export function shouldForceCreateFromMessage(message: string, decision: string) {
  return false
}

export function buildActionPlan(decisionResult: any, lifeAreaConfig: any, targetList: any, message: string) {
  const decision = decisionResult?.decision || "create"
  const listName =
    targetList?.title ||
    targetList?.reference_name ||
    targetList?.metadata?.source_name ||
    targetList?.name ||
    (targetList?.clickup_list_id ? `List ${targetList.clickup_list_id}` : "selected list")
  return {
    summary: `${decision === "update" ? "Update task" : "Create task"} in ${listName}.`,
    target: { listId: targetList?.clickup_list_id || "stub-list" },
    decision,
    changes: [],
  }
}
