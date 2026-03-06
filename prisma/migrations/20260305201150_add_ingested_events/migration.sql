-- CreateTable
CREATE TABLE "public"."IngestedEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "rawContent" JSONB,
    "signalSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IngestedEvent_companyId_createdAt_idx" ON "public"."IngestedEvent"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."IngestedEvent" ADD CONSTRAINT "IngestedEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
