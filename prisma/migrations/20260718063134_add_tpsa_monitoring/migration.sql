-- CreateTable
CREATE TABLE "TpsaRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tpsaReference" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "vendorLegalEntity" TEXT,
    "productService" TEXT NOT NULL,
    "businessProcessOwner" TEXT,
    "department" TEXT,
    "reviewerName" TEXT NOT NULL,
    "vendorType" TEXT NOT NULL DEFAULT 'New Vendor',
    "vendorTier" TEXT NOT NULL DEFAULT 'Not Yet Assigned',
    "tierJustification" TEXT,
    "tierAssignedBy" TEXT,
    "tierAssignmentDate" DATETIME,
    "assessmentType" TEXT NOT NULL DEFAULT 'Not Yet Determined',
    "assessmentReason" TEXT,
    "assessmentScope" TEXT,
    "businessCriticality" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "verdict" TEXT NOT NULL DEFAULT 'Pending',
    "verdictDate" DATETIME,
    "verdictIssuedBy" TEXT,
    "verdictJustification" TEXT,
    "conditionsRestrictions" TEXT,
    "requiredEvidenceReceived" BOOLEAN NOT NULL DEFAULT false,
    "cybersecurityReviewCompleted" BOOLEAN NOT NULL DEFAULT false,
    "sentDate" DATETIME,
    "submissionDeadline" DATETIME,
    "submittedDate" DATETIME,
    "reviewStartDate" DATETIME,
    "reviewDeadline" DATETIME,
    "reviewCompletedDate" DATETIME,
    "remediationDeadline" DATETIME,
    "lastFollowUpDate" DATETIME,
    "nextFollowUpDate" DATETIME,
    "nextReassessmentDate" DATETIME,
    "openCriticalFindings" INTEGER NOT NULL DEFAULT 0,
    "openHighFindings" INTEGER NOT NULL DEFAULT 0,
    "openMediumFindings" INTEGER NOT NULL DEFAULT 0,
    "openLowFindings" INTEGER NOT NULL DEFAULT 0,
    "findingsSummary" TEXT,
    "compensatingControls" TEXT,
    "highFindingsTreatmentStatus" TEXT NOT NULL DEFAULT 'Not Applicable',
    "remediationNotes" TEXT,
    "rafStatus" TEXT NOT NULL DEFAULT 'Not Required',
    "rafLink" TEXT,
    "rafApprovalDate" DATETIME,
    "rafExpirationDate" DATETIME,
    "rafApprovingAuthority" TEXT,
    "rafConditions" TEXT,
    "rafNotes" TEXT,
    "questionnaireLink" TEXT,
    "evidenceFolderLink" TEXT,
    "assessmentReportLink" TEXT,
    "otherDocumentLink" TEXT,
    "remarks" TEXT,
    "reassessmentTrigger" TEXT,
    "previousAssessmentId" INTEGER,
    "archivedAt" DATETIME,
    "archiveReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL DEFAULT 'Local User',
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT NOT NULL DEFAULT 'Local User',
    CONSTRAINT "TpsaRecord_previousAssessmentId_fkey" FOREIGN KEY ("previousAssessmentId") REFERENCES "TpsaRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TpsaCertification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tpsaRecordId" INTEGER NOT NULL,
    "certificationType" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "issuingOrganization" TEXT,
    "issueDate" DATETIME,
    "expirationDate" DATETIME,
    "legalEntityCovered" TEXT,
    "productServiceCovered" TEXT,
    "scopeNotes" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'Pending Review',
    "reviewDate" DATETIME,
    "reviewedBy" TEXT,
    "reviewNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL DEFAULT 'Local User',
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT NOT NULL DEFAULT 'Local User',
    CONSTRAINT "TpsaCertification_tpsaRecordId_fkey" FOREIGN KEY ("tpsaRecordId") REFERENCES "TpsaRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TpsaFollowUp" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tpsaRecordId" INTEGER NOT NULL,
    "followUpDate" DATETIME NOT NULL,
    "method" TEXT NOT NULL,
    "personContacted" TEXT,
    "organizationDepartment" TEXT,
    "notes" TEXT,
    "responseReceived" BOOLEAN NOT NULL DEFAULT false,
    "responseSummary" TEXT,
    "nextFollowUpDate" DATETIME,
    "recordedBy" TEXT NOT NULL DEFAULT 'Local User',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TpsaFollowUp_tpsaRecordId_fkey" FOREIGN KEY ("tpsaRecordId") REFERENCES "TpsaRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TpsaRecord_tpsaReference_key" ON "TpsaRecord"("tpsaReference");

-- CreateIndex
CREATE INDEX "TpsaRecord_status_idx" ON "TpsaRecord"("status");

-- CreateIndex
CREATE INDEX "TpsaRecord_verdict_idx" ON "TpsaRecord"("verdict");

-- CreateIndex
CREATE INDEX "TpsaRecord_vendorName_idx" ON "TpsaRecord"("vendorName");

-- CreateIndex
CREATE INDEX "TpsaRecord_vendorTier_idx" ON "TpsaRecord"("vendorTier");

-- CreateIndex
CREATE INDEX "TpsaRecord_reviewerName_idx" ON "TpsaRecord"("reviewerName");

-- CreateIndex
CREATE INDEX "TpsaRecord_submissionDeadline_idx" ON "TpsaRecord"("submissionDeadline");

-- CreateIndex
CREATE INDEX "TpsaRecord_reviewDeadline_idx" ON "TpsaRecord"("reviewDeadline");

-- CreateIndex
CREATE INDEX "TpsaRecord_nextFollowUpDate_idx" ON "TpsaRecord"("nextFollowUpDate");

-- CreateIndex
CREATE INDEX "TpsaRecord_nextReassessmentDate_idx" ON "TpsaRecord"("nextReassessmentDate");

-- CreateIndex
CREATE INDEX "TpsaCertification_tpsaRecordId_idx" ON "TpsaCertification"("tpsaRecordId");

-- CreateIndex
CREATE INDEX "TpsaCertification_expirationDate_idx" ON "TpsaCertification"("expirationDate");

-- CreateIndex
CREATE INDEX "TpsaCertification_reviewStatus_idx" ON "TpsaCertification"("reviewStatus");

-- CreateIndex
CREATE INDEX "TpsaFollowUp_tpsaRecordId_idx" ON "TpsaFollowUp"("tpsaRecordId");

-- CreateIndex
CREATE INDEX "TpsaFollowUp_followUpDate_idx" ON "TpsaFollowUp"("followUpDate");

-- CreateIndex
CREATE INDEX "TpsaFollowUp_nextFollowUpDate_idx" ON "TpsaFollowUp"("nextFollowUpDate");
