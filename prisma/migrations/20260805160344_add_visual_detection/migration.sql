-- Visual detection (MVP).
--
-- `screening_image` already exists: 20260625030415_init_mvp created it as a
-- speculative Phase 2 table (analyzed / detected_lesions / lesion_types /
-- conclusion), shaped for a lesion-derivation contract we no longer use. This
-- migration promotes it into the MVP set and reshapes it for the confirmed
-- direct POSITIVE/NEGATIVE contract, so it alters rather than creates.

-- CreateEnum
CREATE TYPE "VisualResult" AS ENUM ('POSITIVE', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "FinalOutput" AS ENUM ('SUSPECTED_SCABIES', 'NOT_SCABIES');

-- Drop the speculative lesion-derivation columns.
ALTER TABLE "screening_image" DROP COLUMN "analyzed";
ALTER TABLE "screening_image" DROP COLUMN "detected_lesions";
ALTER TABLE "screening_image" DROP COLUMN "lesion_types";
ALTER TABLE "screening_image" DROP COLUMN "conclusion";

-- `confidence` carried the same meaning; keep the value, take the clearer name.
ALTER TABLE "screening_image" RENAME COLUMN "confidence" TO "confidence_score";

-- AlterTable
ALTER TABLE "screening_image" ADD COLUMN "visual_result" "VisualResult";
ALTER TABLE "screening_image" ADD COLUMN "prediction_failed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "screening_image" ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0;

-- `updated_at` is NOT NULL with no database default (Prisma's @updatedAt drives
-- it), so backfill existing rows before removing the default.
ALTER TABLE "screening_image" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "screening_image" ALTER COLUMN "updated_at" DROP DEFAULT;

-- One image per session (Requirement 10.4), enforced in the database rather
-- than only in the service. Replaces the plain index from init_mvp.
DROP INDEX IF EXISTS "idx_image_session";
CREATE UNIQUE INDEX "screening_image_session_id_key" ON "screening_image"("session_id");

-- AddForeignKey
ALTER TABLE "screening_image" ADD CONSTRAINT "screening_image_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "screening_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "screening_result" ADD COLUMN "visual_result" "VisualResult";
ALTER TABLE "screening_result" ADD COLUMN "visual_prediction_failed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "screening_result" ADD COLUMN "final_output" "FinalOutput";

-- Row level security is already on: 20260731150000_enable_rls_all_tables covered
-- this table through its to_regclass() guard, which matched because init_mvp had
-- created it. Nothing to do here.
