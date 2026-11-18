import type { ImageGenerationProvider } from '@haus/api';
import { sql } from 'drizzle-orm';
import { check, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { bunJsonb } from './bun-jsonb.ts';
import { serversTable } from './servers.ts';

/**
 * The Server Owner's own API key for one image provider, one row per
 * (Server, provider). Stored the way `mcp_secrets` stores the X bearer token:
 * a Server-only JSONB secret row, plaintext at the application layer. No read
 * path returns `secret`; Settings sees only provider, connected, and
 * `updated_at`. Haus ships no image-generation keys, and deployment environment
 * keys are unrelated.
 */
export const imageGenerationKeysTable = pgTable(
    'image_generation_keys',
    {
        provider: text('provider').notNull().$type<ImageGenerationProvider>(),
        secret: bunJsonb('secret').notNull().$type<{ apiKey: string }>(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({
            columns: [table.serverId, table.provider],
            name: 'image_generation_keys_pkey',
        }),
        check('image_generation_keys_provider', sql`${table.provider} in ('openai', 'gemini')`),
    ]
);
