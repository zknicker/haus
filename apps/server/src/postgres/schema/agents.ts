import type { AgentReasoningEffort } from '@haus/api';
import { sql } from 'drizzle-orm';
import {
    check,
    foreignKey,
    integer,
    type PgTableExtraConfigValue,
    pgTable,
    text,
    timestamp,
    type UpdateDeleteAction,
    unique,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { avatarsTable } from './avatars.ts';
import { bunJsonb } from './bun-jsonb.ts';
import { chatMessagesTable } from './chat-messages.ts';
import { computersTable } from './computers.ts';
import { serversTable } from './servers.ts';

/**
 * Hosted Agent identity plus Server-owned desired execution configuration and
 * the Computer's last-reported effective state. Desired config survives Computer
 * downtime; effective state is what the assigned Computer actually resolved.
 */
export const agentsTable = pgTable(
    'agents',
    {
        avatarId: text('avatar_id').references(() => avatarsTable.id, { onDelete: 'set null' }),
        /**
         * The standing instruction the creating Agent wrote for this Agent. The
         * Computer renders it into the workspace memory it seeds, so the row is
         * what survives a reprovision, not the seeded file.
         */
        brief: text('brief'),
        computerId: text('computer_id'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        createdByAgentId: text('created_by_agent_id'),
        createdByUserId: text('created_by_user_id'),
        /** The Agent-authored Message that carries this Agent's creation. */
        creationMessageId: text('creation_message_id'),
        desiredModelId: text('desired_model_id'),
        desiredReasoningEffort: text('desired_reasoning_effort')
            .notNull()
            .default('medium')
            .$type<AgentReasoningEffort>(),
        desiredRuntimeId: text('desired_runtime_id'),
        description: text('description'),
        displayName: text('display_name').notNull(),
        effectiveHausAgentAppliedAt: timestamp('effective_haus_agent_applied_at', {
            withTimezone: true,
        }),
        effectiveHausAgentStatus: text('effective_haus_agent_status').$type<
            'current' | 'failed' | 'pending'
        >(),
        effectiveHausAgentVersion: text('effective_haus_agent_version'),
        effectiveMissing: bunJsonb('effective_missing').$type<string[]>(),
        effectiveModelId: text('effective_model_id'),
        effectiveReasoningEffort: text('effective_reasoning_effort').$type<AgentReasoningEffort>(),
        effectiveReportedAt: timestamp('effective_reported_at', { withTimezone: true }),
        effectiveRuntimeId: text('effective_runtime_id'),
        factoryAppliedAt: timestamp('factory_applied_at', { withTimezone: true }),
        factoryKind: text('factory_kind')
            .notNull()
            .default('ordinary')
            .$type<'cove' | 'ordinary'>(),
        handle: text('handle').notNull(),
        homeTimezone: text('home_timezone').notNull(),
        id: text('id').primaryKey(),
        retiredAt: timestamp('retired_at', { withTimezone: true }),
        sessionGeneration: integer('session_generation').notNull().default(1),
        sessionResetKind: text('session_reset_kind')
            .notNull()
            .default('session')
            .$type<'full' | 'session'>(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
    },
    // The explicit return type breaks the type cycle with `chat_messages`,
    // which references this table back for its author foreign key.
    (table): PgTableExtraConfigValue[] => [
        unique('agents_server_id_key').on(table.serverId, table.id),
        uniqueIndex('agents_server_handle_key')
            .on(table.serverId, sql`lower(${table.handle})`)
            .where(sql`${table.retiredAt} is null`),
        foreignKey({
            columns: [table.serverId, table.computerId],
            foreignColumns: [computersTable.serverId, computersTable.id],
            name: 'agents_computer_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.createdByAgentId],
            foreignColumns: [table.serverId, table.id],
            name: 'agents_created_by_agent_fk',
        }),
        // A bare `set null` on a composite foreign key nulls every referencing
        // column, including the not-null `server_id`, so deleting the creation
        // message would fail instead of detaching the link. PostgreSQL 16 takes
        // a column list on the action; Drizzle passes the action string through
        // untouched but types it as the plain action union, hence the cast.
        foreignKey({
            columns: [table.serverId, table.creationMessageId],
            foreignColumns: [chatMessagesTable.serverId, chatMessagesTable.id],
            name: 'agents_creation_message_fk',
        }).onDelete('set null (creation_message_id)' as UpdateDeleteAction),
        unique('agents_creation_message_key').on(table.serverId, table.creationMessageId),
        check(
            'agents_reasoning_effort',
            sql`${table.desiredReasoningEffort} in ('default', 'low', 'medium', 'high', 'xhigh', 'max')`
        ),
        check(
            'agents_effective_reasoning_effort',
            sql`${table.effectiveReasoningEffort} is null or ${table.effectiveReasoningEffort} in ('default', 'low', 'medium', 'high', 'xhigh', 'max')`
        ),
        check('agents_factory_kind', sql`${table.factoryKind} in ('ordinary', 'cove')`),
        check(
            'agents_haus_agent_status',
            sql`${table.effectiveHausAgentStatus} is null or ${table.effectiveHausAgentStatus} in ('current', 'failed', 'pending')`
        ),
        check('agents_positive_session_generation', sql`${table.sessionGeneration} > 0`),
        check('agents_session_reset_kind', sql`${table.sessionResetKind} in ('full', 'session')`),
        check(
            'agents_handle_grammar',
            sql`${table.handle} ~ '^[a-z0-9][a-z0-9-]{1,30}$' and ((${table.factoryKind} = 'cove' and ${table.handle} = 'cove') or lower(${table.handle}) not in ('agent', 'agents', 'all', 'busy', 'cove', 'everyone', 'haus', 'here', 'human', 'humans', 'idle', 'system'))`
        ),
        check(
            'agents_description_length',
            sql`${table.description} is null or char_length(${table.description}) between 1 and 500`
        ),
        check(
            'agents_brief_length',
            sql`${table.brief} is null or char_length(${table.brief}) between 1 and 4000`
        ),
        check(
            'agents_configuration',
            sql`(
                (${table.computerId} is null and ${table.desiredRuntimeId} is null and ${table.desiredModelId} is null)
                or (${table.computerId} is not null and ${table.desiredRuntimeId} is not null and ${table.desiredModelId} is not null)
            )`
        ),
    ]
);
