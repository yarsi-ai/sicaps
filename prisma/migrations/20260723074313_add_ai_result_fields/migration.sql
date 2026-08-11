-- AlterTable
ALTER TABLE "screening_result" ADD COLUMN     "ai_conclusion" TEXT,
ADD COLUMN     "ai_perception_response" TEXT,
ADD COLUMN     "ai_recommendation" TEXT,
ADD COLUMN     "ai_suggestion" TEXT;
