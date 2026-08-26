CREATE TABLE "InformationAsset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "department" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "sourceAssetKey" TEXT NOT NULL,
    "sourceQuestion" TEXT NOT NULL,
    "daxonAssessmentId" INTEGER,
    "assetName" TEXT NOT NULL,
    "assetType" TEXT,
    "businessImpact" TEXT,
    "threat" TEXT,
    "vulnerability" TEXT,
    "likelihood" TEXT,
    "impact" TEXT,
    "riskLevel" TEXT,
    "existingControls" TEXT,
    "researchSources" TEXT,
    "researchUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InformationAsset_daxonAssessmentId_fkey" FOREIGN KEY ("daxonAssessmentId") REFERENCES "IsraAssessment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "InformationAsset_departmentKey_sourceAssetKey_key" ON "InformationAsset"("departmentKey", "sourceAssetKey");
CREATE INDEX "InformationAsset_departmentKey_idx" ON "InformationAsset"("departmentKey");
CREATE INDEX "InformationAsset_daxonAssessmentId_idx" ON "InformationAsset"("daxonAssessmentId");
CREATE INDEX "InformationAsset_researchUpdatedAt_idx" ON "InformationAsset"("researchUpdatedAt");
