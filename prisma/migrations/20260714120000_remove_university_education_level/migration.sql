-- Remove UNIVERSITY from EducationLevel enum
-- First, update any existing rows that use UNIVERSITY to SENIOR_HIGH (closest fallback)
UPDATE "demographics"
SET "education_level" = 'SENIOR_HIGH'
WHERE "education_level" = 'UNIVERSITY';

-- Rename old enum
ALTER TYPE "EducationLevel" RENAME TO "EducationLevel_old";

-- Create new enum without UNIVERSITY
CREATE TYPE "EducationLevel" AS ENUM ('ELEMENTARY', 'JUNIOR_HIGH', 'SENIOR_HIGH');

-- Alter column to use new enum
ALTER TABLE "demographics" ALTER COLUMN "education_level" TYPE "EducationLevel" USING "education_level"::text::"EducationLevel";

-- Drop old enum
DROP TYPE "EducationLevel_old";
