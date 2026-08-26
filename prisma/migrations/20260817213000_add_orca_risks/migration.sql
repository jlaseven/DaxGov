-- CreateTable
CREATE TABLE "OrcaRisk" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "processNo" TEXT NOT NULL,
    "process" TEXT NOT NULL,
    "riskNo" TEXT NOT NULL,
    "riskCategory" TEXT,
    "riskThreat" TEXT NOT NULL,
    "cause" TEXT,
    "inherentLikelihood" TEXT,
    "riskStrategy" TEXT,
    "existingKeyControls" TEXT,
    "controlEffectivity" TEXT,
    "overallControlEffectivenessRemarks" TEXT,
    "impactCategory" TEXT,
    "impactPerRisk" TEXT,
    "inherentImpactRating" TEXT,
    "inherentRiskScore" INTEGER,
    "inherentRiskRatingRemarks" TEXT,
    "residualLikelihoodRating" TEXT,
    "residualImpactRating" TEXT,
    "residualRiskScore" INTEGER,
    "residualRiskRemarks" TEXT,
    "riskManagementRemarks" TEXT,
    "actionItemRequired" TEXT,
    "riskAcceptanceRequired" TEXT,
    "riskAcceptanceFormLink" TEXT,
    "actionItems" TEXT,
    "targetCompletionDate" DATETIME,
    "status" TEXT,
    "residualLikelihood" INTEGER,
    "residualImpact" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "OrcaRisk_riskNo_key" ON "OrcaRisk"("riskNo");

-- CreateIndex
CREATE INDEX "OrcaRisk_processNo_idx" ON "OrcaRisk"("processNo");

-- CreateIndex
CREATE INDEX "OrcaRisk_status_idx" ON "OrcaRisk"("status");

-- CreateIndex
CREATE INDEX "OrcaRisk_controlEffectivity_idx" ON "OrcaRisk"("controlEffectivity");

-- CreateIndex
CREATE INDEX "OrcaRisk_sortOrder_idx" ON "OrcaRisk"("sortOrder");
