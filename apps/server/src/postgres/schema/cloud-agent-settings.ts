import type { CloudAgentModelParams, CloudAgentProvider } from '@haus/api';
import { sql } from 'drizzle-orm';
import { check, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { bunJsonb } from './bun-jsonb.ts';
import { serversTable } from './servers.ts';

export const cloudAgentSettingsTable = pgTable(
    'cloud_agent_settings',
    {
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        provider: text('provider').notNull().$type<CloudAgentProvider>(),
        modelId: text('model_id'),
        modelParams: bunJsonb('model_params').notNull().$type<CloudAgentModelParams>().default({}),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.provider] }),
        check('cloud_agent_settings_provider', sql`${table.provider} in ('cursor','claude')`),
        check(
            'cloud_agent_settings_model_length',
            sql`${table.modelId} is null or char_length(${table.modelId}) between 1 and 200`
        ),
        check(
            'cloud_agent_settings_params_shape',
            sql`jsonb_typeof(${table.modelParams}) = 'object' and (${table.modelId} is not null or ${table.modelParams} = '{}'::jsonb)`
        ),
    ]
);
