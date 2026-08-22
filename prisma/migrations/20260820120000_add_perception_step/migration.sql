-- Track which of the two ASKING_PERCEPTION questions is outstanding.
--
-- The phase asks two things in sequence: perceived severity, then whether
-- anything blocks the santri from getting checked. Nothing recorded which of
-- the two was on the table, so the classifier had to guess from the answer
-- alone. A bare "siap" — the exact word the failed-photo copy invites with
-- "Siap lanjut?" — read as "no barrier" and resolved perception to ADEQUATE
-- before the severity question had ever been asked. From then on the phase had
-- an answer it never asked for, and re-asked the severity question every turn.
--
-- NULL means the phase has been entered but the severity question has not been
-- asked yet. Existing in-flight sessions therefore restart the perception
-- exchange from the severity question, which is the safe reading: a session
-- mid-perception cannot be trusted to have been asked anything.

-- CreateEnum
CREATE TYPE "PerceptionStep" AS ENUM ('ASK_SEVERITY', 'ASK_BARRIER');

-- AlterTable
ALTER TABLE "screening_session" ADD COLUMN     "perception_step" "PerceptionStep";
