-- CreateEnum
CREATE TYPE "ParseStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILURE');

-- CreateEnum
CREATE TYPE "EvaluatorType" AS ENUM ('DEVELOPER', 'DOCTOR', 'RESEARCHER');

-- AlterTable
ALTER TABLE "screening_session" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'production';

-- AlterTable
ALTER TABLE "turn_extraction" DROP COLUMN "llm_metadata";

-- CreateTable
CREATE TABLE "turn_logs" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "turn_number" INTEGER NOT NULL,
    "user_message" TEXT NOT NULL,
    "raw_response" TEXT NOT NULL,
    "parse_status" "ParseStatus" NOT NULL,
    "parse_error" TEXT,
    "system_message" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "token_usage" JSONB,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "turn_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_feedbacks" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "turn_number" INTEGER NOT NULL,
    "evaluator_type" "EvaluatorType" NOT NULL,
    "is_accurate" BOOLEAN NOT NULL,
    "notes" TEXT,
    "prompt_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_feedbacks_session_id_turn_number_evaluator_type_key" ON "evaluation_feedbacks"("session_id", "turn_number", "evaluator_type");

-- AddForeignKey
ALTER TABLE "turn_logs" ADD CONSTRAINT "turn_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "screening_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_feedbacks" ADD CONSTRAINT "evaluation_feedbacks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "screening_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
