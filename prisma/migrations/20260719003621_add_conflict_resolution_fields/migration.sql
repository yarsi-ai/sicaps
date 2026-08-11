-- AlterTable
ALTER TABLE "screening_session" ADD COLUMN     "conflict_clarified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "conflict_dimension" TEXT,
ADD COLUMN     "last_chips_turn" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stagnation_count" INTEGER NOT NULL DEFAULT 0;
