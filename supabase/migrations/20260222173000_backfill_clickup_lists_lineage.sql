-- Backfill legacy clickup_lists rows so sync/render logic can use deterministic structural lineage.

-- Ensure list identifiers are populated on both legacy and new columns.
UPDATE clickup_lists
SET clickup_list_id = list_id
WHERE clickup_list_id IS NULL
  AND list_id IS NOT NULL;

UPDATE clickup_lists
SET list_id = clickup_list_id
WHERE list_id IS NULL
  AND clickup_list_id IS NOT NULL;

-- Keep a stable human title for UI rendering.
UPDATE clickup_lists
SET title = COALESCE(NULLIF(title, ''), metadata->>'source_name', reference_name, 'ClickUp list')
WHERE title IS NULL OR title = '';

-- Ensure reference_name is never null and remains unique per user.
UPDATE clickup_lists
SET reference_name = CONCAT(COALESCE(space_id, metadata->>'space_id', 'space'), ':', COALESCE(NULLIF(title, ''), 'ClickUp list'))
WHERE reference_name IS NULL OR reference_name = '';

-- If collisions still exist, disambiguate by appending the row id.
WITH dupes AS (
  SELECT id, user_id, reference_name,
         ROW_NUMBER() OVER (PARTITION BY user_id, reference_name ORDER BY created_at, id) AS rn
  FROM clickup_lists
)
UPDATE clickup_lists cl
SET reference_name = CONCAT(cl.reference_name, ':', cl.id::text)
FROM dupes
WHERE dupes.id = cl.id
  AND dupes.rn > 1;
