ALTER TABLE "submissions" ADD COLUMN "published_at" timestamp;
UPDATE "submissions" SET "published_at" = '1970-01-01 00:00:00' WHERE "status" = 'COMMITTED';
