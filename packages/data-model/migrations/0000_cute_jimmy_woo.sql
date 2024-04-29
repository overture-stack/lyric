DO $$ BEGIN
 CREATE TYPE "submission_state" AS ENUM('OPEN', 'VALID', 'INVALID', 'CLOSED', 'COMMITTED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dictionaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"dictionary" jsonb NOT NULL,
	"dictionary_category_id" integer,
	"name" varchar NOT NULL,
	"version" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dictionary_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"active_dictionary_id" integer,
	"name" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar,
	"updated_at" timestamp,
	"updated_by" varchar,
	CONSTRAINT "dictionary_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"dictionary_category_id" integer,
	"dictionary_id" integer,
	"errors" jsonb,
	"organization" varchar NOT NULL,
	"state" "submission_state",
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" varchar
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "submitted_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"data" jsonb,
	"dictionary_category_id" integer,
	"entity_name" varchar NOT NULL,
	"is_valid" boolean,
	"last_valid_schema_id" integer,
	"organization" varchar NOT NULL,
	"original_schema_id" integer,
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" varchar
);
--> statement-breakpoint
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
