-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MODERATE', 'HIGH');

-- CreateEnum
CREATE TYPE "Perception" AS ENUM ('UNDERESTIMATE', 'OVERESTIMATE', 'BARRIER', 'ADEQUATE');

-- CreateEnum
CREATE TYPE "ScreeningStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DOCTOR', 'CADRE', 'USER', 'ANONYMOUS');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReviewAction" AS ENUM ('REFER_CLINIC', 'EDUCATE', 'OTHER');

-- CreateTable
CREATE TABLE "screening_session" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'id',
    "mode" TEXT NOT NULL DEFAULT 'ai',
    "status" "ScreeningStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "categories_covered" JSONB NOT NULL DEFAULT '[]',
    "scores" JSONB,
    "total_score" INTEGER,
    "risk_level" "RiskLevel",
    "perception" "Perception",
    "ai_conclusion" TEXT,
    "ai_perception_response" TEXT,
    "ai_recommendation" TEXT,
    "ai_suggestion" TEXT,
    "share_token" TEXT,
    "prompt_version" TEXT NOT NULL DEFAULT 'v1',
    "scoring_version" TEXT NOT NULL DEFAULT 'v1',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "screening_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demographics" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "name" TEXT,
    "age" INTEGER NOT NULL,
    "gender" TEXT NOT NULL,
    "education_level" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demographics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_message" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_voice" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turn_extraction" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "turn_number" INTEGER NOT NULL,
    "extraction" JSONB NOT NULL,
    "scores" JSONB NOT NULL,
    "llm_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "turn_extraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "supabase_id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_review" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "confirmed_risk_level" "RiskLevel",
    "action" "ReviewAction",
    "notes" TEXT,
    "override_suggestion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "respondent" (
    "id" TEXT NOT NULL,
    "cadre_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER,
    "gender" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "respondent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screening_image" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "analyzed" BOOLEAN NOT NULL DEFAULT false,
    "detected_lesions" BOOLEAN,
    "lesion_types" JSONB,
    "confidence" DOUBLE PRECISION,
    "conclusion" TEXT,
    "raw_result" JSONB,
    "consent_given" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screening_image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cadre_location" (
    "id" TEXT NOT NULL,
    "cadre_id" TEXT NOT NULL,
    "province_id" TEXT NOT NULL,
    "province_name" TEXT NOT NULL,
    "regency_id" TEXT NOT NULL,
    "regency_name" TEXT NOT NULL,
    "district_id" TEXT,
    "district_name" TEXT,
    "village_id" TEXT,
    "village_name" TEXT,
    "institution_name" TEXT,
    "residence_duration" TEXT,
    "room_occupants" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cadre_location_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "screening_session_share_token_key" ON "screening_session"("share_token");

-- CreateIndex
CREATE INDEX "idx_session_status_risk" ON "screening_session"("status", "risk_level");

-- CreateIndex
CREATE INDEX "idx_session_share_token" ON "screening_session"("share_token");

-- CreateIndex
CREATE INDEX "idx_session_created_desc" ON "screening_session"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_session_risk_created" ON "screening_session"("risk_level", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "demographics_session_id_key" ON "demographics"("session_id");

-- CreateIndex
CREATE INDEX "idx_message_session_time" ON "chat_message"("session_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_extraction_session_turn" ON "turn_extraction"("session_id", "turn_number");

-- CreateIndex
CREATE UNIQUE INDEX "user_supabase_id_key" ON "user"("supabase_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "idx_user_role_approval" ON "user"("role", "approval_status");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_review_session_id_key" ON "doctor_review"("session_id");

-- CreateIndex
CREATE INDEX "idx_review_doctor" ON "doctor_review"("doctor_id");

-- CreateIndex
CREATE INDEX "idx_respondent_cadre" ON "respondent"("cadre_id");

-- CreateIndex
CREATE INDEX "idx_image_session" ON "screening_image"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "cadre_location_cadre_id_key" ON "cadre_location"("cadre_id");

-- AddForeignKey
ALTER TABLE "demographics" ADD CONSTRAINT "demographics_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "screening_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "screening_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turn_extraction" ADD CONSTRAINT "turn_extraction_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "screening_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_review" ADD CONSTRAINT "doctor_review_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respondent" ADD CONSTRAINT "respondent_cadre_id_fkey" FOREIGN KEY ("cadre_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cadre_location" ADD CONSTRAINT "cadre_location_cadre_id_fkey" FOREIGN KEY ("cadre_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
