-- Run as the project database owner. Never expose this schema in Data API settings.
SET search_path TO atlas, pg_catalog;

CREATE TABLE "skill_analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"document_id" text,
	"application_id" text,
	"job_title" text DEFAULT '' NOT NULL,
	"company_name" text DEFAULT '' NOT NULL,
	"source_url" text DEFAULT '' NOT NULL,
	"job_description" text NOT NULL,
	"resume_skills" text NOT NULL,
	"matched_skills" text NOT NULL,
	"missing_skills" text NOT NULL,
	"suggestions" text NOT NULL,
	"match_score" integer NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	CHECK (match_score >= 0 AND match_score <= 100),
	-- Single-column (not composite with user_id) so ON DELETE SET NULL doesn't try to
	-- null out the NOT NULL user_id column here. Ownership of the referenced row is
	-- verified server-side (via owned()) before it is ever written to this table.
	FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON UPDATE no action ON DELETE SET NULL,
	FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON UPDATE no action ON DELETE SET NULL
);

CREATE UNIQUE INDEX "skill_analyses_id_owner" ON "skill_analyses" ("id","user_id");

CREATE INDEX "skill_analyses_owner_updated" ON "skill_analyses" ("user_id","updated_at");

ALTER TABLE skill_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_analyses FORCE ROW LEVEL SECURITY;
CREATE POLICY student_owns_rows ON skill_analyses TO atlas_app
 USING (user_id::text = (SELECT current_setting('atlas.user_id', true)))
 WITH CHECK (user_id::text = (SELECT current_setting('atlas.user_id', true)));

GRANT SELECT, INSERT, UPDATE, DELETE ON skill_analyses TO atlas_app;
RESET search_path;