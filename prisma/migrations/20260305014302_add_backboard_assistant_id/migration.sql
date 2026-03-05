/*
  Warnings:

  - Added the required column `backboardAssistantId` to the `MemoryThread` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."MemoryThread" ADD COLUMN     "backboardAssistantId" TEXT NOT NULL;
