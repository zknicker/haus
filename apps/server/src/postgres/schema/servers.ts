import { sql } from 'drizzle-orm';
import { bigint, check, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * A Haus server: an opaque id every relationship points at, a globally
 * unique immutable slug used only as the human-facing address, and an
 * editable display name.
 *
 * `deletedAt` is the tombstone an Owner sets when deleting the Server: it
 * disables every membership gate immediately while the asynchronous purge
 * cascades away the rows and local attachment bytes. It is never cleared —
 * deletion has no restore path.
 *
 * `cloudAgentModelId` is the human-chosen Cloud Agent model; `null` is Auto,
 * which sends no model and lets the provider pick.
 */
export const serversTable = pgTable(
    'servers',
    {
        cloudAgentModelId: text('cloud_agent_model_id'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        deletedAt: timestamp('deleted_at', { withTimezone: true }),
        displayName: text('display_name').notNull(),
        id: text('id').primaryKey(),
        lastChatEventCursor: bigint('last_chat_event_cursor', { mode: 'bigint' })
            .notNull()
            .default(sql`0`),
        slug: text('slug').notNull(),
    },
    (table) => [
        uniqueIndex('servers_slug_key').on(table.slug),
        check('servers_nonnegative_chat_event_cursor', sql`${table.lastChatEventCursor} >= 0`),
        check(
            'servers_cloud_agent_model_id_length',
            sql`${table.cloudAgentModelId} is null or char_length(${table.cloudAgentModelId}) between 1 and 200`
        ),
    ]
);
