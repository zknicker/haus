import { sql } from 'drizzle-orm';
import {
    bigint,
    check,
    foreignKey,
    integer,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { chatMessagesTable } from './chat-messages.ts';
import { chatsTable } from './chats.ts';
import { serverMembershipsTable } from './server-memberships.ts';

export type AttachmentState = 'failed' | 'finalizing' | 'pending' | 'ready' | 'uploading';

export const attachmentsTable = pgTable(
    'attachments',
    {
        attemptId: text('attempt_id'),
        byteSize: bigint('byte_size', { mode: 'number' }),
        chatId: text('chat_id'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        failedAt: timestamp('failed_at', { withTimezone: true }),
        failureCode: text('failure_code'),
        filename: text('filename').notNull(),
        id: text('id').primaryKey(),
        mediaType: text('media_type').notNull(),
        messageId: text('message_id'),
        messagePosition: integer('message_position'),
        readyAt: timestamp('ready_at', { withTimezone: true }),
        serverId: text('server_id').notNull(),
        sha256: text('sha256'),
        stagingKey: text('staging_key'),
        state: text('state').notNull().$type<AttachmentState>(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        uploadNonce: text('upload_nonce').notNull(),
        uploaderAgentId: text('uploader_agent_id'),
        uploaderUserId: text('uploader_user_id'),
    },
    (table) => [
        uniqueIndex('attachments_server_id_key').on(table.serverId, table.id),
        uniqueIndex('attachments_user_nonce_key')
            .on(table.serverId, table.uploaderUserId, table.uploadNonce)
            .where(sql`${table.uploaderUserId} is not null`),
        uniqueIndex('attachments_agent_nonce_key')
            .on(table.serverId, table.uploaderAgentId, table.uploadNonce)
            .where(sql`${table.uploaderAgentId} is not null`),
        uniqueIndex('attachments_message_position_key')
            .on(table.serverId, table.messageId, table.messagePosition)
            .where(sql`${table.messageId} is not null`),
        foreignKey({
            columns: [table.serverId, table.chatId],
            foreignColumns: [chatsTable.serverId, chatsTable.id],
            name: 'attachments_chat_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.uploaderUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'attachments_uploader_membership_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.uploaderAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'attachments_uploader_agent_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.chatId, table.messageId],
            foreignColumns: [
                chatMessagesTable.serverId,
                chatMessagesTable.chatId,
                chatMessagesTable.id,
            ],
            name: 'attachments_message_fk',
        }),
        check('attachments_id_shape', sql`${table.id} ~ '^att_[A-Za-z0-9_-]{16}$'`),
        check(
            'attachments_state',
            sql`${table.state} in ('pending', 'uploading', 'finalizing', 'ready', 'failed')`
        ),
        check(
            'attachments_size',
            sql`${table.byteSize} is null or (${table.byteSize} >= 0 and ${table.byteSize} <= 52428800)`
        ),
        check(
            'attachments_sha256',
            sql`${table.sha256} is null or ${table.sha256} ~ '^[a-f0-9]{64}$'`
        ),
        check(
            'attachments_message_ready',
            sql`${table.messageId} is null or (
                ${table.chatId} is not null and ${table.state} = 'ready'
                and ${table.messagePosition} is not null
                and ${table.messagePosition} >= 0
            )`
        ),
        check(
            'attachments_uploader_shape',
            sql`num_nonnulls(${table.uploaderUserId}, ${table.uploaderAgentId}) = 1`
        ),
        check(
            'attachments_failure_shape',
            sql`(${table.state} = 'failed') = (${table.failureCode} is not null)`
        ),
    ]
);
