-- DB Integrity Improvements
-- Adds: onDelete CASCADE, unique constraints, and planned indexes

-- 1. TurnLog: Change FK to CASCADE on delete
ALTER TABLE "turn_logs" DROP CONSTRAINT IF EXISTS "turn_logs_session_id_fkey";
ALTER TABLE "turn_logs"
  ADD CONSTRAINT "turn_logs_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "screening_session"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. TurnLog: Add unique constraint (prevent duplicate turns per session)
CREATE UNIQUE INDEX "uq_turnlog_session_turn" ON "turn_logs"("session_id", "turn_number");

-- 3. TurnLog: Add planned indexes
CREATE INDEX "idx_turnlog_parse_status" ON "turn_logs"("parse_status");
CREATE INDEX "idx_turnlog_model" ON "turn_logs"("model");

-- 4. EvaluationFeedback: Change FK to CASCADE on delete
ALTER TABLE "evaluation_feedbacks" DROP CONSTRAINT IF EXISTS "evaluation_feedbacks_session_id_fkey";
ALTER TABLE "evaluation_feedbacks"
  ADD CONSTRAINT "evaluation_feedbacks_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "screening_session"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. EvaluationFeedback: Add planned indexes
CREATE INDEX "idx_feedback_prompt_version" ON "evaluation_feedbacks"("prompt_version");
CREATE INDEX "idx_feedback_evaluator_accuracy" ON "evaluation_feedbacks"("evaluator_type", "is_accurate");
