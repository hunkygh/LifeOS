# ClickUp Scopes & Integration Plan

This document is the single source of truth for how the LifeOS orchestration layer plans to consume ClickUp’s REST surface. Each section lists the core endpoints, the capabilities they unlock, and how we intend to map LLM intents/metadata into that API behavior.

## 1. Workspace & Hierarchy discovery

- **`GET /team` → `GET /team/{team_id}/space` → `GET /space/{space_id}/list`**  
  We already call `syncClickUpConfiguration` to capture spaces/lists. Extend it with metadata (life area link, instructions, `list_type`) so `detectLifeArea` can resolve “Global Payments space” before invoking task intelligence. Use these endpoints to refresh the list cache whenever we notice new life areas or missing ClickUp IDs.

- **Filtering + metadata**  
  Store `clickup_space_id`, `clickup_list_id`, `space.name`, and optional `list.instructions` in Supabase. Any new life area/message should check the cached hierarchy before asking the user for the space or list.

## 2. Tasks & subtasks

- **`POST /list/{list_id}/task`**  
  Creation entrypoint for new events/workouts. Map user extracts for title, description, `start_date`, `due_date`, `status`, assignees, and metadata (`intent`, `life_area`, goal references) into the body. Automatically call after inline metadata is resolved.

- **`PUT /task/{task_id}`**  
  When the LLM indicates `update`, find the matching task in the target list, and push the parsed fields (new dates, status, name, description). Include the parsed schedule/time window from the text so adjustments happen in-place.

- **`GET /list/{list_id}/task`**  
  Use this to locate candidate tasks to update (our new `findTaskToUpdate`). Compare tokens with message context and life-area names to choose the right task. Cache recent hits to avoid repeated fetching.

- **`POST /task/{task_id}/subtask`**  
  Continue enriching workouts/training sessions with lifts or side tasks. Only run after creation (not on pure updates) unless the user explicitly references new subtasks.

- **`DELETE /task/{task_id}` (future)**  
  Would be used for “remove this plan” or “cancel the event.” Add once the orchestration layer can safely deduplicate-write.

## 3. Custom fields & metadata

- **`PUT /task/{task_id}/field/{field_id}`**  
  Use to store structured metadata that the LLM extracts (e.g., “training vs. workout,” “preferred location,” “calendar type,” “intensity level,” “estimated duration”). Maintain a mapping between list IDs and relevant field IDs, and include it in `life_area.preferences` so the AI knows which fields to fill.

- **`GET /custom_field/{field_id}`**  
  Optional step for runtime validation or to build dynamic inline prompts when a new custom field is introduced.

## 4. Views, filters & reporting

- **`GET /space/{space_id}/view` + `GET /view/{view_id}/task`**  
  Build read-only stories (“show upcoming workouts,” “list events for next 7 days,” “show overdue training”) by mapping prompt filters to view IDs or by applying the `cf_` filters in the URL.

- **`GET /space/{space_id}/task` (search)**  
  When the user asks “what’s next?” query this endpoint with date filters to return the relevant tasks without writing.

## 5. Goals, time & automation (roadmap)

- **`POST /goal` / `PUT /goal/{goal_id}`**  
  Track long-running efforts (e.g., career goals) by creating goals and linking tasks via `goal_id`. Use the LLM to determine when a prompt should spawn a goal instead of a task.

- **`POST /task/{task_id}/time_estimate` & `/time_tracked`**  
  Feed narrative like “I spent three hours” into these time-tracking endpoints to keep the schedule accurate.

- **`POST /task/{task_id}/dependency`**  
  Model dependencies for double-booked events or training sequences the AI infers (“this drill depends on yesterday’s baseline”).

## 6. Integration notes

1. Capture structured fields (dates, amount of time, location, recurrence) via parser helpers before any API call. This enables both create and update flows to know exactly what to write.
2. When the LLM outputs `decision: 'update'`, prefer updating the highest-scoring task from `GET /list/{list_id}/task` before creating a new one.
3. Persist inline metadata (life area context, list instructions, preferred list names) back to Supabase so future prompts auto-resolve.
4. Log every ClickUp write (`chat_messages.meta_response`) alongside the API payload for auditing.

## 7. Next steps

- Expand the parser to capture recurrence, assignees, and durations for both tasks and timed events.  
- Build reusable wrappers around each of the above endpoints so the edge function can reason declaratively (e.g., `scheduleEvent`, `updateWorkout`, `logTime`).  
- Revisit `runTaskIntelligence` prompts so the LLM understands this matrix and maps shortcuts like “Global Payments space” directly to the correct space/list before the execution layer runs.
