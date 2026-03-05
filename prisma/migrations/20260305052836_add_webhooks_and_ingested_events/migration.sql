-- AlterTable
ALTER TABLE "public"."Company" ADD COLUMN     "webhookSecret" TEXT;

-- CreateTable
CREATE TABLE "public"."CompanyWebhook" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IngestedEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyWebhook_companyId_idx" ON "public"."CompanyWebhook"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyWebhook_companyId_name_key" ON "public"."CompanyWebhook"("companyId", "name");

-- CreateIndex
CREATE INDEX "IngestedEvent_companyId_createdAt_idx" ON "public"."IngestedEvent"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."CompanyWebhook" ADD CONSTRAINT "CompanyWebhook_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IngestedEvent" ADD CONSTRAINT "IngestedEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
