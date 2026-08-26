-- CreateTable
CREATE TABLE "KriSheet" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "KriRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sheetId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "riskCode" TEXT,
    "riskName" TEXT NOT NULL,
    "kriNumber" TEXT NOT NULL,
    "keyRiskIndicator" TEXT NOT NULL,
    "weight" REAL,
    "breached" TEXT,
    "warning" TEXT,
    "good" TEXT,
    "janResult" TEXT,
    "janRemarks" TEXT,
    "febResult" TEXT,
    "febRemarks" TEXT,
    "marResult" TEXT,
    "marRemarks" TEXT,
    "aprResult" TEXT,
    "aprRemarks" TEXT,
    "mayResult" TEXT,
    "mayRemarks" TEXT,
    "junResult" TEXT,
    "junRemarks" TEXT,
    "julResult" TEXT,
    "julRemarks" TEXT,
    "augResult" TEXT,
    "augRemarks" TEXT,
    "sepResult" TEXT,
    "sepRemarks" TEXT,
    "octResult" TEXT,
    "octRemarks" TEXT,
    "novResult" TEXT,
    "novRemarks" TEXT,
    "decResult" TEXT,
    "decRemarks" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "KriRecord_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "KriSheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KriOrcaMap" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kriRecordId" INTEGER NOT NULL,
    "orcaRiskId" INTEGER NOT NULL,
    CONSTRAINT "KriOrcaMap_kriRecordId_fkey" FOREIGN KEY ("kriRecordId") REFERENCES "KriRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KriOrcaMap_orcaRiskId_fkey" FOREIGN KEY ("orcaRiskId") REFERENCES "OrcaRisk" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "KriSheet_year_key" ON "KriSheet"("year");

-- CreateIndex
CREATE INDEX "KriSheet_status_idx" ON "KriSheet"("status");

-- CreateIndex
CREATE INDEX "KriRecord_sheetId_idx" ON "KriRecord"("sheetId");

-- CreateIndex
CREATE INDEX "KriRecord_riskCode_idx" ON "KriRecord"("riskCode");

-- CreateIndex
CREATE INDEX "KriRecord_sortOrder_idx" ON "KriRecord"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "KriOrcaMap_kriRecordId_orcaRiskId_key" ON "KriOrcaMap"("kriRecordId", "orcaRiskId");

-- CreateIndex
CREATE INDEX "KriOrcaMap_orcaRiskId_idx" ON "KriOrcaMap"("orcaRiskId");
