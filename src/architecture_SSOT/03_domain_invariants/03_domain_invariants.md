LifeOS Domain Invariants

Overview
Invariants define the non-negotiable rules that ensure LifeOS remains deterministic and avoids brittle behavior.

Core Invariants
	1.	No ClickUp mutation before PlanApproved.
	2.	All mutations reference entity IDs; names are never used to locate tasks/lists.
	3.	Every successful mutation must generate an artifact.
	4.	Workspace sync must occur before resolving targets.
	5.	If target list/space does not exist, branch to StructureMissing.
	6.	Semantic resolution only; no hard-coded life-area mapping.
	7.	Updates must use appropriate API endpoints (update vs create).

Examples

Sample Invariant Check (TypeScript)
```
function validateExecution(intent: Intent, plan: ExecutionPlan) {
  if (!plan.approved) throw new Error("Plan must be approved before execution.");
  if (!plan.targetId) throw new Error("Target ID is required.");
}
```

Sample Codex Prompts
	1.	“Generate TypeScript validation functions to enforce invariants in 03_domain_invariants.md.”
	2.	“Write unit tests that fail when LifeOS invariants are violated.”
	3.	“Create CI check to run architecture-check enforcing invariants.”
