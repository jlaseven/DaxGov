-- AlterTable
ALTER TABLE "User" ADD COLUMN "email" TEXT;
ALTER TABLE "User" ADD COLUMN "jumpcloudSub" TEXT;
ALTER TABLE "User" ADD COLUMN "authProvider" TEXT NOT NULL DEFAULT 'local';

-- CreateIndex
CREATE UNIQUE INDEX "User_jumpcloudSub_key" ON "User"("jumpcloudSub");
