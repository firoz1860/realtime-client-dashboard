-- Email is unique per workspace, not globally.
--
-- The same person may be an employee of more than one company, so
-- firoz@gmail.com must be creatable in both workspace A and workspace B, while
-- still being rejected twice inside the same workspace.
--
-- This migration only changes constraints. It inserts, updates and deletes
-- nothing, so existing users are preserved exactly.

-- ---------------------------------------------------------------------------
-- Pre-flight: the new constraint is STRICTER within a workspace than the old
-- global one was, in exactly one scenario -- a workspace that already contains
-- two rows with the same email. That cannot exist while the global unique is
-- in force, but this database has been through a schema rebuild, so verify
-- rather than assume. Failing here aborts the transaction and leaves the old
-- constraint in place.
-- ---------------------------------------------------------------------------
DO $check$
DECLARE
  dupes BIGINT;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT "workspaceId", lower("email")
    FROM "public"."User"
    WHERE "workspaceId" IS NOT NULL
    GROUP BY "workspaceId", lower("email")
    HAVING count(*) > 1
  ) AS d;

  IF dupes > 0 THEN
    RAISE EXCEPTION
      'cannot apply (workspaceId, email) uniqueness: % workspace/email pair(s) already duplicated', dupes;
  END IF;
END
$check$;

-- ---------------------------------------------------------------------------
-- Swap the constraint. Dropping the old index first means there is no window
-- in which both are enforced.
-- ---------------------------------------------------------------------------

-- DropIndex
DROP INDEX "public"."User_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "User_workspaceId_email_key" ON "public"."User"("workspaceId", "email");
