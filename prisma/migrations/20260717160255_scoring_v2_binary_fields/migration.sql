/*
  Warnings:

  - You are about to drop the column `config_version` on the `screening_result` table. All the data in the column will be lost.
  - You are about to drop the column `revision` on the `screening_result` table. All the data in the column will be lost.
  - You are about to drop the column `scores` on the `screening_result` table. All the data in the column will be lost.
  - You are about to drop the column `total_score` on the `screening_result` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[session_id]` on the table `screening_result` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `faktor_count` to the `screening_result` table without a default value. This is not possible if the table is not empty.
  - Added the required column `gejala_count` to the `screening_result` table without a default value. This is not possible if the table is not empty.
  - Added the required column `scoring_state` to the `screening_result` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "uq_result_session_revision";

-- AlterTable
ALTER TABLE "screening_result" DROP COLUMN "config_version",
DROP COLUMN "revision",
DROP COLUMN "scores",
DROP COLUMN "total_score",
ADD COLUMN     "faktor_count" INTEGER NOT NULL,
ADD COLUMN     "gejala_count" INTEGER NOT NULL,
ADD COLUMN     "scoring_state" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "screening_session" ADD COLUMN     "asrama" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "chips_answered" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "chips_sub_state" TEXT NOT NULL DEFAULT 'FREE_TEXT',
ADD COLUMN     "gatal_malam" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kontak_serupa" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lokasi_detail" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lokasi_khas" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tone_theme" TEXT NOT NULL DEFAULT 'hybrid',
ADD COLUMN     "tukar_alat" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "screening_result_session_id_key" ON "screening_result"("session_id");
