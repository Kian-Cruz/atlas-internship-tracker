SET search_path TO atlas, pg_catalog;
ALTER TABLE skill_analyses ADD COLUMN "skill_progress" text DEFAULT '{}' NOT NULL;
RESET search_path;