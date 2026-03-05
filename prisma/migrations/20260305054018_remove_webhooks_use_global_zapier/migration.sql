/*
  Warnings:

  - You are about to drop the column `webhookSecret` on the `Company` table. All the data in the column will be lost.
  - You are about to drop the `CompanyWebhook` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IngestedEvent` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."CompanyWebhook" DROP CONSTRAINT "CompanyWebhook_companyId_fkey";

-- DropForeignKey
ALTER TABLE "public"."IngestedEvent" DROP CONSTRAINT "IngestedEvent_companyId_fkey";

-- AlterTable
ALTER TABLE "public"."Company" DROP COLUMN "webhookSecret";

-- DropTable
DROP TABLE "public"."CompanyWebhook";

-- DropTable
DROP TABLE "public"."IngestedEvent";
