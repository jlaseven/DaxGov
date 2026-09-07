-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN "eventType" TEXT NOT NULL DEFAULT 'activity';
ALTER TABLE "ActivityLog" ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'success';
ALTER TABLE "ActivityLog" ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'info';
ALTER TABLE "ActivityLog" ADD COLUMN "actorId" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN "actorUsername" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN "actorRole" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN "srcIp" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN "targetName" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN "httpMethod" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN "httpPath" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN "httpStatus" INTEGER;

-- CreateIndex
CREATE INDEX "ActivityLog_action_idx" ON "ActivityLog"("action");

-- CreateIndex
CREATE INDEX "ActivityLog_outcome_idx" ON "ActivityLog"("outcome");
