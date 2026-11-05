import { boolean, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * A Haus server: an opaque id every relationship points at, a globally
 * unique immutable slug used only as the human-facing address, and an
 * editable display name.
 *
 * `deletedAt` is the tombstone an Owner sets when deleting the Server: it
 * disables every membership gate immediately while the asynchronous purge
 * cascades away the rows and local attachment bytes. It is never cleared —
 * deletion has no restore path. Cloud Agent model choices live per provider
 * in `cloud_agent_model_settings`. `idleCompaction` is the Owner's Server setting that lets
 * Computers compact parked Claude Code sessions before their prompt cache expires.
 */
export const serversTable = pgTable(
    'servers',
    {
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        deletedAt: timestamp('deleted_at', { withTimezone: true }),
        displayName: text('display_name').notNull(),
        id: text('id').primaryKey(),
        idleCompaction: boolean('idle_compaction').notNull().default(false),
        slug: text('slug').notNull(),
    },
    (table) => [uniqueIndex('servers_slug_key').on(table.slug)]
);
