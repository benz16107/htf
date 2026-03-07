-- AlterTable
ALTER TABLE "IngestedEvent" ADD COLUMN "autonomousProcessedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SavedExternalSignal" ADD COLUMN "autonomousProcessedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AutonomousAgentConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "automationLevel" TEXT NOT NULL DEFAULT 'off',
    "signalSources" TEXT NOT NULL DEFAULT 'both',
    "minSeverityToAct" TEXT NOT NULL DEFAULT 'MODERATE',
    "minProbabilityToAct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minRevenueAtRiskToAct" DOUBLE PRECISION,
    "requireApprovalForSeverity" TEXT,
    "requireApprovalForRevenueAbove" DOUBLE PRECISION,
    "requireApprovalForProbabilityAbove" DOUBLE PRECISION,
    "maxAutoExecutionsPerDay" INTEGER NOT NULL DEFAULT 5,
    "allowedActionTypesToAutoExecute" JSONB,
    "requireApprovalForFirstNPerDay" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutonomousAgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutonomousAgentConfig_companyId_key" ON "AutonomousAgentConfig"("companyId");

-- CreateIndex
CREATE INDEX "AutonomousAgentConfig_companyId_idx" ON "AutonomousAgentConfig"("companyId");

-- CreateIndex
CREATE INDEX "IngestedEvent_companyId_autonomousProcessedAt_idx" ON "IngestedEvent"("companyId", "autonomousProcessedAt");

-- AddForeignKey
ALTER TABLE "AutonomousAgentConfig" ADD CONSTRAINT "AutonomousAgentConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
