DO $$ BEGIN
 CREATE TYPE "audit_action" AS ENUM('UPDATE', 'DELETE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_submitted_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" "audit_action" NOT NULL,
	"comment" varchar,
	"dictionary_category_id" integer NOT NULL,
	"entity_name" varchar NOT NULL,
	"last_valid_schema_id" integer NOT NULL,
	"new_data" jsonb,
	"new_data_is_valid" boolean NOT NULL,
	"old_data" jsonb,
	"old_data_is_valid" boolean NOT NULL,
	"organization" varchar NOT NULL,
	"original_schema_id" integer NOT NULL,
	"system_id" varchar NOT NULL,
	"updatedAt" timestamp,
	"updatedBy" varchar
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_submitted_data" ADD CONSTRAINT "audit_submitted_data_dictionary_category_id_dictionary_categories_id_fk" FOREIGN KEY ("dictionary_category_id") REFERENCES "dictionary_categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_submitted_data" ADD CONSTRAINT "audit_submitted_data_last_valid_schema_id_dictionaries_id_fk" FOREIGN KEY ("last_valid_schema_id") REFERENCES "dictionaries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_submitted_data" ADD CONSTRAINT "audit_submitted_data_original_schema_id_dictionaries_id_fk" FOREIGN KEY ("original_schema_id") REFERENCES "dictionaries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
