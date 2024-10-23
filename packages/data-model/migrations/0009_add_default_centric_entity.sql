ALTER TABLE "dictionary_categories" ALTER COLUMN "active_dictionary_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dictionary_categories" ADD COLUMN "defaultCentricEntity" varchar;