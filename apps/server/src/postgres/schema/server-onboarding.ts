import { sql } from 'drizzle-orm';
import {
    check,
    foreignKey,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { chatsTable } from './chats.ts';
import { computersTable } from './computers.ts';
import { serversTable } from './servers.ts';

export type ServerOnboardingPhase = 'applying' | 'awaiting-computer' | 'awaiting-cove' | 'complete';
export type ServerOnboardingFailureCode =
    | 'computer-disconnected'
    | 'computer-incompatible'
    | 'inventory-empty'
    | 'inventory-invalid'
    | 'application-failed';

/** Durable fresh-Server setup progress, independent from Agent presence. */
export const serverOnboardingTable = pgTable(
    'server_onboarding',
    {
        agentId: text('agent_id'),
        applicationId: text('application_id'),
        channelId: text('channel_id').notNull(),
        channelKind: text('channel_kind').notNull().default('channel'),
        computerId: text('computer_id'),
        failureCode: text('failure_code').$type<ServerOnboardingFailureCode>(),
        failureDetail: text('failure_detail'),
        modelId: text('model_id'),
        phase: text('phase').notNull().$type<ServerOnboardingPhase>(),
        runtimeId: text('runtime_id'),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({ columns: [table.serverId] }),
        uniqueIndex('server_onboarding_application_key').on(table.applicationId),
        uniqueIndex('server_onboarding_channel_key').on(table.channelId),
        foreignKey({
            columns: [table.serverId, table.channelId, table.channelKind],
            foreignColumns: [chatsTable.serverId, chatsTable.id, chatsTable.kind],
            name: 'server_onboarding_channel_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'server_onboarding_agent_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.computerId],
            foreignColumns: [computersTable.serverId, computersTable.id],
            name: 'server_onboarding_computer_fk',
        }),
        check('server_onboarding_channel_kind', sql`${table.channelKind} = 'channel'`),
        check(
            'server_onboarding_phase',
            sql`${table.phase} in ('awaiting-computer', 'awaiting-cove', 'applying', 'complete')`
        ),
        check(
            'server_onboarding_failure_shape',
            sql`(${table.failureCode} is null) = (${table.failureDetail} is null)`
        ),
        check(
            'server_onboarding_failure_code',
            sql`${table.failureCode} is null or ${table.failureCode} in ('computer-disconnected', 'computer-incompatible', 'inventory-empty', 'inventory-invalid', 'application-failed')`
        ),
        check(
            'server_onboarding_cove_shape',
            sql`(${table.agentId} is null and ${table.applicationId} is null and ${table.runtimeId} is null and ${table.modelId} is null) or (${table.agentId} is not null and ${table.applicationId} is not null and ${table.runtimeId} is not null and ${table.modelId} is not null)`
        ),
    ]
);
