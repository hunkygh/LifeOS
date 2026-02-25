# LifeOS Constitution v1

## I. Functional Intent (Non-Negotiable Context)

LifeOS exists to translate natural language into clean, structured, low-friction execution inside ClickUp.

It is not a general automation engine.  
It is a disciplined orchestration layer optimized for clarity.

### Core Intent
1. My Work is the primary optimization surface.  
   All actions must ultimately reduce cognitive load there.
2. The system must preserve a minimalist, constraint-based productivity philosophy.  
   Structural simplicity > feature expansion.
3. Reuse is the default. Creation is exceptional.
4. Every item must have semantic clarity (type, intent, scheduling logic).
5. Intake must be frictionless. Organization must feel invisible.
6. The system must prevent workspace entropy even when the user is not supervising.
7. Structural mutation must be deliberate and reviewable.
8. Maintainability and stability outweigh breadth of capability.

If a decision conflicts with these principles, these principles win.

## II. Architectural Doctrine

### 1. My Work Optimization Rule
All execution decisions must consider downstream impact on:
- Task visibility
- Priority clarity
- Scheduling clarity
- Duplication risk

No action may degrade My Work signal-to-noise ratio.

### 2. Reuse Over Creation Rule
Before creating:
- Space
- List
- Folder
- Custom field
- Type
- Tag

The system must:
1. Index existing structures.
2. Score candidates.
3. Select highest viable match.
4. Log top 3 candidates + reasoning + confidence.

Creation requires:
- High confidence that no suitable structure exists.
- Explicit structural proposal flow.

### 3. Deterministic Capability Layer
The AI may not call raw ClickUp endpoints.

It may only emit structured actions from the approved capability schema:
- create_item
- update_item
- apply_type
- schedule_item
- link_items
- archive_item
- propose_structure_change

Each capability maps deterministically to ClickUp API calls.

New ClickUp features do not exist inside LifeOS until explicitly added to this layer.

### 4. Ontology Discipline Rule
Every item must have:
- Exactly one Type
- Clear semantic intent
- Explicit scheduling logic (even if unscheduled by design)

Types determine:
- Default priority logic
- Scheduling behavior
- My Work visibility behavior
- Relationship expectations

Types are finite and versioned.

### 5. Structural Mutation Protocol
Structural changes (new space, list, field, type) must:
1. Emit `propose_structure_change`
2. Include:
   - Reasoning
   - Confidence score
   - Similarity analysis against existing structure
   - Impact on My Work
3. Be non-auto-executing

No silent structural expansion.

### 6. Hard Invariants (Execution Guards)
The system must block execution if:
- Confidence score < defined threshold.
- Duplicate open item similarity exceeds threshold.
- Structural creation attempted outside proposal flow.
- Required semantic fields are missing.
- My Work degradation risk detected.

These invariants override AI output.

### 7. Routing Transparency Rule
All routing decisions must log:
- Candidate targets
- Scoring breakdown
- Selected target
- Confidence score
- Rejection reasons for alternates

Routing must be tunable without refactoring core execution.

Policy must be editable independent of capability plumbing.

### 8. Single-Tenant Trust Model
- One `APP_USER_ID`
- No runtime auth/session logic
- Service-role access only in edge functions
- API keys remain server-side

Session complexity must not re-enter architecture.

### 9. Anti-Entropy Enforcement
The system must actively prevent:
- Duplicate pipelines
- Parallel taxonomies
- Redundant custom fields
- List proliferation
- Semantic drift in types

If unsure, default to clarification rather than expansion.

### 10. Stability Over Exhaustiveness
LifeOS does not attempt to expose all ClickUp capabilities.

Constraint > breadth.

New capabilities are added intentionally, not automatically.

## III. Amendment Protocol
This Constitution may only be modified deliberately.

All changes must:
- State rationale
- Define expected impact
- Confirm alignment with Functional Intent

No implicit drift.

This is the rail system.  
If Codex follows this, drift becomes structurally difficult.
