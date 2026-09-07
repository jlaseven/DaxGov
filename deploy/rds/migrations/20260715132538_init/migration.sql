-- CreateTable
CREATE TABLE "GovernanceDocument" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "documentName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "cybersecurityPillar" TEXT NOT NULL,
    "commentsRemarks" TEXT,
    "applicableStandards" TEXT,
    "applicableBspRegulations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3)
);

-- CreateTable
CREATE TABLE "OpirAction" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "opirNumber" TEXT NOT NULL,
    "squad" TEXT,
    "riskRating" TEXT NOT NULL,
    "incidentTitle" TEXT NOT NULL,
    "actionOwner" TEXT,
    "solution" TEXT,
    "originalTargetDate" TIMESTAMP(3),
    "updatedTargetDate" TIMESTAMP(3),
    "remarks" TEXT,
    "jiraTicket" TEXT,
    "actionStatus" TEXT NOT NULL DEFAULT 'Todo',
    "lastUpdateDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3)
);

-- CreateTable
CREATE TABLE "AuditFinding" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "findingNumber" TEXT NOT NULL,
    "year" INTEGER,
    "observationId" TEXT,
    "division" TEXT,
    "departmentProcess" TEXT,
    "auditObservation" TEXT NOT NULL,
    "observationDetails" TEXT,
    "riskLevel" TEXT NOT NULL,
    "rootCause" TEXT,
    "risks" TEXT,
    "impact" TEXT,
    "recommendation" TEXT,
    "managementResponse" TEXT,
    "commitmentActionPlan" TEXT,
    "responsibleDepartment" TEXT,
    "responsiblePersonnel" TEXT,
    "reportDate" TIMESTAMP(3),
    "exitMeetingDate" TIMESTAMP(3),
    "originalTargetDate" TIMESTAMP(3),
    "updatedTargetDate" TIMESTAMP(3),
    "managementStatus" TEXT,
    "findingStatus" TEXT NOT NULL DEFAULT 'Open',
    "remarks" TEXT,
    "evidenceReferences" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3)
);

-- CreateTable
CREATE TABLE "Objective" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "objectiveId" TEXT NOT NULL,
    "objectiveName" TEXT NOT NULL,
    "objectiveStatus" TEXT NOT NULL DEFAULT 'Todo',
    "assignees" TEXT,
    "contributors" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "manualProgressOverride" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3)
);

-- CreateTable
CREATE TABLE "OkrTask" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "objectiveId" INTEGER NOT NULL,
    "taskName" TEXT NOT NULL,
    "taskStatus" TEXT NOT NULL DEFAULT 'Todo',
    "assignees" TEXT,
    "contributors" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "OkrTask_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Initiative" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "initiativeName" TEXT NOT NULL,
    "description" TEXT,
    "owner" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Todo',
    "manualOverride" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3)
);

-- CreateTable
CREATE TABLE "SubInitiative" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "initiativeId" INTEGER NOT NULL,
    "subInitiativeName" TEXT NOT NULL,
    "owner" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Todo',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "SubInitiative_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fieldChanged" TEXT,
    "previousValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ApplicationSetting" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "GovernanceDocument_documentName_key" ON "GovernanceDocument"("documentName");

-- CreateIndex
CREATE INDEX "GovernanceDocument_status_idx" ON "GovernanceDocument"("status");

-- CreateIndex
CREATE INDEX "GovernanceDocument_cybersecurityPillar_idx" ON "GovernanceDocument"("cybersecurityPillar");

-- CreateIndex
CREATE UNIQUE INDEX "OpirAction_opirNumber_key" ON "OpirAction"("opirNumber");

-- CreateIndex
CREATE INDEX "OpirAction_riskRating_idx" ON "OpirAction"("riskRating");

-- CreateIndex
CREATE INDEX "OpirAction_actionOwner_idx" ON "OpirAction"("actionOwner");

-- CreateIndex
CREATE INDEX "OpirAction_actionStatus_idx" ON "OpirAction"("actionStatus");

-- CreateIndex
CREATE INDEX "OpirAction_originalTargetDate_idx" ON "OpirAction"("originalTargetDate");

-- CreateIndex
CREATE INDEX "OpirAction_updatedTargetDate_idx" ON "OpirAction"("updatedTargetDate");

-- CreateIndex
CREATE UNIQUE INDEX "AuditFinding_findingNumber_key" ON "AuditFinding"("findingNumber");

-- CreateIndex
CREATE INDEX "AuditFinding_riskLevel_idx" ON "AuditFinding"("riskLevel");

-- CreateIndex
CREATE INDEX "AuditFinding_findingStatus_idx" ON "AuditFinding"("findingStatus");

-- CreateIndex
CREATE INDEX "AuditFinding_responsiblePersonnel_idx" ON "AuditFinding"("responsiblePersonnel");

-- CreateIndex
CREATE INDEX "AuditFinding_originalTargetDate_idx" ON "AuditFinding"("originalTargetDate");

-- CreateIndex
CREATE INDEX "AuditFinding_updatedTargetDate_idx" ON "AuditFinding"("updatedTargetDate");

-- CreateIndex
CREATE UNIQUE INDEX "Objective_objectiveId_key" ON "Objective"("objectiveId");

-- CreateIndex
CREATE INDEX "Objective_objectiveStatus_idx" ON "Objective"("objectiveStatus");

-- CreateIndex
CREATE INDEX "Objective_startDate_idx" ON "Objective"("startDate");

-- CreateIndex
CREATE INDEX "Objective_endDate_idx" ON "Objective"("endDate");

-- CreateIndex
CREATE INDEX "OkrTask_taskStatus_idx" ON "OkrTask"("taskStatus");

-- CreateIndex
CREATE INDEX "OkrTask_startDate_idx" ON "OkrTask"("startDate");

-- CreateIndex
CREATE INDEX "OkrTask_endDate_idx" ON "OkrTask"("endDate");

-- CreateIndex
CREATE INDEX "Initiative_category_idx" ON "Initiative"("category");

-- CreateIndex
CREATE INDEX "Initiative_status_idx" ON "Initiative"("status");

-- CreateIndex
CREATE INDEX "Initiative_startDate_idx" ON "Initiative"("startDate");

-- CreateIndex
CREATE INDEX "Initiative_endDate_idx" ON "Initiative"("endDate");

-- CreateIndex
CREATE INDEX "SubInitiative_status_idx" ON "SubInitiative"("status");

-- CreateIndex
CREATE INDEX "SubInitiative_startDate_idx" ON "SubInitiative"("startDate");

-- CreateIndex
CREATE INDEX "SubInitiative_endDate_idx" ON "SubInitiative"("endDate");

-- CreateIndex
CREATE INDEX "ActivityLog_entityType_idx" ON "ActivityLog"("entityType");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationSetting_key_key" ON "ApplicationSetting"("key");
