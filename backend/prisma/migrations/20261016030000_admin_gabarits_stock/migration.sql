-- AlterTable
ALTER TABLE "InterventionTemplate" ADD COLUMN     "skipHolidays" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SiteCategory" ADD COLUMN     "unitPriceHT" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "TemplatePause" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplatePause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "userId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TemplatePause_templateId_from_idx" ON "TemplatePause"("templateId", "from");

-- CreateIndex
CREATE INDEX "InventoryMovement_itemId_createdAt_idx" ON "InventoryMovement"("itemId", "createdAt");

-- AddForeignKey
ALTER TABLE "TemplatePause" ADD CONSTRAINT "TemplatePause_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "InterventionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

