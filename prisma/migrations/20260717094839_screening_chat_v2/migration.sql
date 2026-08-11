-- CreateEnum
CREATE TYPE "SessionPhase" AS ENUM ('GREETING', 'COLLECTING', 'ASKING_PERCEPTION', 'OFFERING_RESULT', 'SCREENING_COMPLETE', 'FOLLOW_UP', 'CLOSED');

-- AlterTable: Add V2 columns to screening_session (all nullable or with defaults — safe for existing data)
ALTER TABLE "screening_session" ADD COLUMN "phase" "SessionPhase" NOT NULL DEFAULT 'GREETING';
ALTER TABLE "screening_session" ADD COLUMN "turn_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "screening_session" ADD COLUMN "dimensi_terisi" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "screening_session" ADD COLUMN "dimensi_belum" TEXT[] DEFAULT ARRAY['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko']::TEXT[];
ALTER TABLE "screening_session" ADD COLUMN "hasil_ditampilkan" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "screening_session" ADD COLUMN "partial" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "screening_session" ADD COLUMN "processing" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "screening_session" ADD COLUMN "processing_started_at" TIMESTAMP(3);
ALTER TABLE "screening_session" ADD COLUMN "expires_at" TIMESTAMP(3);

-- CreateTable: screening_result (append-only result per session revision)
CREATE TABLE "screening_result" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "total_score" INTEGER NOT NULL,
    "risk_level" "RiskLevel" NOT NULL,
    "scores" JSONB NOT NULL,
    "perception" "Perception" NOT NULL,
    "partial" BOOLEAN NOT NULL DEFAULT false,
    "config_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screening_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable: checkpoint (session summary for follow-up context)
CREATE TABLE "checkpoint" (
    "session_id" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "context_note" TEXT,
    "result_revision" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkpoint_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable: unmapped_phrase (phrases not in canonical keyword tables)
CREATE TABLE "unmapped_phrase" (
    "id" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "category_hint" TEXT,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unmapped_phrase_pkey" PRIMARY KEY ("id")
);

-- CreateTable: audit_log (system event log for observability)
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "session_id" TEXT,
    "event" TEXT NOT NULL,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_result_session_revision" ON "screening_result"("session_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "unmapped_phrase_phrase_key" ON "unmapped_phrase"("phrase");

-- CreateIndex
CREATE INDEX "idx_audit_session" ON "audit_log"("session_id");

-- CreateIndex
CREATE INDEX "idx_audit_event" ON "audit_log"("event", "created_at");

-- AddForeignKey
ALTER TABLE "screening_result" ADD CONSTRAINT "screening_result_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "screening_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint" ADD CONSTRAINT "checkpoint_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "screening_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
