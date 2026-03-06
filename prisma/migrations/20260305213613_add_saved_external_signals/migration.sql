-- CreateTable
CREATE TABLE "public"."SavedExternalSignal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "url" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedExternalSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedExternalSignal_companyId_createdAt_idx" ON "public"."SavedExternalSignal"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."SavedExternalSignal" ADD CONSTRAINT "SavedExternalSignal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
