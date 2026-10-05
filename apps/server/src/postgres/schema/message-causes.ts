import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { chatMessagesTable } from './chat-messages.ts';
import { serversTable } from './servers.ts';

/**
 * Why an Agent wrote one message. A Trigger or Reminder fire writes nothing to
 * the transcript any more, so the Agent's own reply is the only chat-visible
 * trace of the fire and this row is its provenance: one message answers at most
 * one fire, and every fire the Agent acts on gets its own message.
 *
 * The mark outlives the automation. `title`, `description`, `summary`, `fired_at`,
 * `owner_agent_id`, and `anchor_chat_id` are snapshotted from the live records
 * when the cause is recorded, so a swept fire or a deleted Trigger leaves the
 * message still saying what provoked it. The automation and fire ids are kept
 * for good and carry no foreign key: they name history, and a reader learns the
 * automation is archived by finding no row behind them rather than by losing
 * the ids. Only deleting the message deletes the cause.
 */
export const messageCausesTable = pgTable(
    'message_causes',
    {
        /** Where the automation's fires land, snapshotted; null only for a pre-snapshot row. */
        anchorChatId: text('anchor_chat_id'),
        /**
         * `explicit` when the Agent named the fire with `--cause`; `inferred`
         * when the fire was the only item its run was offered and the answer
         * landed in the fire's anchor Chat.
         */
        attribution: text('attribution').notNull().$type<'explicit' | 'inferred'>(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        /** A Reminder's description as it read when it fired; null for a Trigger or none. */
        description: text('description'),
        /** When the answered fire happened, snapshotted from the fire row. */
        firedAt: timestamp('fired_at', { withTimezone: true }).notNull(),
        kind: text('kind').notNull().$type<'reminder_fire' | 'trigger_fire'>(),
        messageId: text('message_id').primaryKey(),
        /** The Agent that owned the automation when it fired. */
        ownerAgentId: text('owner_agent_id').notNull(),
        reminderFireId: text('reminder_fire_id'),
        reminderId: text('reminder_id'),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        /** The Reminder's cadence line or the Trigger's kind label, as it read when it fired. */
        summary: text('summary').notNull(),
        /** The automation's title as it read when it fired. */
        title: text('title').notNull(),
        triggerFireId: text('trigger_fire_id'),
        triggerId: text('trigger_id'),
    },
    (table) => [
        index('message_causes_trigger_fire_idx').on(table.serverId, table.triggerFireId),
        index('message_causes_reminder_fire_idx').on(table.serverId, table.reminderFireId),
        foreignKey({
            columns: [table.serverId, table.messageId],
            foreignColumns: [chatMessagesTable.serverId, chatMessagesTable.id],
            name: 'message_causes_message_fk',
        }).onDelete('cascade'),
        check('message_causes_attribution', sql`${table.attribution} in ('explicit', 'inferred')`),
        check('message_causes_kind', sql`${table.kind} in ('reminder_fire', 'trigger_fire')`),
        check(
            'message_causes_shape',
            sql`(
                ${table.kind} = 'trigger_fire'
                and ${table.triggerId} is not null
                and ${table.triggerFireId} is not null
                and ${table.reminderId} is null
                and ${table.reminderFireId} is null
            ) or (
                ${table.kind} = 'reminder_fire'
                and ${table.reminderId} is not null
                and ${table.reminderFireId} is not null
                and ${table.triggerId} is null
                and ${table.triggerFireId} is null
            )`
        ),
    ]
);
