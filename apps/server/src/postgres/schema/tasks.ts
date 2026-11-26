import { sql } from 'drizzle-orm';
import {
    boolean,
    check,
    foreignKey,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    type UpdateDeleteAction,
    unique,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { chatMessagesTable } from './chat-messages.ts';
import { chatsTable } from './chats.ts';
import { computersTable } from './computers.ts';
import { projectsTable } from './projects.ts';
import { serverMembershipsTable } from './server-memberships.ts';
import { serversTable } from './servers.ts';

export const tasksTable = pgTable(
    'tasks',
    {
        /** The only archive state (ADR 0062); the Task's Chat stays unarchived. */
        /** The Task's hidden `task` agent (ADR 0062), one to one; null only on a Task older than step 5. */
        agentId: text('agent_id'),
        archivedAt: timestamp('archived_at', { withTimezone: true }),
        /** The Captain whose crew this Task is; null for a Task a person started. */
        captainId: text('captain_id'),
        chatId: text('chat_id'),
        /** The Task's Machine, fixed at start. */
        computerId: text('computer_id'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        createdByAgentId: text('created_by_agent_id'),
        createdByUserId: text('created_by_user_id'),
        description: text('description').notNull().default(''),
        id: text('id').primaryKey(),
        /** The model the Task runs, fixed at start. */
        model: text('model'),
        /** The Message the Task started from, both or neither; null for a filed Task. */
        originChatId: text('origin_chat_id'),
        originMessageId: text('origin_message_id'),
        projectId: text('project_id').notNull(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        shortId: text('short_id').notNull(),
        /** The starter's idempotency key: a retried start returns the same Task. */
        startRequestId: text('start_request_id'),
        title: text('title').notNull(),
        /** True once a person or agent renamed it; an automatic title never replaces it. */
        titleCustom: boolean('title_custom').notNull().default(false),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        version: integer('version').notNull().default(1),
    },
    (table) => [
        unique('tasks_server_id_key').on(table.serverId, table.id),
        uniqueIndex('tasks_short_id_key').on(table.serverId, table.shortId),
        uniqueIndex('tasks_chat_key').on(table.chatId),
        uniqueIndex('tasks_agent_key').on(table.agentId),
        uniqueIndex('tasks_start_request_key')
            .on(table.serverId, table.startRequestId)
            .where(sql`${table.startRequestId} is not null`),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'tasks_agent_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.captainId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'tasks_captain_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.computerId],
            foreignColumns: [computersTable.serverId, computersTable.id],
            name: 'tasks_computer_fk',
        }),
        check(
            'tasks_session_shape',
            sql`num_nonnulls(${table.agentId}, ${table.computerId}, ${table.model}) in (0, 3)`
        ),
        check(
            'tasks_captain_shape',
            sql`${table.captainId} is null or (${table.agentId} is not null and ${table.createdByAgentId} = ${table.captainId})`
        ),
        check(
            'tasks_start_request_length',
            sql`${table.startRequestId} is null or char_length(${table.startRequestId}) between 1 and 128`
        ),
        check(
            'tasks_model_length',
            sql`${table.model} is null or char_length(${table.model}) between 1 and 128`
        ),
        index('tasks_captain_idx')
            .on(table.serverId, table.captainId)
            .where(sql`${table.captainId} is not null`),
        foreignKey({
            columns: [table.serverId, table.chatId],
            foreignColumns: [chatsTable.serverId, chatsTable.id],
            name: 'tasks_chat_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.projectId],
            foreignColumns: [projectsTable.serverId, projectsTable.chatId],
            name: 'tasks_project_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.chatId, table.projectId],
            foreignColumns: [chatsTable.serverId, chatsTable.id, chatsTable.parentChatId],
            name: 'tasks_chat_project_fk',
        }),
        // A bare `set null` would null the not-null `server_id` too; PostgreSQL 16
        // takes the column list, which Drizzle passes through untyped.
        foreignKey({
            columns: [table.serverId, table.originChatId, table.originMessageId],
            foreignColumns: [
                chatMessagesTable.serverId,
                chatMessagesTable.chatId,
                chatMessagesTable.id,
            ],
            name: 'tasks_origin_fk',
        }).onDelete('set null (origin_chat_id, origin_message_id)' as UpdateDeleteAction),
        check(
            'tasks_origin_shape',
            sql`(${table.originChatId} is null) = (${table.originMessageId} is null)`
        ),
        check('tasks_short_id_shape', sql`${table.shortId} ~ '^[0-9a-hjkmnp-tv-z]{8}$'`),
        foreignKey({
            columns: [table.serverId, table.createdByUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'tasks_creator_membership_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.createdByAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'tasks_creator_agent_fk',
        }),
        check(
            'tasks_creator_shape',
            sql`num_nonnulls(${table.createdByUserId}, ${table.createdByAgentId}) = 1`
        ),
        check('tasks_title_length', sql`char_length(${table.title}) between 1 and 200`),
        check('tasks_description_length', sql`char_length(${table.description}) <= 20000`),
        check('tasks_positive_version', sql`${table.version} > 0`),
        index('tasks_project_idx').on(table.serverId, table.projectId),
        index('tasks_origin_idx')
            .on(table.serverId, table.originChatId, table.originMessageId)
            .where(sql`${table.originChatId} is not null`),
    ]
);
