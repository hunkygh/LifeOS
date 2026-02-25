-- Create clickup_spaces table to store ClickUp spaces linked to workspaces

CREATE TABLE IF NOT EXISTS clickup_spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clickup_space_id TEXT UNIQUE NOT NULL,
  name TEXT,
  workspace_id TEXT NOT NULL REFERENCES clickup_workspaces(clickup_workspace_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE clickup_spaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own spaces"
  ON clickup_spaces
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own spaces"
  ON clickup_spaces
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own spaces"
  ON clickup_spaces
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own spaces"
  ON clickup_spaces
  FOR DELETE
  USING (auth.uid() = user_id);

-- Extend clickup_lists with space linkage
ALTER TABLE clickup_lists
  ADD COLUMN IF NOT EXISTS space_id TEXT REFERENCES clickup_spaces(clickup_space_id);
