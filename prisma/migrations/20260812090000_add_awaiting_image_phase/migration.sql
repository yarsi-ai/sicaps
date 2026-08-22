-- Promote the mandatory photo gate from an ad-hoc UI condition into a real
-- conversation phase.
--
-- Before this, the gate was inferred client-side from `phase = SCREENING_COMPLETE`
-- plus an in-memory `imageGateResolved` flag. That made SCREENING_COMPLETE a lie
-- (the session was marked complete while the santri still could not open the
-- result) and left the gate invisible to anything reading the database.
--
-- AWAITING_IMAGE sits between COLLECTING and ASKING_PERCEPTION: the clinical
-- dimensions are gathered, the photo is requested, then the perception question
-- follows.
--
-- Note on transactions: Postgres 12+ permits ALTER TYPE ... ADD VALUE inside a
-- transaction (which Prisma opens) as long as the new value is not *used* in the
-- same transaction. This migration only adds the label, so no backfill or UPDATE
-- may be added here.

-- AlterEnum
ALTER TYPE "SessionPhase" ADD VALUE 'AWAITING_IMAGE' AFTER 'COLLECTING';
