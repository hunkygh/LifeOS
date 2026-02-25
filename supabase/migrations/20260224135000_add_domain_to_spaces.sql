-- Add domain column to clickup_spaces for structured domain categorization

ALTER TABLE clickup_spaces 
ADD COLUMN domain TEXT NOT NULL DEFAULT 'general';

-- Create check constraint to ensure valid domains
ALTER TABLE clickup_spaces 
ADD CONSTRAINT valid_domain 
CHECK (domain IN ('work', 'health', 'finance', 'general'));

-- Update existing spaces with appropriate domains based on their names
UPDATE clickup_spaces 
SET domain = CASE 
  WHEN name ILIKE '%work%' OR name ILIKE '%global%' OR name ILIKE '%business%' THEN 'work'
  WHEN name ILIKE '%health%' OR name ILIKE '%fitness%' OR name ILIKE '%medical%' THEN 'health'
  WHEN name ILIKE '%finance%' OR name ILIKE '%tracking%' OR name ILIKE '%expense%' THEN 'finance'
  ELSE 'general'
END;

-- Add index for faster domain filtering
CREATE INDEX idx_clickup_spaces_domain ON clickup_spaces(domain);
