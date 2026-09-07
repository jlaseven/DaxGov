-- CreateTable
CREATE TABLE "WatchItem" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationRead" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "noticeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WatchItem_userId_entityType_entityId_key" ON "WatchItem"("userId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "WatchItem_userId_idx" ON "WatchItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRead_userId_noticeKey_key" ON "NotificationRead"("userId", "noticeKey");

-- CreateIndex
CREATE INDEX "NotificationRead_userId_idx" ON "NotificationRead"("userId");
