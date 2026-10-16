-- CreateTable
CREATE TABLE "QualityInspection" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "interventionId" TEXT,
    "score" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "comment" TEXT,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityInspection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QualityInspection_siteId_createdAt_idx" ON "QualityInspection"("siteId", "createdAt");

-- AddForeignKey
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

