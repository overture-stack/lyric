ALTER TABLE "audit_submitted_data" RENAME COLUMN "updatedAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "audit_submitted_data" RENAME COLUMN "updatedBy" TO "created_by";--> statement-breakpoint
ALTER TABLE "audit_submitted_data" ADD COLUMN "data_diff" jsonb;--> statement-breakpoint
ALTER TABLE "audit_submitted_data" ADD COLUMN "submission_id" integer NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_submitted_data" ADD CONSTRAINT "audit_submitted_data_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "audit_submitted_data" DROP COLUMN IF EXISTS "comment";--> statement-breakpoint
ALTER TABLE "audit_submitted_data" DROP COLUMN IF EXISTS "new_data";--> statement-breakpoint
ALTER TABLE "audit_submitted_data" DROP COLUMN IF EXISTS "old_data";