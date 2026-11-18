import {
    type ImageGeneration,
    type ImageGenerationCost,
    type ImageGenerationResult,
    imageGenerationSchema,
} from '@haus/api';
import type { imageGenerationsTable } from '../postgres/schema.ts';

export type ImageGenerationRow = typeof imageGenerationsTable.$inferSelect;

/** The wire record for one row. The shape checks guarantee the ready and failed columns are whole. */
export function toImageGeneration(row: ImageGenerationRow): ImageGeneration {
    return imageGenerationSchema.parse({
        agentId: row.agentId,
        computerId: row.computerId,
        createdAt: row.createdAt.toISOString(),
        id: row.id,
        model: row.model,
        modelDisplayName: row.modelDisplayName,
        prompt: row.prompt,
        provider: row.provider,
        request: row.request,
        result: resultOf(row),
        updatedAt: row.updatedAt.toISOString(),
    });
}

function resultOf(row: ImageGenerationRow): ImageGenerationResult {
    const cost = costOf(row);
    if (row.state === 'ready') {
        return {
            attachmentId: row.attachmentId,
            cost,
            durationMs: row.durationMs,
            height: row.height,
            resolution: row.resolution,
            state: 'ready',
            width: row.width,
        } as ImageGenerationResult;
    }
    if (row.state === 'failed') {
        return {
            cost,
            durationMs: row.durationMs,
            errorCode: row.errorCode,
            reason: row.failureReason,
            state: 'failed',
        } as ImageGenerationResult;
    }
    return { state: row.state };
}

function costOf(row: ImageGenerationRow): ImageGenerationCost | null {
    return row.costUsd !== null && row.costBasis !== null
        ? { basis: row.costBasis, usd: row.costUsd }
        : null;
}
