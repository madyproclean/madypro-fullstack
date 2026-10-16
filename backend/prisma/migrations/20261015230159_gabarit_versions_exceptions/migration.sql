-- CreateEnum
CREATE TYPE "TemplateExceptionKind" AS ENUM ('CANCEL', 'REPLACE_AGENTS');

-- AlterEnum
ALTER TYPE "ApprovalActionType" ADD VALUE 'CANCEL_OCCURRENCE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'CREATE_TEMPLATE_EXCEPTION';
ALTER TYPE "AuditAction" ADD VALUE 'DELETE_TEMPLATE_EXCEPTION';
ALTER TYPE "AuditAction" ADD VALUE 'RESTORE_TEMPLATE_REVISION';
ALTER TYPE "AuditAction" ADD VALUE 'PROPOSE_TEMPLATE_CHANGE';

-- AlterTable
ALTER TABLE "InterventionTemplate" ADD COLUMN     "pendingRequestedAt" TIMESTAMP(3),
ADD COLUMN     "pendingRequestedById" TEXT,
ADD COLUMN     "pendingVersion" JSONB;

-- CreateTable
CREATE TABLE "TemplateRevision" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "authorId" TEXT,
    "approvedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateException" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" "TemplateExceptionKind" NOT NULL,
    "agentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TemplateRevision_templateId_createdAt_idx" ON "TemplateRevision"("templateId", "createdAt");

-- CreateIndex
CREATE INDEX "TemplateException_templateId_date_idx" ON "TemplateException"("templateId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateException_stopId_date_key" ON "TemplateException"("stopId", "date");

-- AddForeignKey
ALTER TABLE "TemplateRevision" ADD CONSTRAINT "TemplateRevision_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "InterventionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateException" ADD CONSTRAINT "TemplateException_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "InterventionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
