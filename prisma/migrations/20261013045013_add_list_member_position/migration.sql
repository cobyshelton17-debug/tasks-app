-- AlterTable
ALTER TABLE "ListMember" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- Backfill per-user list order from existing join order
UPDATE "ListMember" AS lm
SET "position" = sub.rn - 1
FROM (
  SELECT "id",
         row_number() OVER (PARTITION BY "userId" ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "ListMember"
) AS sub
WHERE lm."id" = sub."id";
