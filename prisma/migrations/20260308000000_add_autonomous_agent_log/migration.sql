-- CreateTable
CREATE TABLE "AutonomousAgentLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "signalType" TEXT,
    "signalId" TEXT,
    "riskCaseId" TEXT,
    "planId" TEXT,
    "summary" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutonomousAgentLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutonomousAgentLog_companyId_createdAt_idx" ON "AutonomousAgentLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AutonomousAgentLog_companyId_runId_idx" ON "AutonomousAgentLog"("companyId", "runId");

-- AddForeignKey
ALTER TABLE "AutonomousAgentLog" ADD CONSTRAINT "AutonomousAgentLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
