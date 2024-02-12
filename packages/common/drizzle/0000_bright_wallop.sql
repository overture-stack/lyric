DO $$ BEGIN
 CREATE TYPE "submission_state" AS ENUM('open', 'valid', 'invalid');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dictionaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"version" varchar NOT NULL,
	"dictionary_category_id" integer,
	"dictionary" jsonb,
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dictionary_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"active_dictionary_id" integer,
	"created_at" timestamp DEFAULT now(),
	"udpated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"state" "submission_state",
	"dictionary_category_id" integer,
	"data" jsonb NOT NULL,
	"errors" jsonb,
	"dictionary_id" integer,
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "submitted_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"data" jsonb,
	"entity_name" varchar NOT NULL,
	"dictionary_category_id" integer,
	"last_valid_schema_id" integer,
	"original_schema_id" integer,
	"is_valid" boolean,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" varchar
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dictionary_categories" ADD CONSTRAINT "dictionary_categories_active_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("active_dictionary_id") REFERENCES "dictionaries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
