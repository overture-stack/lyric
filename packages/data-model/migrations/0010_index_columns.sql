DROP INDEX IF EXISTS "organization_index";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_submitted_data_dictionary_index" ON "audit_submitted_data" ("dictionary_category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_submitted_data_organization_index" ON "audit_submitted_data" ("organization");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_submitted_data_submission_index" ON "audit_submitted_data" ("submission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submission_organization_index" ON "submissions" ("organization");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submission_category_index" ON "submissions" ("dictionary_category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submission_created_by_index" ON "submissions" ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submitted_data_organization_index" ON "submitted_data" ("organization");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submitted_data_category_index" ON "submitted_data" ("dictionary_category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submitted_data_system_id_index" ON "submitted_data" ("system_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submitted_data_entity_name_index" ON "submitted_data" ("entity_name");