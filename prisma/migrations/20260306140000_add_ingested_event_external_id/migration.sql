-- AlterTable
ALTER TABLE "public"."IngestedEvent" ADD COLUMN "externalId" TEXT;

-- CreateIndex
CREATE INDEX "IngestedEvent_companyId_toolName_externalId_idx" ON "public"."IngestedEvent"("companyId", "toolName", "externalId");
