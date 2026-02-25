-- Add explicit space selection logic for deterministic multi-space routing

-- Add priority_rank for deterministic ordering within domains
ALTER TABLE clickup_spaces 
ADD COLUMN priority_rank INTEGER DEFAULT 999;

-- Add is_default flag for primary space per domain per user
ALTER TABLE clickup_spaces 
ADD COLUMN is_default BOOLEAN DEFAULT FALSE;

-- Add space_type for intent-to-space mapping within domains
ALTER TABLE clickup_spaces 
ADD COLUMN space_type TEXT;

-- Create constraint for valid space types
ALTER TABLE clickup_spaces 
ADD CONSTRAINT valid_space_type 
CHECK (space_type IN (
  'sales_pipeline', 'ops', 'admin', 'general', 
  'client_work', 'internal', 'projects', 'meetings'
));

-- Ensure only one default space per domain per user
CREATE UNIQUE INDEX one_default_per_domain_per_user 
ON clickup_spaces (user_id, domain) 
WHERE is_default = TRUE;

-- Add index for priority ordering
CREATE INDEX idx_clickup_spaces_priority 
ON clickup_spaces (domain, priority_rank ASC);

-- Update existing spaces with reasonable defaults
UPDATE clickup_spaces 
SET 
  priority_rank = CASE 
    WHEN name ILIKE '%global payments%' THEN 1
    WHEN name ILIKE '%work%' THEN 2
    WHEN name ILIKE '%health%' THEN 1
    WHEN name ILIKE '%finance%' THEN 1
    ELSE 999
  END,
  space_type = CASE 
    WHEN name ILIKE '%global payments%' THEN 'sales_pipeline'
    WHEN name ILIKE '%health%' OR name ILIKE '%fitness%' THEN 'general'
    WHEN name ILIKE '%finance%' THEN 'admin'
    ELSE 'general'
  END,
  is_default = CASE 
    WHEN name ILIKE '%global payments%' THEN TRUE
    WHEN name ILIKE '%health & fitness%' THEN TRUE
    WHEN name ILIKE '%finance%' THEN TRUE
    ELSE FALSE
  END;
