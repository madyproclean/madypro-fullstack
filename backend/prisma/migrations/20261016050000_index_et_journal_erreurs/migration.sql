-- CreateTable
CREATE TABLE "ErrorEvent" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "path" TEXT,
    "userId" TEXT,
    "appVersion" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ErrorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ErrorEvent_fingerprint_key" ON "ErrorEvent"("fingerprint");

-- CreateIndex
CREATE INDEX "ErrorEvent_lastSeenAt_idx" ON "ErrorEvent"("lastSeenAt");

-- CreateIndex
CREATE INDEX "Absence_userId_status_idx" ON "Absence"("userId", "status");

-- CreateIndex
CREATE INDEX "Absence_status_idx" ON "Absence"("status");

-- CreateIndex
CREATE INDEX "Anomaly_interventionId_idx" ON "Anomaly"("interventionId");

-- CreateIndex
CREATE INDEX "Anomaly_status_idx" ON "Anomaly"("status");

-- CreateIndex
CREATE INDEX "Attendance_interventionId_idx" ON "Attendance"("interventionId");

-- CreateIndex
CREATE INDEX "Attendance_userId_date_idx" ON "Attendance"("userId", "date");

-- CreateIndex
CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_threadUserId_createdAt_idx" ON "ChatMessage"("threadUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Intervention_date_idx" ON "Intervention"("date");

-- CreateIndex
CREATE INDEX "Intervention_siteId_date_idx" ON "Intervention"("siteId", "date");

-- CreateIndex
CREATE INDEX "Intervention_generatedFromStopId_date_idx" ON "Intervention"("generatedFromStopId", "date");

-- CreateIndex
CREATE INDEX "Intervention_status_date_idx" ON "Intervention"("status", "date");

-- CreateIndex
CREATE INDEX "InterventionAssignment_userId_idx" ON "InterventionAssignment"("userId");

-- CreateIndex
CREATE INDEX "InterventionChecklistItem_interventionId_idx" ON "InterventionChecklistItem"("interventionId");

-- CreateIndex
CREATE INDEX "Notification_targetId_createdAt_idx" ON "Notification"("targetId", "createdAt");

