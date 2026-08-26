-- CreateTable
CREATE TABLE "GovernanceDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "documentName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "cybersecurityPillar" TEXT NOT NULL,
    "commentsRemarks" TEXT,
    "applicableStandards" TEXT,
    "applicableBspRegulations" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME
);

-- CreateTable
CREATE TABLE "OpirAction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "opirNumber" TEXT NOT NULL,
    "squad" TEXT,
    "riskRating" TEXT NOT NULL,
    "incidentTitle" TEXT NOT NULL,
    "actionOwner" TEXT,
    "solution" TEXT,
    "originalTargetDate" DATETIME,
    "updatedTargetDate" DATETIME,
    "remarks" TEXT,
    "jiraTicket" TEXT,
    "actionStatus" TEXT NOT NULL DEFAULT 'Todo',
    "lastUpdateDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AuditFinding" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    "reportDate" DATETIME,
    "exitMeetingDate" DATETIME,
    "originalTargetDate" DATETIME,
    "updatedTargetDate" DATETIME,
    "managementStatus" TEXT,
    "findingStatus" TEXT NOT NULL DEFAULT 'Open',
    "remarks" TEXT,
    "evidenceReferences" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Objective" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "objectiveId" TEXT NOT NULL,
    "objectiveName" TEXT NOT NULL,
    "objectiveStatus" TEXT NOT NULL DEFAULT 'Todo',
    "assignees" TEXT,
    "contributors" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "manualProgressOverride" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME
);

-- CreateTable
CREATE TABLE "OkrTask" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "objectiveId" INTEGER NOT NULL,
    "taskName" TEXT NOT NULL,
    "taskStatus" TEXT NOT NULL DEFAULT 'Todo',
    "assignees" TEXT,
    "contributors" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "remarks" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "OkrTask_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Initiative" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "category" TEXT NOT NULL,
    "initiativeName" TEXT NOT NULL,
    "description" TEXT,
    "owner" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'Todo',
    "manualOverride" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME
);

-- CreateTable
CREATE TABLE "SubInitiative" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "initiativeId" INTEGER NOT NULL,
    "subInitiativeName" TEXT NOT NULL,
    "owner" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'Todo',
    "remarks" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "SubInitiative_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fieldChanged" TEXT,
    "previousValue" TEXT,
    "newValue" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ApplicationSetting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
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
