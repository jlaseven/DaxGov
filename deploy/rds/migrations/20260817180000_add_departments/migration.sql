-- CreateTable
CREATE TABLE "Department" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_departmentKey_key" ON "Department"("departmentKey");

-- CreateIndex
CREATE INDEX "Department_name_idx" ON "Department"("name");

-- Backfill from existing ISRA assessments and information assets.
INSERT INTO "Department" ("name", "departmentKey", "createdAt", "updatedAt")
SELECT
    "name",
    "departmentKey",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT MIN("department") AS "name", "departmentKey"
    FROM "IsraAssessment"
    GROUP BY "departmentKey"
    UNION
    SELECT MIN("department") AS "name", "departmentKey"
    FROM "InformationAsset"
    WHERE "departmentKey" NOT IN (SELECT "departmentKey" FROM "IsraAssessment")
    GROUP BY "departmentKey"
);
