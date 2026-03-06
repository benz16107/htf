-- AlterTable
ALTER TABLE "public"."RiskCase" ADD COLUMN IF NOT EXISTS "keyDrivers" JSONB;
