-- ADR 0051 decision 2: priority and labels belong to board Tasks now, and 0116
-- carried them onto the Tasks it made. A claim is only the lock.
DROP TABLE "message_claim_labels" CASCADE;--> statement-breakpoint
ALTER TABLE "message_claims" DROP CONSTRAINT "message_claims_priority";--> statement-breakpoint
ALTER TABLE "message_claims" DROP COLUMN "priority";
