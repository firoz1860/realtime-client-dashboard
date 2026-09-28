-- Enforce the SUPER_ADMIN / workspaceId invariant.
-- Spec: docs/superpowers/specs/2026-09-28-multi-tenant-workspaces-design.md §3.4
--
-- `User.workspaceId` is nullable in the Prisma schema for exactly one reason:
-- SUPER_ADMIN is a platform role and belongs to no workspace. Every other role
-- MUST have one. Prisma cannot express that conditional requirement, so the
-- database enforces it.
--
-- This is a separate migration from the column work on purpose. PostgreSQL
-- rejects any *use* of an enum value inside the transaction that added it, and
-- 'SUPER_ADMIN' was added by the previous migration. By the time this file runs,
-- that transaction has committed and the value is usable.

ALTER TABLE "public"."User"
  ADD CONSTRAINT "user_workspace_role_ck" CHECK (
    ("role" = 'SUPER_ADMIN' AND "workspaceId" IS NULL)
    OR
    ("role" <> 'SUPER_ADMIN' AND "workspaceId" IS NOT NULL)
  );
