CREATE TABLE IF NOT EXISTS "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_name_unique" UNIQUE("name")
);
