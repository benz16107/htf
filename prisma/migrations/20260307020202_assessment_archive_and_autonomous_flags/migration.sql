-- AlterTable
ALTER TABLE "public"."MitigationPlan" ADD COLUMN     "createdByAutonomousAgent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."RiskCase" ADD COLUMN     "createdByAutonomousAgent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."AssessmentArchive" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "issueTitle" TEXT,
    "entityMap" JSONB NOT NULL,
    "timeWindow" JSONB NOT NULL,
    "assumptions" JSONB NOT NULL,
    "assessment" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "AssessmentArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssessmentArchive_companyId_idx" ON "public"."AssessmentArchive"("companyId");

-- AddForeignKey
ALTER TABLE "public"."AssessmentArchive" ADD CONSTRAINT "AssessmentArchive_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
