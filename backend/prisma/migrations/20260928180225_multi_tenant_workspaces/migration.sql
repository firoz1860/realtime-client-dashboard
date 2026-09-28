-- Multi-tenant workspaces.
-- Spec: docs/superpowers/specs/2026-09-28-multi-tenant-workspaces-design.md §7
--
-- Prisma's generated DDL added `workspaceId NOT NULL` before the Workspace table
-- existed and before any backfill, which cannot run against populated tables.
-- The statements below are the same DDL reordered into the spec's phases, with the
-- backfill between "add nullable" and "set not null", so the whole thing is atomic:
--
--   phase 1  additive     enum, Workspace table, nullable workspaceId columns
--   phase 2  backfill     one default workspace; every existing row adopts it
--   phase 3  enforce      SET NOT NULL, foreign keys, indexes
--
-- The `SUPER_ADMIN` check constraint lives in the NEXT migration, not this one:
-- PostgreSQL forbids *using* an enum value in the same transaction that added it,
-- and Prisma runs each migration file in a single transaction.

-- ---------------------------------------------------------------------------
-- Phase 1 — additive
-- ---------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "public"."WorkspaceStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterEnum
ALTER TYPE "public"."Role" ADD VALUE 'SUPER_ADMIN';

-- CreateTable
CREATE TABLE "public"."Workspace" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "public"."WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "public"."Workspace"("slug");

-- CreateIndex
CREATE INDEX "Workspace_status_idx" ON "public"."Workspace"("status");

-- AlterTable: nullable first, so populated tables accept the column
ALTER TABLE "public"."User"         ADD COLUMN "workspaceId" UUID;
ALTER TABLE "public"."Client"       ADD COLUMN "workspaceId" UUID;
ALTER TABLE "public"."Project"      ADD COLUMN "workspaceId" UUID;
ALTER TABLE "public"."Task"         ADD COLUMN "workspaceId" UUID;
ALTER TABLE "public"."ActivityLog"  ADD COLUMN "workspaceId" UUID;
ALTER TABLE "public"."Notification" ADD COLUMN "workspaceId" UUID;
ALTER TABLE "public"."Message"      ADD COLUMN "workspaceId" UUID;

-- ---------------------------------------------------------------------------
-- Phase 2 — backfill, then assert it completed
--
-- Every pre-existing row belongs to the single organisation this instance was
-- before it became multi-tenant, so they all adopt one workspace. The name and
-- slug are one-time migration literals; there is nothing in the old schema to
-- derive a company name from. Rename it afterwards via the app.
--
-- No predicate here references 'SUPER_ADMIN': that enum value was added in this
-- same transaction and PostgreSQL rejects comparisons against it until commit.
-- No SUPER_ADMIN rows can exist yet anyway, so `IS NULL` is exactly right.
-- ---------------------------------------------------------------------------

DO $migrate$
DECLARE
  ws_id    UUID;
  leftover BIGINT;
BEGIN
  INSERT INTO "public"."Workspace" ("id", "name", "slug", "status", "createdAt", "updatedAt")
  VALUES (gen_random_uuid(), 'Default Workspace', 'default', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  RETURNING "id" INTO ws_id;

  UPDATE "public"."User"         SET "workspaceId" = ws_id WHERE "workspaceId" IS NULL;
  UPDATE "public"."Client"       SET "workspaceId" = ws_id WHERE "workspaceId" IS NULL;
  UPDATE "public"."Project"      SET "workspaceId" = ws_id WHERE "workspaceId" IS NULL;
  UPDATE "public"."Task"         SET "workspaceId" = ws_id WHERE "workspaceId" IS NULL;
  UPDATE "public"."ActivityLog"  SET "workspaceId" = ws_id WHERE "workspaceId" IS NULL;
  UPDATE "public"."Notification" SET "workspaceId" = ws_id WHERE "workspaceId" IS NULL;
  UPDATE "public"."Message"      SET "workspaceId" = ws_id WHERE "workspaceId" IS NULL;

  -- Guard: phase 3 must never run against an incomplete backfill.
  SELECT
      (SELECT count(*) FROM "public"."User"         WHERE "workspaceId" IS NULL)
    + (SELECT count(*) FROM "public"."Client"       WHERE "workspaceId" IS NULL)
    + (SELECT count(*) FROM "public"."Project"      WHERE "workspaceId" IS NULL)
    + (SELECT count(*) FROM "public"."Task"         WHERE "workspaceId" IS NULL)
    + (SELECT count(*) FROM "public"."ActivityLog"  WHERE "workspaceId" IS NULL)
    + (SELECT count(*) FROM "public"."Notification" WHERE "workspaceId" IS NULL)
    + (SELECT count(*) FROM "public"."Message"      WHERE "workspaceId" IS NULL)
    INTO leftover;

  IF leftover > 0 THEN
    RAISE EXCEPTION 'workspace backfill incomplete: % rows still have a NULL workspaceId', leftover;
  END IF;
END
$migrate$;

-- ---------------------------------------------------------------------------
-- Phase 3 — enforce
-- `User.workspaceId` stays nullable so SUPER_ADMIN rows can exist (spec §3.4);
-- its invariant is the check constraint in the following migration.
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."Client"       ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."Project"      ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."Task"         ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."ActivityLog"  ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."Notification" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."Message"      ALTER COLUMN "workspaceId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "User_workspaceId_idx" ON "public"."User"("workspaceId");
CREATE INDEX "User_workspaceId_role_isActive_idx" ON "public"."User"("workspaceId", "role", "isActive");
CREATE INDEX "Client_workspaceId_idx" ON "public"."Client"("workspaceId");
CREATE INDEX "Client_workspaceId_email_idx" ON "public"."Client"("workspaceId", "email");
CREATE INDEX "Project_workspaceId_idx" ON "public"."Project"("workspaceId");
CREATE INDEX "Project_workspaceId_status_idx" ON "public"."Project"("workspaceId", "status");
CREATE INDEX "Project_workspaceId_createdById_idx" ON "public"."Project"("workspaceId", "createdById");
CREATE INDEX "Task_workspaceId_idx" ON "public"."Task"("workspaceId");
CREATE INDEX "Task_workspaceId_status_idx" ON "public"."Task"("workspaceId", "status");
CREATE INDEX "Task_workspaceId_assignedDeveloperId_idx" ON "public"."Task"("workspaceId", "assignedDeveloperId");
CREATE INDEX "Task_workspaceId_isOverdue_dueDate_idx" ON "public"."Task"("workspaceId", "isOverdue", "dueDate");
CREATE INDEX "Task_workspaceId_dueDate_idx" ON "public"."Task"("workspaceId", "dueDate");
CREATE INDEX "ActivityLog_workspaceId_idx" ON "public"."ActivityLog"("workspaceId");
CREATE INDEX "ActivityLog_workspaceId_createdAt_idx" ON "public"."ActivityLog"("workspaceId", "createdAt");
CREATE INDEX "Notification_workspaceId_idx" ON "public"."Notification"("workspaceId");
CREATE INDEX "Notification_workspaceId_recipientId_isRead_createdAt_idx" ON "public"."Notification"("workspaceId", "recipientId", "isRead", "createdAt");
CREATE INDEX "Message_workspaceId_idx" ON "public"."Message"("workspaceId");
CREATE INDEX "Message_workspaceId_projectId_createdAt_idx" ON "public"."Message"("workspaceId", "projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."User"         ADD CONSTRAINT "User_workspaceId_fkey"         FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Client"       ADD CONSTRAINT "Client_workspaceId_fkey"       FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Project"      ADD CONSTRAINT "Project_workspaceId_fkey"      FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Task"         ADD CONSTRAINT "Task_workspaceId_fkey"         FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ActivityLog"  ADD CONSTRAINT "ActivityLog_workspaceId_fkey"  FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Message"      ADD CONSTRAINT "Message_workspaceId_fkey"      FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
