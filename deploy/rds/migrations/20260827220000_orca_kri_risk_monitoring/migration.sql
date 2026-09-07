-- AlterTable
ALTER TABLE "KriRecord" ADD COLUMN "unit" TEXT;
ALTER TABLE "KriRecord" ADD COLUMN "direction" TEXT;
ALTER TABLE "KriRecord" ADD COLUMN "frequency" TEXT;
ALTER TABLE "KriRecord" ADD COLUMN "dataSource" TEXT;
ALTER TABLE "KriRecord" ADD COLUMN "owner" TEXT;

-- CreateTable
CREATE TABLE "OrcaMonitoringProfile" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "orcaRiskId" INTEGER NOT NULL,
    "kriMonitoringRequired" BOOLEAN,
    "monitoringRationale" TEXT,
    "monitoringFrequency" TEXT,
    "monitoringOwner" TEXT,
    "nextMonitoringReviewDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrcaMonitoringProfile_orcaRiskId_fkey" FOREIGN KEY ("orcaRiskId") REFERENCES "OrcaRisk" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KriThreshold" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "kriRecordId" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "goodMin" DOUBLE PRECISION,
    "goodMax" DOUBLE PRECISION,
    "warningMin" DOUBLE PRECISION,
    "warningMax" DOUBLE PRECISION,
    "breachMin" DOUBLE PRECISION,
    "breachMax" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KriThreshold_kriRecordId_fkey" FOREIGN KEY ("kriRecordId") REFERENCES "KriRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KriSubmission" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "kriRecordId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "actualValue" DOUBLE PRECISION,
    "status" TEXT,
    "remarks" TEXT,
    "evidenceLink" TEXT,
    "submittedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KriSubmission_kriRecordId_fkey" FOREIGN KEY ("kriRecordId") REFERENCES "KriRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrcaRiskReview" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "orcaRiskId" INTEGER NOT NULL,
    "kriRecordId" INTEGER,
    "kriSubmissionId" INTEGER,
    "year" INTEGER,
    "month" INTEGER,
    "triggerType" TEXT NOT NULL,
    "triggerDetails" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "decision" TEXT,
    "rationale" TEXT,
    "oldLikelihood" TEXT,
    "oldImpact" TEXT,
    "oldResidualScore" INTEGER,
    "newLikelihood" TEXT,
    "newImpact" TEXT,
    "newResidualScore" INTEGER,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrcaRiskReview_orcaRiskId_fkey" FOREIGN KEY ("orcaRiskId") REFERENCES "OrcaRisk" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrcaRiskReview_kriRecordId_fkey" FOREIGN KEY ("kriRecordId") REFERENCES "KriRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrcaRiskReview_kriSubmissionId_fkey" FOREIGN KEY ("kriSubmissionId") REFERENCES "KriSubmission" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OrcaMonitoringProfile_orcaRiskId_key" ON "OrcaMonitoringProfile"("orcaRiskId");

-- CreateIndex
CREATE UNIQUE INDEX "KriThreshold_kriRecordId_key" ON "KriThreshold"("kriRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "KriSubmission_kriRecordId_year_month_key" ON "KriSubmission"("kriRecordId", "year", "month");

-- CreateIndex
CREATE INDEX "KriSubmission_year_month_idx" ON "KriSubmission"("year", "month");

-- CreateIndex
CREATE INDEX "OrcaRiskReview_orcaRiskId_status_idx" ON "OrcaRiskReview"("orcaRiskId", "status");

-- CreateIndex
CREATE INDEX "OrcaRiskReview_kriRecordId_idx" ON "OrcaRiskReview"("kriRecordId");
