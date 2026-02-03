DO $$ BEGIN
 CREATE TYPE "migration_status" AS ENUM('IN-PROGRESS', 'COMPLETED', 'FAILED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'MIGRATION';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dictionary_migration" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"from_dictionary_id" integer NOT NULL,
	"to_dictionary_id" integer NOT NULL,
	"submission_id" integer NOT NULL,
	"status" "migration_status" NOT NULL,
	"retries" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp,
	"created_by" varchar,
	"updated_at" timestamp,
	"updated_by" varchar
);
--> statement-breakpoint
ALTER TABLE "audit_submitted_data" ADD COLUMN "errors" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dictionary_migration" ADD CONSTRAINT "dictionary_migration_category_id_dictionary_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "dictionary_categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dictionary_migration" ADD CONSTRAINT "dictionary_migration_from_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("from_dictionary_id") REFERENCES "dictionaries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dictionary_migration" ADD CONSTRAINT "dictionary_migration_to_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("to_dictionary_id") REFERENCES "dictionaries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dictionary_migration" ADD CONSTRAINT "dictionary_migration_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
