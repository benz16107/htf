-- AlterTable
ALTER TABLE "public"."AutonomousAgentConfig" ADD COLUMN     "externalSignalLookbackMinutes" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "internalSignalLookbackMinutes" INTEGER NOT NULL DEFAULT 10;
