-- CreateEnum
CREATE TYPE "public"."CompanyRole" AS ENUM ('OWNER', 'ADMIN', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "public"."AgentType" AS ENUM ('AI_SETUP', 'SIGNAL_RISK');

-- CreateEnum
CREATE TYPE "public"."AccessScope" AS ENUM ('SELF_ONLY', 'COMPANY_ALL');

-- CreateEnum
CREATE TYPE "public"."SessionStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."RiskSeverity" AS ENUM ('MINOR', 'MODERATE', 'SEVERE', 'CRITICAL');

-- CreateEnum
CREATE TYPE "public"."ScenarioRecommendation" AS ENUM ('RECOMMENDED', 'FALLBACK', 'ALTERNATE');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "externalAuthId" TEXT,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Company" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "setupCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserCompanyRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "public"."CompanyRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCompanyRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CompanyProfileBase" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sector" TEXT,
    "companyType" TEXT,
    "sizeBand" TEXT,
    "industryStance" TEXT,
    "supplyChainMap" JSONB,
    "stakeholderMap" JSONB,
    "assumptions" JSONB,
    "rawInput" TEXT,
    "generatedSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfileBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CompanyProfileHighLevel" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "existingRiskAnalysis" JSONB,
    "leadTimeSensitivity" JSONB,
    "inventoryBufferPolicies" JSONB,
    "contractStructures" JSONB,
    "customerSlaProfile" JSONB,
    "erpSignalMonitoring" JSONB,
    "generatedNarrative" TEXT,
    "warningSummary" TEXT,
    "confidenceScore" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfileHighLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IntegrationConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "authType" TEXT NOT NULL,
    "metadata" JSONB,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MemoryThread" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "agentType" "public"."AgentType" NOT NULL,
    "accessScope" "public"."AccessScope" NOT NULL,
    "backboardThreadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AgentSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "agentType" "public"."AgentType" NOT NULL,
    "status" "public"."SessionStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReasoningTrace" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "stepTitle" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "evidencePack" JSONB,
    "assumptions" JSONB,
    "confidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReasoningTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RiskCase" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "entityMap" JSONB NOT NULL,
    "timeWindow" JSONB NOT NULL,
    "evidencePack" JSONB NOT NULL,
    "assumptions" JSONB NOT NULL,
    "constraints" JSONB NOT NULL,
    "probabilityPoint" DOUBLE PRECISION,
    "probabilityBandLow" DOUBLE PRECISION,
    "probabilityBandHigh" DOUBLE PRECISION,
    "confidenceLevel" TEXT,
    "severity" "public"."RiskSeverity",
    "serviceImpact" JSONB,
    "financialImpact" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Scenario" (
    "id" TEXT NOT NULL,
    "riskCaseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "recommendation" "public"."ScenarioRecommendation" NOT NULL,
    "costDelta" DOUBLE PRECISION,
    "serviceImpact" DOUBLE PRECISION,
    "riskReduction" DOUBLE PRECISION,
    "timeToImplementHrs" INTEGER,
    "confidenceLevel" TEXT,
    "assumptions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MitigationPlan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "riskCaseId" TEXT NOT NULL,
    "scenarioId" TEXT,
    "owner" TEXT,
    "status" TEXT NOT NULL,
    "actions" JSONB NOT NULL,
    "executionMode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MitigationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OverridePolicy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "revenueAtRiskLimit" DOUBLE PRECISION,
    "otifFloor" DOUBLE PRECISION,
    "probabilityThreshold" DOUBLE PRECISION,
    "autoExecuteEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rules" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OverridePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlaybookEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "incidentClass" TEXT NOT NULL,
    "predictedOutcome" JSONB NOT NULL,
    "actualOutcome" JSONB NOT NULL,
    "effectiveness" JSONB NOT NULL,
    "learnings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaybookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_externalAuthId_key" ON "public"."User"("externalAuthId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Company_key_key" ON "public"."Company"("key");

-- CreateIndex
CREATE INDEX "UserCompanyRole_companyId_idx" ON "public"."UserCompanyRole"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCompanyRole_userId_companyId_key" ON "public"."UserCompanyRole"("userId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfileBase_companyId_key" ON "public"."CompanyProfileBase"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfileHighLevel_companyId_key" ON "public"."CompanyProfileHighLevel"("companyId");

-- CreateIndex
CREATE INDEX "IntegrationConnection_companyId_provider_idx" ON "public"."IntegrationConnection"("companyId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_companyId_provider_key" ON "public"."IntegrationConnection"("companyId", "provider");

-- CreateIndex
CREATE INDEX "MemoryThread_companyId_agentType_idx" ON "public"."MemoryThread"("companyId", "agentType");

-- CreateIndex
CREATE INDEX "AgentSession_companyId_agentType_startedAt_idx" ON "public"."AgentSession"("companyId", "agentType", "startedAt");

-- CreateIndex
CREATE INDEX "ReasoningTrace_companyId_sessionId_createdAt_idx" ON "public"."ReasoningTrace"("companyId", "sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "RiskCase_companyId_createdAt_idx" ON "public"."RiskCase"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Scenario_riskCaseId_recommendation_idx" ON "public"."Scenario"("riskCaseId", "recommendation");

-- CreateIndex
CREATE INDEX "MitigationPlan_companyId_status_idx" ON "public"."MitigationPlan"("companyId", "status");

-- CreateIndex
CREATE INDEX "OverridePolicy_companyId_idx" ON "public"."OverridePolicy"("companyId");

-- CreateIndex
CREATE INDEX "PlaybookEntry_companyId_incidentClass_idx" ON "public"."PlaybookEntry"("companyId", "incidentClass");

-- AddForeignKey
ALTER TABLE "public"."UserCompanyRole" ADD CONSTRAINT "UserCompanyRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserCompanyRole" ADD CONSTRAINT "UserCompanyRole_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyProfileBase" ADD CONSTRAINT "CompanyProfileBase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyProfileHighLevel" ADD CONSTRAINT "CompanyProfileHighLevel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MemoryThread" ADD CONSTRAINT "MemoryThread_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentSession" ADD CONSTRAINT "AgentSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReasoningTrace" ADD CONSTRAINT "ReasoningTrace_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RiskCase" ADD CONSTRAINT "RiskCase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RiskCase" ADD CONSTRAINT "RiskCase_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Scenario" ADD CONSTRAINT "Scenario_riskCaseId_fkey" FOREIGN KEY ("riskCaseId") REFERENCES "public"."RiskCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MitigationPlan" ADD CONSTRAINT "MitigationPlan_riskCaseId_fkey" FOREIGN KEY ("riskCaseId") REFERENCES "public"."RiskCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OverridePolicy" ADD CONSTRAINT "OverridePolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlaybookEntry" ADD CONSTRAINT "PlaybookEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
