LifeOS State Model

Overview
LifeOS operates as a deterministic state machine. All user requests flow through this model to ensure consistent execution and artifact logging.

States

State: Idle
Description: Waiting for user input (text/audio).

State: IntentParsed
Description: User input has been parsed into structured intent.

State: TargetResolved
Description: System has determined the workspace, space, list, and entity type.

State: PlanStaged
Description: Execution plan has been created but not executed.

State: Executed
Description: ClickUp API calls successfully completed.

State: ArtifactLogged
Description: Receipt created for the action, stored in the artifacts panel.

Transitions

Idle → (UserInputReceived) → IntentParsed
IntentParsed → (Resolver) → TargetResolved
TargetResolved → (PlanCreated) → PlanStaged
PlanStaged → (PlanApproved) → Executed
Executed → (ExecutionSucceeded) → ArtifactLogged

Notes:
	•	ExecutionFailed triggers rollback or retry logic back to PlanStaged.
	•	StructureMissing triggers a branch back to TargetResolved with a proposed creation plan.

Examples

JSON Representation of Current State
{
“state”: “PlanStaged”,
“intentId”: “intent_123”,
“userId”: “user_abc”,
“workspaceId”: “workspace_xyz”
}

Sample Codex Prompts
	1.	“Generate TypeScript enums and helper functions for the LifeOS state machine based on 01_state_model.md.”
	2.	“Create ASCII flow diagram for LifeOS states for documentation.”
	3.	“Write unit tests verifying all valid state transitions.

ASCII Diagram

Idle
  | (UserInputReceived)
IntentParsed
  | (Resolver)
TargetResolved
  | (PlanCreated)
PlanStaged
  | (PlanApproved)
Executed
  | (ExecutionSucceeded)
ArtifactLogged

StructureMissing branch:
PlanStaged
  | (StructureMissing)
TargetResolved
