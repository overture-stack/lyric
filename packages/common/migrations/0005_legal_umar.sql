ALTER TABLE "submissions" ALTER COLUMN "organization" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "submitted_data" ALTER COLUMN "organization" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "updated_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "updatedBy" varchar;