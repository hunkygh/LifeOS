-- Add hierarchical structure to life_areas and create clickup_lists table

-- Add list configuration to life_areas table
ALTER TABLE life_areas 
ADD COLUMN clickup_lists JSONB DEFAULT '[]'::jsonb;

-- Create clickup_lists table for list-specific configuration
CREATE TABLE IF NOT EXISTS clickup_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  life_area_id UUID REFERENCES life_areas(id) ON DELETE CASCADE,
  clickup_list_id TEXT NOT NULL,
  title TEXT NOT NULL,
  context TEXT,
  instructions TEXT,
  goals JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Add RLS policies for clickup_lists
ALTER TABLE clickup_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own clickup lists"
  ON clickup_lists
  FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own clickup lists"
  ON clickup_lists
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clickup lists"
  ON clickup_lists
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clickup lists"
  ON clickup_lists
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_clickup_lists_life_area_id ON clickup_lists(life_area_id);
CREATE INDEX IF NOT EXISTS idx_clickup_lists_user_id ON clickup_lists(user_id);
