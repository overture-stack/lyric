ALTER TABLE "submitted_data" ADD COLUMN "system_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "submitted_data" ADD CONSTRAINT "submitted_data_system_id_unique" UNIQUE("system_id");