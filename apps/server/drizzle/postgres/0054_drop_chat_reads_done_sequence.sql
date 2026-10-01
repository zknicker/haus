-- The Inbox is unread, not attention (ADR 0038): its Done marker is retired.
ALTER TABLE "chat_reads" DROP COLUMN "done_sequence";
