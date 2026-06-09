DO $$ BEGIN
 CREATE TYPE "submission_record_state" AS ENUM('RECEIVED', 'VALID', 'INVALID');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "submission_record_type" AS ENUM('INSERT', 'UPDATE', 'DELETE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "submission_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"file_name" varchar NOT NULL,
	"entity_name" varchar NOT NULL,
	"file_size" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "submission_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_id" integer NOT NULL,
	"data" jsonb NOT NULL,
	"action_type" "submission_record_type" NOT NULL,
	"errors" jsonb,
	"state" "submission_record_state" NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submission_files_submission_id_index" ON "submission_files" ("submission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submission_records_file_id_index" ON "submission_records" ("file_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submission_records" ADD CONSTRAINT "submission_records_file_id_submission_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "submission_files"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
