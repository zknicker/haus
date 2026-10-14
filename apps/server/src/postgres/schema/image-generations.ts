import type {
    ImageGenerationProvider,
    ImageGenerationRequest,
    ImageGenerationResolution,
    ImageGenerationState,
} from '@haus/api';
import { sql } from 'drizzle-orm';
import {
    check,
    foreignKey,
    index,
    integer,
    numeric,
    pgTable,
    text,
    timestamp,
    unique,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { bunJsonb } from './bun-jsonb.ts';

/**
 * One image generation: one image, owned by the requesting Agent. Like Cloud
 * Agent work (ADR 0044) it belongs to no Message or Chat; Messages link to it
 * through `image_generation_links`. `computer_id` is a historical pointer with
 * no foreign key. `attachment_id` names the ready image's attachment and is a
 * plain pointer too. The prompt is stored for the lightbox and the Agent's QC;
 * provider responses beyond the image bytes, usage, and an error summary never
 * land here.
 */
export const imageGenerationsTable = pgTable(
    'image_generations',
    {
        agentId: text('agent_id').notNull(),
        attachmentId: text('attachment_id'),
        computerId: text('computer_id').notNull(),
        costBasis: text('cost_basis').$type<'usage' | 'estimate'>(),
        costUsd: numeric('cost_usd', { mode: 'number', precision: 12, scale: 6 }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        durationMs: integer('duration_ms'),
        errorCode: text('error_code'),
        failureReason: text('failure_reason'),
        height: integer('height'),
        id: text('id').primaryKey(),
        model: text('model').notNull(),
        modelDisplayName: text('model_display_name').notNull(),
        /** The Agent CLI's idempotency key for the create request. */
        nonce: text('nonce').notNull(),
        prompt: text('prompt').notNull(),
        provider: text('provider').notNull().$type<ImageGenerationProvider>(),
        request: bunJsonb('request').notNull().$type<ImageGenerationRequest>(),
        /** Resolution class of the rendered image; set only when ready. */
        resolution: text('resolution').$type<ImageGenerationResolution>(),
        serverId: text('server_id').notNull(),
        state: text('state').notNull().default('pending').$type<ImageGenerationState>(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        width: integer('width'),
    },
    (table) => [
        unique('image_generations_server_id_key').on(table.serverId, table.id),
        unique('image_generations_nonce_key').on(table.serverId, table.agentId, table.nonce),
        index('image_generations_agent_idx').on(table.serverId, table.agentId, table.createdAt),
        index('image_generations_active_idx')
            .on(table.serverId, table.createdAt)
            .where(sql`${table.state} in ('pending', 'generating')`),
        uniqueIndex('image_generations_attachment_idx')
            .on(table.serverId, table.attachmentId)
            .where(sql`${table.attachmentId} is not null`),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'image_generations_agent_fk',
        }).onDelete('cascade'),
        check('image_generations_id_shape', sql`${table.id} ~ '^img_[A-Za-z0-9_-]{16}$'`),
        check('image_generations_provider', sql`${table.provider} in ('openai', 'gemini')`),
        check(
            'image_generations_state',
            sql`${table.state} in ('pending', 'generating', 'ready', 'failed')`
        ),
        check(
            'image_generations_resolution',
            sql`${table.resolution} is null or ${table.resolution} in ('1K', '2K', '4K')`
        ),
        check(
            'image_generations_cost_basis',
            sql`${table.costBasis} is null or ${table.costBasis} in ('usage', 'estimate')`
        ),
        check(
            'image_generations_cost_pair',
            sql`(${table.costUsd} is null) = (${table.costBasis} is null)`
        ),
        check('image_generations_cost_usd', sql`${table.costUsd} is null or ${table.costUsd} >= 0`),
        check(
            'image_generations_prompt_length',
            sql`char_length(${table.prompt}) between 1 and 8000`
        ),
        check(
            'image_generations_ready_shape',
            sql`(${table.state} = 'ready') = (num_nonnulls(
                ${table.attachmentId}, ${table.width}, ${table.height}, ${table.resolution},
                ${table.durationMs}, ${table.costUsd}
            ) = 6)
            and (${table.state} = 'ready' or num_nonnulls(
                ${table.attachmentId}, ${table.width}, ${table.height}, ${table.resolution}
            ) = 0)`
        ),
        check(
            'image_generations_failed_shape',
            sql`(${table.state} = 'failed') = (num_nonnulls(${table.errorCode}, ${table.failureReason}) = 2)
            and (${table.state} = 'failed' or num_nonnulls(${table.errorCode}, ${table.failureReason}) = 0)`
        ),
    ]
);
