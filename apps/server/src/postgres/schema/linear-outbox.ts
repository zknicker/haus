import { sql } from 'drizzle-orm';
import {
    check,
    foreignKey,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';
import { bunJsonb } from './bun-jsonb.ts';
import { linearWorkspacesTable } from './linear.ts';
import { serversTable } from './servers.ts';

/** Every Linear write the Server decides on its own (specs/linear-app.md#linear-outbox). */
export const linearOutboxKinds = [
    'session_ack',
    'session_activity',
    'session_create',
    'label_group_create',
    'label_create',
    'label_rename',
    'label_archive',
    'issue_route',
    'token_revoke',
] as const;
export type LinearOutboxKind = (typeof linearOutboxKinds)[number];

export type LinearOutboxState = 'queued' | 'done' | 'dead';

/**
 * One Server-decided Linear call, enqueued in the transaction that decided it
 * and run by the outbox worker. `client_id` is the id the call gives what it
 * creates, so a retry after a crash finds the first attempt's object.
 * `credential_id` outlives a deleted credential (a `token_revoke` carries its
 * own token), so it is not a foreign key.
 */
export const linearOutboxTable = pgTable(
    'linear_outbox',
    {
        attempts: integer('attempts').notNull().default(0),
        clientId: uuid('client_id'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        credentialId: text('credential_id'),
        doneAt: timestamp('done_at', { withTimezone: true }),
        id: text('id').primaryKey(),
        input: bunJsonb('input').notNull().$type<Record<string, unknown>>(),
        kind: text('kind').notNull().$type<LinearOutboxKind>(),
        lastError: text('last_error'),
        nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        state: text('state').notNull().$type<LinearOutboxState>(),
        workspaceId: text('workspace_id').notNull(),
    },
    (table) => [
        index('linear_outbox_queue_idx').on(table.state, table.nextAttemptAt),
        foreignKey({
            columns: [table.serverId, table.workspaceId],
            foreignColumns: [linearWorkspacesTable.serverId, linearWorkspacesTable.id],
            name: 'linear_outbox_workspace_fk',
        }).onDelete('cascade'),
        check('linear_outbox_id_shape', sql`${table.id} ~ '^lnx_[A-Za-z0-9_-]{16}$'`),
        check(
            'linear_outbox_kind',
            sql`${table.kind} in (
                'session_ack', 'session_activity', 'session_create', 'label_group_create',
                'label_create', 'label_rename', 'label_archive', 'issue_route', 'token_revoke'
            )`
        ),
        check('linear_outbox_state', sql`${table.state} in ('queued', 'done', 'dead')`),
        check(
            'linear_outbox_done',
            sql`(${table.state} = 'queued') = (${table.doneAt} is null)`
        ),
        check('linear_outbox_nonnegative', sql`${table.attempts} >= 0`),
        check(
            'linear_outbox_input_size',
            sql`octet_length(${table.input}::text) <= 65536`
        ),
    ]
);
