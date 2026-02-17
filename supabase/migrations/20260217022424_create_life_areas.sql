-- Create life_areas table as per LOGIC_ARCHITECTURE.md
CREATE TABLE IF NOT EXISTS life_areas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  clickup_space_id TEXT,
  default_list_ids TEXT[] DEFAULT '{}',
  context TEXT,
  goals JSONB DEFAULT '[]',
  instructions TEXT,
  metadata JSONB DEFAULT '{}',
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_life_areas_user_id ON life_areas(user_id);
CREATE INDEX IF NOT EXISTS idx_life_areas_clickup_space_id ON life_areas(clickup_space_id);

-- Enable RLS
ALTER TABLE life_areas ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own life areas" ON life_areas
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own life areas" ON life_areas
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own life areas" ON life_areas
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own life areas" ON life_areas
  FOR DELETE USING (user_id = auth.uid());