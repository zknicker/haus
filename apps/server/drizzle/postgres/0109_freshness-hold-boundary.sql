-- A freshness hold shows only the latest few newer messages. It records the newest
-- one it showed, so the next send is not held again for the earlier messages it
-- omitted (Raft's hold seenUpToSeq). Those stay queued and unseen.
ALTER TABLE "agent_inbox_cursors" ADD COLUMN "held_through_sequence" integer DEFAULT 0 NOT NULL;
