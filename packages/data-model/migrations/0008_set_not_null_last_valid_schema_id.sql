ALTER TABLE "audit_submitted_data" ALTER COLUMN "last_valid_schema_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "submitted_data" ALTER COLUMN "last_valid_schema_id" DROP NOT NULL;