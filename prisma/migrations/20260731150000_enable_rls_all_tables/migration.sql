-- Enable Row Level Security on all application tables.
--
-- Context: Supabase Security Advisor flagged `rls_disabled_in_public` and
-- `sensitive_columns_exposed` because every table in the `public` schema is
-- reachable through Supabase's PostgREST API (exposed via the project's
-- anon/service REST endpoint) whenever RLS is disabled, regardless of
-- whether the app actually uses that API.
--
-- SICAPS connects exclusively through Prisma using the `postgres` role
-- (see DATABASE_URL), which is a superuser and therefore bypasses RLS
-- entirely — this migration has NO effect on the application's own queries.
-- It only closes the PostgREST surface for the `anon` / `authenticated`
-- roles, which this project does not use (see docs/DEPLOYMENT.md §2.2:
-- "RLS Policies: Inactive — App-level authorization via ShareToken").
--
-- No policies are added: enabling RLS without any policy denies all access
-- by default for non-superuser roles, which is the desired outcome since
-- there is no legitimate PostgREST/anon-key access path in this app.

ALTER TABLE "screening_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "demographics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "turn_extraction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "turn_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evaluation_feedbacks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "screening_result" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checkpoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "unmapped_phrase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;

-- Prisma's own migration-history table is also flagged (rls_disabled_in_public)
-- since it lives in the `public` schema and is therefore PostgREST-exposed too.
-- Guarded with to_regclass because a brand-new database (before the first
-- `prisma migrate deploy` run completes) won't have this table yet.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- Phase 2 tables (not yet migrated in most environments, but included so
-- this migration is safe to re-run once they exist). Guarded with a
-- to_regclass check since these tables may not exist yet on this database.
DO $$
BEGIN
  IF to_regclass('public."user"') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "user" ENABLE ROW LEVEL SECURITY';
  END IF;
  IF to_regclass('public."doctor_review"') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "doctor_review" ENABLE ROW LEVEL SECURITY';
  END IF;
  IF to_regclass('public."respondent"') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "respondent" ENABLE ROW LEVEL SECURITY';
  END IF;
  IF to_regclass('public."screening_image"') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "screening_image" ENABLE ROW LEVEL SECURITY';
  END IF;
  IF to_regclass('public."cadre_location"') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "cadre_location" ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
