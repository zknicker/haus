import { foreignKey, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';

export const agentManagedSkillsTable = pgTable(
    'agent_managed_skills',
    {
        agentId: text('agent_id').notNull(),
        pendingReleaseFingerprint: text('pending_release_fingerprint'),
        releaseFingerprint: text('release_fingerprint').notNull(),
        seededFingerprint: text('seeded_fingerprint').notNull(),
        serverId: text('server_id').notNull(),
        skillId: text('skill_id').notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.agentId, table.skillId] }),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_managed_skills_agent_fk',
        }).onDelete('cascade'),
    ]
);
