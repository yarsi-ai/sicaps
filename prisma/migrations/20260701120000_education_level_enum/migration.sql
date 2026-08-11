-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('ELEMENTARY', 'JUNIOR_HIGH', 'SENIOR_HIGH', 'UNIVERSITY');

-- Convert existing data from Indonesian abbreviations to English enum values
UPDATE "demographics"
SET "education_level" = CASE
    WHEN "education_level" = 'SD' THEN 'ELEMENTARY'
    WHEN "education_level" = 'SMP' THEN 'JUNIOR_HIGH'
    WHEN "education_level" = 'SMA' THEN 'SENIOR_HIGH'
    WHEN "education_level" = 'Perguruan Tinggi' THEN 'UNIVERSITY'
    ELSE 'JUNIOR_HIGH'
END;

-- AlterTable: change column type from text to enum
ALTER TABLE "demographics" ALTER COLUMN "education_level" TYPE "EducationLevel" USING "education_level"::"EducationLevel";
