# Orchestrating Workout Modifications through LifeOS + ClickUp

## Objective
Enable the assistant to interpret natural-language workout edits, map them to the correct Life Area + ClickUp list, surface any missing metadata inline, and then execute the plan by creating/updating structured tasks (main task + subtask carries sets/reps/weight) via the ClickUp API.

## Key Components
1. **Intent & Context Detection** (Edge Function `detectLifeArea` + `runTaskIntelligence`)
2. **Inline Prompt Flow** (Edge Function returns metadata fields; Chat UI renders form)
3. **ClickUp Execution** (Edge Function calls ClickUp tasks API in the target list)
4. **UI Handling** (Action card becomes inline prompt with configurable fields)
5. **Feedback Loop** (persist context/instructions, record execution result in chat)

---

## Detailed Steps

### 1. Life Area & List Resolution
- Enhance `detectLifeArea` to:
  * Rank life areas by keywords + `clickup_space_id` bonus (already in place) and return the chosen row with its linked `clickup_lists` (include instructions/context per list).
  * If the intention clearly refers to `Workouts`, bias toward that space and the list whose name best matches (e.g., contains "workout" or "training").
  * Attach the resolved list ID + name to the response so execution knows exactly which list to use.

### 2. Inline Prompt for Missing Metadata
- In the decision pipeline, once the life area and list are selected:
  * Inspect their rows for key fields (context, instructions, custom template). If any are null or empty, set `actionNeeded.fields` for the missing pieces (label, placeholder describing what to provide).
  * Return `actionNeeded.reply_type = 'inline'` so the UI knows to render a text input rather than forcing a settings visit.
  * Include a new `metadata.target_list = { clickup_list_id, clickup_space_id }` so the UI can submit back to the same context.

### 3. ClickUp Execution Strategy
- Add helper (e.g., `executeWorkoutPlan`) that:
  * Pulls existing tasks from the target list via ClickUp API, or creates a new "Main Workout" task with the title generated from user intent.
  * Adds subtasks for each lift (e.g., `bench press`), storing custom fields (sets/reps/weight). Map natural-language numerical values to the fields, defaulting when not provided.
  * Attaches metadata (instructions/notes) to the main task from the Life Area context.
  * Returns a summary (task IDs + links) for the chat response.

### 4. Chat UI / Action Flow
- Update `ActionNeededCard` (or a new component) to:
  * Detect `action.metadata.fields` and render inline form inputs (text, number, dropdown) beneath the prompt text.
  * On submit, call `supabase.functions.invoke('chat', { message: 'inline-submit', metadata: {...fields, actionId} })` so the Edge Function knows to consume the extra data and replay the intent.
  * If the inline form resolves the missing metadata, the Edge Function should re-run the decision logic so it reaches the execution block (no manual settings navigation). If execution succeeds, respond with a summary and no further action cards.
  * Provide fallback `Open Settings` only if the inline fields still cannot be resolved.

### 5. Execution Feedback & Persistence
- After the ClickUp API call completes:
  * Store the resulting task metadata in the chat (content + `metaResponse` describing success).
  * Anytime inline input is provided, persist it to `life_areas` or `clickup_lists` (e.g., update `instructions` or a new `custom_fields_template` JSON column) so future revisions don’t prompt again.
  * Log the action for auditing (could insert `chat_messages` records or use the audit trail in `Artifacts`).

---

## Testing Checklist (before deployment)
1. Send a workout-modification prompt with descriptors (e.g., “Modify my workout to light chest/triceps and mention sets/reps”). Expect inline prompt if metadata missing, otherwise direct execution with ClickUp updates.
2. Verify the inline inputs update the DB and that a subsequent request uses the saved context automatically.
3. Ensure the generated ClickUp tasks/subtasks carry the structured fields (sets, reps, weight, notes). Document success in the assistant response.
4. Run `npm run build` and `supabase functions deploy` (or serve) to confirm the edge logic compiles and executes.

## Runtime Contracts
* Edge function always returns `lifeAreaConfig` with `clickup_space_id` and `clickup_list_id` when execution is intended.
* Inline prompts should never exceed two fields and must be rendered in the chat without modal navigation.
* ClickUp API credentials are taken from the `CLICKUP_API_KEY` env var; ensure they are passed to the `executeWorkoutPlan` helper.

## Next Steps After Planning
1. Implement inline prompt rendering in `ChatView` + updated `ActionNeededCard`.
2. Extend the edge function to accept `metadata.inline_fields` and to re-run `runTaskIntelligence` after persisting them.
3. Build the ClickUp task/subtask creation helper and wire it into the decision switch (when `decision === 'create'` or `'update'`).
4. Validate end-to-end with a real Supabase + ClickUp sync, then deploy the updated functions.
