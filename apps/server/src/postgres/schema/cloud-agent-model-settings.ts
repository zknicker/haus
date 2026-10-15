import type { CloudAgentModelParams, CloudAgentProvider } from '@haus/api';
import { sql } from 'drizzle-orm';
import { check, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { bunJsonb } from './bun-jsonb.ts';
import { serversTable } from './servers.ts';

/**
 * The human-chosen Cloud Agent model for one provider on one Server. No row is
 * Auto: Cursor's per-run router, or Claude's account default. `model_params`
 * holds the effort and fast choices for that model; an absent key is the
 * model's own default.
 */
export const cloudAgentModelSettingsTable = pgTable(
    'cloud_agent_model_settings',
    {
        modelId: text('model_id').notNull(),
        modelParams: bunJsonb('model_params').notNull().$type<CloudAgentModelParams>().default({}),
        provider: text('provider').notNull().$type<CloudAgentProvider>(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({
            columns: [table.serverId, table.provider],
            name: 'cloud_agent_model_settings_pkey',
        }),
        check(
            'cloud_agent_model_settings_provider',
            sql`${table.provider} in ('cursor', 'claude')`
        ),
        check(
            'cloud_agent_model_settings_model_id_length',
            sql`char_length(${table.modelId}) between 1 and 200`
        ),
        check(
            'cloud_agent_model_settings_params_shape',
            sql`jsonb_typeof(${table.modelParams}) = 'object'`
        ),
    ]
);
