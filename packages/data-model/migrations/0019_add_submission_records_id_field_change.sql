ALTER TABLE "submission_records" ADD COLUMN "id_field_change" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_records" ADD COLUMN "parent_record_id" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submission_records_parent_record_id_index" ON "submission_records" ("parent_record_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submission_records" ADD CONSTRAINT "submission_records_parent_record_id_submission_records_id_fk" FOREIGN KEY ("parent_record_id") REFERENCES "submission_records"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
