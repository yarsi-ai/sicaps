-- Distinguish an image turn from a text turn in the durable transcript.
--
-- Before this, a submitted screening photo existed only as an ephemeral blob URL
-- in the browser: it had no row in chat_message, so it had no position in the
-- conversation and vanished on refresh while the bot messages describing it
-- survived.
--
-- `content` is deliberately still populated with readable text on IMAGE rows.
-- chat.service.ts's loadRecentMessages() feeds `content` straight into the LLM
-- context, and any reader that does not yet know about `kind` degrades to
-- sensible text rather than a blank bubble or a magic sentinel.

-- CreateEnum
CREATE TYPE "ChatMessageKind" AS ENUM ('TEXT', 'IMAGE');

-- AlterTable
-- Existing rows are all text, and TEXT stays the default so every writer that
-- predates this column keeps working without change.
ALTER TABLE "chat_message" ADD COLUMN "kind" "ChatMessageKind" NOT NULL DEFAULT 'TEXT';
