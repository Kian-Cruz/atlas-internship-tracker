-- Run as the project database owner. Never expose this schema in Data API settings.
CREATE SCHEMA IF NOT EXISTS atlas;
REVOKE ALL ON SCHEMA atlas FROM PUBLIC;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='atlas_app') THEN
  CREATE ROLE atlas_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
 END IF;
 EXECUTE format('GRANT atlas_app TO %I', current_user);
END $$;
SET search_path TO atlas, pg_catalog;


CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"industry" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"contact_email" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);

CREATE UNIQUE INDEX "companies_id_owner" ON "companies" ("id","user_id");

CREATE UNIQUE INDEX "companies_owner_name" ON "companies" ("user_id","name_key");

CREATE INDEX "companies_owner_updated" ON "companies" ("user_id","updated_at");

CREATE TABLE "applications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"company_id" text NOT NULL,
	"role" text NOT NULL,
	"stage" text DEFAULT 'Wishlist' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"work_mode" text DEFAULT 'Hybrid' NOT NULL,
	"job_url" text DEFAULT '' NOT NULL,
	"applied_on" text DEFAULT '' NOT NULL,
	"deadline" text DEFAULT '' NOT NULL,
	"priority" text DEFAULT 'Normal' NOT NULL,
	"compensation" text DEFAULT '' NOT NULL,
	"next_step" text DEFAULT '' NOT NULL,
	"change_token" text NOT NULL,
	FOREIGN KEY ("company_id","user_id") REFERENCES "companies"("id","user_id") ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "application_stage" CHECK("applications"."stage" IN ('Wishlist','Applied','Screening','Interview','Offer','Accepted','Rejected','Withdrawn'))
);

CREATE UNIQUE INDEX "applications_id_owner" ON "applications" ("id","user_id");

CREATE INDEX "applications_owner_updated" ON "applications" ("user_id","updated_at");

CREATE INDEX "applications_company_owner" ON "applications" ("company_id","user_id");

CREATE TABLE "interviews" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"application_id" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"format" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"meeting_url" text DEFAULT '' NOT NULL,
	"interviewer" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Scheduled' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	FOREIGN KEY ("application_id","user_id") REFERENCES "applications"("id","user_id") ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "interview_status" CHECK("interviews"."status" IN ('Scheduled','Completed','Cancelled'))
);

CREATE INDEX "interviews_owner_start" ON "interviews" ("user_id","starts_at");

CREATE INDEX "interviews_application_owner" ON "interviews" ("application_id","user_id");

CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"application_id" text NOT NULL,
	"body" text NOT NULL,
	FOREIGN KEY ("application_id","user_id") REFERENCES "applications"("id","user_id") ON UPDATE no action ON DELETE cascade
);

CREATE INDEX "notes_owner_updated" ON "notes" ("user_id","updated_at");

CREATE INDEX "notes_application_owner" ON "notes" ("application_id","user_id");

CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"application_id" text,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"filename" text NOT NULL,
	"size" integer NOT NULL,
	"content_type" text NOT NULL,
	"object_key" text NOT NULL,
 "deleting" integer NOT NULL DEFAULT 0 CHECK (deleting IN (0,1)),
 CHECK (size > 0 AND size <= 4194304),
	FOREIGN KEY ("application_id","user_id") REFERENCES "applications"("id","user_id") ON UPDATE no action ON DELETE restrict
);

CREATE INDEX "documents_owner_updated" ON "documents" ("user_id","updated_at");

CREATE INDEX "documents_application_owner" ON "documents" ("application_id","user_id");

CREATE TABLE "stage_history" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"application_id" text NOT NULL,
	"from_stage" text,
	"to_stage" text NOT NULL,
	"created_at" text NOT NULL,
	FOREIGN KEY ("application_id","user_id") REFERENCES "applications"("id","user_id") ON UPDATE no action ON DELETE cascade
);

CREATE INDEX "history_owner_date" ON "stage_history" ("user_id","created_at");

CREATE INDEX "history_application_owner" ON "stage_history" ("application_id","user_id");

CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" bigint NOT NULL
);

CREATE INDEX "rate_limits_expiry" ON "rate_limits" ("reset_at");

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
CREATE POLICY student_owns_rows ON companies TO atlas_app
 USING (user_id::text = current_setting('atlas.user_id', true))
 WITH CHECK (user_id::text = current_setting('atlas.user_id', true));

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications FORCE ROW LEVEL SECURITY;
CREATE POLICY student_owns_rows ON applications TO atlas_app
 USING (user_id::text = current_setting('atlas.user_id', true))
 WITH CHECK (user_id::text = current_setting('atlas.user_id', true));

ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews FORCE ROW LEVEL SECURITY;
CREATE POLICY student_owns_rows ON interviews TO atlas_app
 USING (user_id::text = current_setting('atlas.user_id', true))
 WITH CHECK (user_id::text = current_setting('atlas.user_id', true));

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes FORCE ROW LEVEL SECURITY;
CREATE POLICY student_owns_rows ON notes TO atlas_app
 USING (user_id::text = current_setting('atlas.user_id', true))
 WITH CHECK (user_id::text = current_setting('atlas.user_id', true));

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
CREATE POLICY student_owns_rows ON documents TO atlas_app
 USING (user_id::text = current_setting('atlas.user_id', true))
 WITH CHECK (user_id::text = current_setting('atlas.user_id', true));

ALTER TABLE stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_history FORCE ROW LEVEL SECURITY;
CREATE POLICY student_owns_rows ON stage_history TO atlas_app
 USING (user_id::text = current_setting('atlas.user_id', true))
 WITH CHECK (user_id::text = current_setting('atlas.user_id', true));

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits FORCE ROW LEVEL SECURITY;
CREATE POLICY student_owns_rows ON rate_limits TO atlas_app
 USING (key::text = current_setting('atlas.user_id', true))
 WITH CHECK (key::text = current_setting('atlas.user_id', true));

GRANT USAGE ON SCHEMA atlas TO atlas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA atlas TO atlas_app;
RESET search_path;
