ALTER TABLE "dictionaries" DROP CONSTRAINT "dictionaries_dictionary_category_id_dictionary_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "dictionaries" DROP COLUMN IF EXISTS "dictionary_category_id";