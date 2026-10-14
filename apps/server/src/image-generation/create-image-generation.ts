import { isDeepStrictEqual } from 'node:util';
import type {
    agentImageGenerationCreateInputSchema,
    ImageGeneration,
    ImageGenerationRequest,
} from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type * as z from 'zod';
import { AgentAttachmentError, requireVisibleAgentAttachment } from '../agent-api/attachments.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { imageGenerationsTable } from '../postgres/schema.ts';
import {
    ImageGenerationNoKeyError,
    ImageGenerationNonceConflictError,
    ImageGenerationReferenceError,
} from './image-generation-errors.ts';
import { readImageGenerationKey } from './image-generation-keys.ts';
import { resolveImageGenerationRequest } from './image-generation-request.ts';
import { toImageGeneration } from './image-generation-shape.ts';

type CreateInput = z.output<typeof agentImageGenerationCreateInputSchema>;

export interface CreatedImageGeneration {
    generation: ImageGeneration;
    idempotent: boolean;
}

/**
 * Records one pending generation after the registry, key, and reference checks
 * pass; nothing is created otherwise. Idempotent on `(Server, Agent, nonce)`:
 * a replay returns the stored record, and a nonce reused for a different
 * request conflicts. The caller starts the provider run after this commits.
 */
export async function createImageGeneration(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: CreateInput
): Promise<CreatedImageGeneration> {
    const { model, request } = resolveImageGenerationRequest(input);
    const existing = await findByNonce(db, runner, input.nonce);
    if (existing) {
        if (!sameRequest(existing, input, request)) {
            throw new ImageGenerationNonceConflictError();
        }
        return { generation: toImageGeneration(existing), idempotent: true };
    }
    if (!(await readImageGenerationKey(db, runner.serverId, model.provider))) {
        throw new ImageGenerationNoKeyError(model.displayName, model.provider);
    }
    await requireReferences(db, runner, input.referenceAttachmentIds);
    const [created] = await db
        .insert(imageGenerationsTable)
        .values({
            agentId: runner.agentId,
            computerId: runner.computerId,
            id: createOpaqueId('img'),
            model: model.id,
            modelDisplayName: model.displayName,
            nonce: input.nonce,
            prompt: input.prompt,
            provider: model.provider,
            request,
            serverId: runner.serverId,
        })
        .onConflictDoNothing()
        .returning();
    if (created) {
        return { generation: toImageGeneration(created), idempotent: false };
    }
    // A concurrent create with the same nonce won the race.
    const winner = await findByNonce(db, runner, input.nonce);
    if (!(winner && sameRequest(winner, input, request))) {
        throw new ImageGenerationNonceConflictError();
    }
    return { generation: toImageGeneration(winner), idempotent: true };
}

/** A replay is the same request only when the model, prompt, and whole resolved request match. */
function sameRequest(
    stored: { model: string; prompt: string; request: ImageGenerationRequest },
    input: CreateInput,
    request: ImageGenerationRequest
) {
    // The stored request round-tripped through jsonb: drop undefined keys the same way.
    const normalized = JSON.parse(JSON.stringify(request)) as unknown;
    return (
        stored.model === input.model &&
        stored.prompt === input.prompt &&
        isDeepStrictEqual(stored.request, normalized)
    );
}

async function findByNonce(db: HausDatabase, runner: ResolvedRunner, nonce: string) {
    const [row] = await db
        .select()
        .from(imageGenerationsTable)
        .where(
            and(
                eq(imageGenerationsTable.serverId, runner.serverId),
                eq(imageGenerationsTable.agentId, runner.agentId),
                eq(imageGenerationsTable.nonce, nonce)
            )
        )
        .limit(1);
    return row;
}

async function requireReferences(db: HausDatabase, runner: ResolvedRunner, ids: string[]) {
    for (const id of ids) {
        try {
            const attachment = await requireVisibleAgentAttachment(db, runner, id);
            if (!attachment.mediaType.startsWith('image/')) {
                throw new ImageGenerationReferenceError(
                    `Reference ${id} is ${attachment.mediaType}, not an image.`
                );
            }
        } catch (cause) {
            if (cause instanceof AgentAttachmentError) {
                throw new ImageGenerationReferenceError(cause.message);
            }
            throw cause;
        }
    }
}
