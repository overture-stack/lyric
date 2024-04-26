ALTER TABLE "dictionary_categories" RENAME COLUMN "udpated_at" TO "updated_at";--> statement-breakpoint
ALTER TABLE "submissions" RENAME COLUMN "updatedBy" TO "updated_by";--> statement-breakpoint
ALTER TABLE "dictionary_categories" DROP CONSTRAINT "dictionary_categories_active_dictionary_id_dictionaries_id_fk";
--> statement-breakpoint
ALTER TABLE "dictionary_categories" ADD COLUMN "created_by" varchar;--> statement-breakpoint
ALTER TABLE "dictionary_categories" ADD COLUMN "updated_by" varchar;--> statement-breakpoint
ALTER TABLE "submitted_data" ADD COLUMN "updated_by" varchar;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dictionaries" ADD CONSTRAINT "dictionaries_dictionary_category_id_dictionary_categories_id_fk" FOREIGN KEY ("dictionary_category_id") REFERENCES "dictionary_categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submissions" ADD CONSTRAINT "submissions_dictionary_category_id_dictionary_categories_id_fk" FOREIGN KEY ("dictionary_category_id") REFERENCES "dictionary_categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submissions" ADD CONSTRAINT "submissions_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "dictionaries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submitted_data" ADD CONSTRAINT "submitted_data_dictionary_category_id_dictionary_categories_id_fk" FOREIGN KEY ("dictionary_category_id") REFERENCES "dictionary_categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submitted_data" ADD CONSTRAINT "submitted_data_last_valid_schema_id_dictionaries_id_fk" FOREIGN KEY ("last_valid_schema_id") REFERENCES "dictionaries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submitted_data" ADD CONSTRAINT "submitted_data_original_schema_id_dictionaries_id_fk" FOREIGN KEY ("original_schema_id") REFERENCES "dictionaries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
