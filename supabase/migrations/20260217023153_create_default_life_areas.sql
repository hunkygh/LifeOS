-- Insert default Life Areas for each user
-- These will be created when a user first signs up via trigger or manually

-- Note: These are the default categories that should exist for every user
-- General category is for items that don't fit in specific categories

-- We'll create a function to initialize default life areas for new users
CREATE OR REPLACE FUNCTION initialize_user_life_areas(user_uuid UUID)
RETURNS VOID AS $$
DECLARE
  area_id UUID;
BEGIN
  -- General category (always exists)
  INSERT INTO life_areas (name, user_id, context, goals, instructions, metadata)
  VALUES (
    'General',
    user_uuid,
    'General tasks and activities that don''t fit into specific categories',
    '[]'::jsonb,
    'Handle general tasks and miscellaneous items that don''t require specialized context',
    '{"is_default": true, "priority": 1}'
  )
  RETURNING id INTO area_id;

  -- Health & Fitness
  INSERT INTO life_areas (name, user_id, context, goals, instructions, metadata)
  VALUES (
    'Health & Fitness',
    user_uuid,
    'Physical health, exercise routines, medical appointments, wellness activities',
    '[]'::jsonb,
    'Focus on maintaining physical health through regular exercise, proper nutrition, and preventive care',
    '{"is_default": true, "priority": 2}'
  );

  -- Finance
  INSERT INTO life_areas (name, user_id, context, goals, instructions, metadata)
  VALUES (
    'Finance',
    user_uuid,
    'Financial planning, budgeting, investments, bills, and financial goals',
    '[]'::jsonb,
    'Manage financial resources effectively, track expenses, and work toward financial stability',
    '{"is_default": true, "priority": 3}'
  );

  -- Work (Global Payments)
  INSERT INTO life_areas (name, user_id, context, goals, instructions, metadata)
  VALUES (
    'Work - Global Payments',
    user_uuid,
    'Professional responsibilities, projects, meetings, and career development at Global Payments',
    '[]'::jsonb,
    'Focus on work responsibilities, project deliverables, and professional growth',
    '{"is_default": true, "priority": 4}'
  );

  -- Meal Planning
  INSERT INTO life_areas (name, user_id, context, goals, instructions, metadata)
  VALUES (
    'Meal Planning',
    user_uuid,
    'Meal preparation, grocery shopping, nutrition planning, and dietary goals',
    '[]'::jsonb,
    'Plan nutritious meals, manage grocery shopping, and maintain healthy eating habits',
    '{"is_default": true, "priority": 5}'
  );

  -- Workouts
  INSERT INTO life_areas (name, user_id, context, goals, instructions, metadata)
  VALUES (
    'Workouts',
    user_uuid,
    'Exercise routines, fitness goals, training schedules, and workout planning',
    '[]'::jsonb,
    'Plan and execute effective workout routines to achieve fitness objectives',
    '{"is_default": true, "priority": 6}'
  );
END;
$$ LANGUAGE plpgsql;

-- Create trigger to initialize life areas for new users
-- This will run when a new user signs up
CREATE OR REPLACE FUNCTION auto_init_life_areas()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM initialize_user_life_areas(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on auth.users for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION auto_init_life_areas();