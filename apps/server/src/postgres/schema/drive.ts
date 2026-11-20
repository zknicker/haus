import type { DrivePushOutcome } from '@haus/api';
import { sql } from 'drizzle-orm';
import {
    bigint,
    check,
    foreignKey,
    index,
    integer,
    jsonb,
    pgTable,
    primaryKey,
    text,
    timestamp,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { artifactsTable } from './artifacts.ts';
import { chatMessagesTable } from './chat-messages.ts';
import { serversTable } from './servers.ts';
import { workersTable } from './workers.ts';

export const driveAreaCountersTable = pgTable(
    'drive_area_counters',
    {
        areaId: text('area_id').notNull(),
        counter: bigint('counter', { mode: 'number' }).notNull().default(0),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.areaId] }),
        check('drive_area_counters_nonnegative', sql`${table.counter} >= 0`),
    ]
);

export type DriveChangeKind = 'put' | 'delete';
export const driveChangesTable = pgTable(
    'drive_changes',
    {
        areaId: text('area_id').notNull(),
        artifactId: text('artifact_id').notNull(),
        change: text('change').notNull().$type<DriveChangeKind>(),
        path: text('path').notNull(),
        pathKey: text('path_key').notNull(),
        revisionId: text('revision_id'),
        sequence: bigint('sequence', { mode: 'number' }).notNull(),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.areaId, table.pathKey] }),
        index('drive_changes_area_sequence').on(table.serverId, table.areaId, table.sequence),
        foreignKey({
            columns: [table.serverId, table.areaId],
            foreignColumns: [driveAreaCountersTable.serverId, driveAreaCountersTable.areaId],
            name: 'drive_changes_area_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.artifactId],
            foreignColumns: [artifactsTable.serverId, artifactsTable.id],
            name: 'drive_changes_artifact_fk',
        }).onDelete('cascade'),
        check(
            'drive_changes_shape',
            sql`${table.sequence} > 0 and (${table.change} = 'put') = (${table.revisionId} is not null) and ${table.change} in ('put', 'delete')`
        ),
    ]
);

export const drivePushesTable = pgTable(
    'drive_pushes',
    {
        agentId: text('agent_id').notNull(),
        closedAt: timestamp('closed_at', { withTimezone: true }),
        id: text('id').notNull(),
        openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
        serverId: text('server_id').notNull(),
        taskId: text('task_id'),
        workerId: text('worker_id'),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.id] }),
        index('drive_pushes_open')
            .on(table.serverId, table.agentId)
            .where(sql`${table.closedAt} is null`),
        index('drive_pushes_worker_open')
            .on(table.serverId, table.workerId)
            .where(sql`${table.closedAt} is null and ${table.workerId} is not null`),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'drive_pushes_agent_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.workerId],
            foreignColumns: [workersTable.serverId, workersTable.id],
            name: 'drive_pushes_worker_fk',
        }).onDelete('cascade'),
    ]
);

export type DrivePushOperation = 'put' | 'delete';
export const drivePushOutcomesTable = pgTable(
    'drive_push_outcomes',
    {
        authorKey: text('author_key').notNull(),
        baseRevisionId: text('base_revision_id'),
        contentSha256: text('content_sha256'),
        contentType: text('content_type'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        operation: text('operation').notNull().$type<DrivePushOperation>(),
        outcome: jsonb('outcome').notNull().$type<DrivePushOutcome>(),
        pathKey: text('path_key').notNull(),
        pushId: text('push_id').notNull(),
        requestId: text('request_id').notNull(),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.authorKey, table.requestId] }),
        index('drive_push_outcomes_push').on(table.serverId, table.pushId),
        check(
            'drive_push_outcomes_request_shape',
            sql`${table.operation} in ('put', 'delete') and (${table.operation} = 'put') = (${table.contentType} is not null) and (${table.operation} = 'put' or (${table.contentSha256} is null and ${table.baseRevisionId} is not null))`
        ),
        foreignKey({
            columns: [table.serverId, table.pushId],
            foreignColumns: [drivePushesTable.serverId, drivePushesTable.id],
            name: 'drive_push_outcomes_push_fk',
        }).onDelete('cascade'),
    ]
);

export const messageDriveCitationsTable = pgTable(
    'message_drive_citations',
    {
        artifactId: text('artifact_id'),
        messageId: text('message_id').notNull(),
        ordinal: integer('ordinal').notNull(),
        path: text('path').notNull(),
        revisionId: text('revision_id'),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.messageId, table.ordinal] }),
        foreignKey({
            columns: [table.serverId, table.messageId],
            foreignColumns: [chatMessagesTable.serverId, chatMessagesTable.id],
            name: 'message_drive_citations_message_fk',
        }).onDelete('cascade'),
        check(
            'message_drive_citations_shape',
            sql`${table.ordinal} >= 0 and (${table.artifactId} is null) = (${table.revisionId} is null)`
        ),
    ]
);
