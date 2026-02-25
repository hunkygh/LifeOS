-- Remove obsolete life_areas concept completely
-- This migration drops all life_areas related tables and references

-- Drop foreign key constraints first
ALTER TABLE clickup_lists DROP COLUMN IF EXISTS life_area_id;

-- Drop the main life_areas table
DROP TABLE IF EXISTS life_areas CASCADE;

-- Drop the database function
DROP FUNCTION IF EXISTS initialize_user_life_areas CASCADE;

-- Update any remaining references in other tables if they exist
-- (This is a safety measure for any missed references)
