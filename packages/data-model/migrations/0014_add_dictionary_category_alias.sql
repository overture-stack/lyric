ALTER TABLE "dictionary_categories" ADD COLUMN "alias" varchar;--> statement-breakpoint
ALTER TABLE "dictionary_categories" ADD CONSTRAINT "dictionary_categories_alias_unique" UNIQUE("alias");