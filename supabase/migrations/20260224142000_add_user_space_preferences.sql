-- Add user-configurable space preferences for intent routing

-- Create user space preferences table
CREATE TABLE IF NOT EXISTS user_space_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intent_type TEXT NOT NULL,
  preferred_space_id TEXT NOT NULL,
  priority_rank INTEGER DEFAULT 999,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- One preference per intent type per user
  UNIQUE(user_id, intent_type)
);

-- Create constraint for valid intent types
ALTER TABLE user_space_preferences 
ADD CONSTRAINT valid_intent_type 
CHECK (intent_type IN (
  'lead', 'workout', 'meeting', 'task', 'event', 'finance', 'health', 'general'
));

-- Add index for fast lookups
CREATE INDEX idx_user_space_preferences_lookup 
ON user_space_preferences(user_id, intent_type, priority_rank);

-- Add fallback column to spaces for when preferences aren't set
ALTER TABLE clickup_spaces 
ADD COLUMN supports_intent_types TEXT[] DEFAULT '{}';

-- Create constraint for valid intent types in array
ALTER TABLE clickup_spaces 
ADD CONSTRAINT valid_supported_intents 
CHECK (
  supports_intent_types <@ ARRAY[
    'lead', 'workout', 'meeting', 'task', 'event', 'finance', 'health', 'general'
  ]
);

-- Update existing spaces with reasonable supported intents
UPDATE clickup_spaces 
SET supports_intent_types = CASE 
  WHEN space_type = 'sales_pipeline' THEN ARRAY['lead', 'meeting', 'task']
  WHEN space_type = 'meetings' THEN ARRAY['meeting', 'event', 'task']
  WHEN space_type = 'admin' THEN ARRAY['finance', 'task', 'meeting']
  WHEN space_type = 'projects' THEN ARRAY['task', 'meeting', 'event']
  WHEN space_type = 'general' THEN ARRAY['task', 'general', 'event']
  ELSE ARRAY['task', 'general']
END;
