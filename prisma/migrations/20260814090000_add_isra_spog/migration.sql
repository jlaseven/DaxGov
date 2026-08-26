CREATE TABLE "IsraAssessment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "department" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "sourceSheet" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "riskCount" INTEGER NOT NULL,
    "qualityFindingCount" INTEGER NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "IsraRisk" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "assessmentId" INTEGER NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "riskReference" TEXT,
    "process" TEXT,
    "description" TEXT,
    "inherentLikelihood" INTEGER,
    "inherentImpact" INTEGER,
    "inherentScore" REAL,
    "importedInherentScore" REAL,
    "existingControls" TEXT,
    "controlEffectiveness" REAL,
    "controlEffectivenessRemarks" TEXT,
    "residualLikelihood" INTEGER,
    "residualImpact" INTEGER,
    "residualScore" REAL,
    "riskTreatment" TEXT,
    "actionPlan" TEXT,
    "actionOwner" TEXT,
    "commitmentDate" DATETIME,
    "rawCommitmentDate" TEXT,
    "evidenceLink" TEXT,
    "inherentRating" TEXT NOT NULL,
    "residualRating" TEXT NOT NULL,
    "manualReview" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "IsraRisk_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "IsraAssessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "IsraQualityFinding" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "assessmentId" INTEGER NOT NULL,
    "severity" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "riskReference" TEXT,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    CONSTRAINT "IsraQualityFinding_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "IsraAssessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "IsraAssessment_departmentKey_isActive_idx" ON "IsraAssessment"("departmentKey", "isActive");
CREATE INDEX "IsraAssessment_importedAt_idx" ON "IsraAssessment"("importedAt");
CREATE INDEX "IsraRisk_assessmentId_idx" ON "IsraRisk"("assessmentId");
CREATE INDEX "IsraRisk_riskReference_idx" ON "IsraRisk"("riskReference");
CREATE INDEX "IsraRisk_inherentRating_idx" ON "IsraRisk"("inherentRating");
CREATE INDEX "IsraRisk_residualRating_idx" ON "IsraRisk"("residualRating");
CREATE INDEX "IsraRisk_commitmentDate_idx" ON "IsraRisk"("commitmentDate");
CREATE INDEX "IsraQualityFinding_assessmentId_idx" ON "IsraQualityFinding"("assessmentId");
CREATE INDEX "IsraQualityFinding_severity_idx" ON "IsraQualityFinding"("severity");
CREATE INDEX "IsraQualityFinding_category_idx" ON "IsraQualityFinding"("category");
