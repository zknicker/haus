import { sql } from 'drizzle-orm';
import {
    bigint,
    check,
    foreignKey,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    unique,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { serverMembershipsTable } from './server-memberships.ts';
import { serversTable } from './servers.ts';

export const artifactsTable = pgTable(
    'artifacts',
    {
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        creatorAgentId: text('creator_agent_id'),
        creatorUserId: text('creator_user_id'),
        currentRevisionId: text('current_revision_id'),
        deletedAt: timestamp('deleted_at', { withTimezone: true }),
        id: text('id').primaryKey(),
        nextRevision: integer('next_revision').notNull().default(1),
        /** Canonical drive path, NFC-normalized (specs/artifact-drive.md). */
        path: text('path').notNull(),
        /** `artifactPathKey(path)`: the case- and normalization-folded uniqueness key. */
        pathKey: text('path_key').notNull(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
    },
    (table) => [
        unique('artifacts_server_id_key').on(table.serverId, table.id),
        uniqueIndex('artifacts_server_path_key')
            .on(table.serverId, table.pathKey)
            .where(sql`${table.deletedAt} is null`),
        index('artifacts_server_path_prefix')
            .on(table.serverId, sql`${table.pathKey} text_pattern_ops`)
            .where(sql`${table.deletedAt} is null`),
        check(
            'artifacts_creator_shape',
            sql`num_nonnulls(${table.creatorAgentId}, ${table.creatorUserId}) = 1`
        ),
        foreignKey({
            columns: [table.serverId, table.creatorAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
        }),
        foreignKey({
            columns: [table.serverId, table.creatorUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
        }),
    ]
);

export type ArtifactRevisionState = 'uploading' | 'ready' | 'failed' | 'deleting' | 'deleted';
/** A raster revision's WebP thumbnail: null until generated (or not a raster image). */
export type ArtifactThumbnailState = 'ready' | 'failed';
export const artifactRevisionsTable = pgTable(
    'artifact_revisions',
    {
        artifactId: text('artifact_id').notNull(),
        authorAgentId: text('author_agent_id'),
        authorKey: text('author_key').notNull(),
        authorUserId: text('author_user_id'),
        byteSize: bigint('byte_size', { mode: 'number' }).notNull().default(0),
        contentType: text('content_type').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        filename: text('filename').notNull(),
        id: text('id').primaryKey(),
        objectKey: text('object_key').notNull(),
        requestId: text('request_id').notNull(),
        reservedBytes: bigint('reserved_bytes', { mode: 'number' }).notNull(),
        revisionNumber: integer('revision_number').notNull(),
        serverId: text('server_id').notNull(),
        sha256: text('sha256'),
        state: text('state').notNull().$type<ArtifactRevisionState>(),
        thumbnailState: text('thumbnail_state').$type<ArtifactThumbnailState>(),
        title: text('title').notNull(),
    },
    (table) => [
        uniqueIndex('artifact_revision_nonce_key').on(
            table.serverId,
            table.authorKey,
            table.requestId
        ),
        uniqueIndex('artifact_revision_number_key').on(
            table.serverId,
            table.artifactId,
            table.revisionNumber
        ),
        uniqueIndex('artifact_revision_tenant_key').on(table.serverId, table.artifactId, table.id),
        foreignKey({
            columns: [table.serverId, table.artifactId],
            foreignColumns: [artifactsTable.serverId, artifactsTable.id],
            name: 'artifact_revisions_artifact_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.authorAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
        }),
        foreignKey({
            columns: [table.serverId, table.authorUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
        }),
        check(
            'artifact_revision_author_shape',
            sql`num_nonnulls(${table.authorAgentId}, ${table.authorUserId}) = 1`
        ),
        check(
            'artifact_revision_size',
            sql`${table.byteSize} >= 0 and ${table.byteSize} <= 268435456 and ${table.reservedBytes} >= 0`
        ),
        check(
            'artifact_revision_state',
            sql`${table.state} in ('uploading', 'ready', 'failed', 'deleting', 'deleted')`
        ),
        check(
            'artifact_revision_thumbnail_state',
            sql`${table.thumbnailState} is null or ${table.thumbnailState} in ('ready', 'failed')`
        ),
        check(
            'artifact_revision_ready',
            sql`${table.state} <> 'ready' or (${table.sha256} is not null and ${table.sha256} ~ '^[a-f0-9]{64}$')`
        ),
    ]
);
