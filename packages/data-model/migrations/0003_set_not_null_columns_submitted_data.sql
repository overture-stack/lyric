ALTER TABLE "submissions" ALTER COLUMN "dictionary_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "submitted_data" ALTER COLUMN "dictionary_category_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "submitted_data" ALTER COLUMN "is_valid" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "submitted_data" ALTER COLUMN "last_valid_schema_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "submitted_data" ALTER COLUMN "original_schema_id" SET NOT NULL;