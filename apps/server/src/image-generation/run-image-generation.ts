import type { ImageGenerationProvider } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import {
    readAttachmentBytes,
    requireVisibleAgentAttachment,
    uploadAgentAttachment,
} from '../agent-api/attachments.ts';
import type { AttachmentRoot } from '../attachments/attachment-root.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { imageGenerationsTable } from '../postgres/schema.ts';
import { publishRealtime } from '../realtime/topic.ts';
import { costOfImageGeneration } from './image-generation-cost.ts';
import { prepareImageGenerationEvents } from './image-generation-events.ts';
import { readImageGenerationKey } from './image-generation-keys.ts';
import { findImageGenerationModel } from './image-generation-registry.ts';
import type { ImageGenerationRow } from './image-generation-shape.ts';
import { renderedResolutionClass } from './image-generation-sizing.ts';
import {
    type ImageProviderAdapter,
    ImageProviderError,
    type ImageProviderReference,
} from './providers/image-provider.ts';

export type ImageProviderAdapters = Record<ImageGenerationProvider, ImageProviderAdapter>;

export interface ImageGenerationRunDependencies {
    adapters: ImageProviderAdapters;
    /** Publishes the generation's update events; defaults to the realtime fan-out. */
    announce?: (db: HausDatabase, row: ImageGenerationRow) => Promise<void>;
    db: HausDatabase;
    root: AttachmentRoot;
}

/**
 * Runs one generation to a settled state: `pending → generating → ready | failed`.
 * Every state change publishes `imageGeneration.onUpdated` once per linking
 * Message. A failure is recorded, never thrown to the caller, and an update
 * that cannot be announced never keeps the generation from settling. The
 * claim is an atomic compare-and-set; if it throws, the row stays `pending`
 * and claimable, and the provider was never called.
 */
export async function runImageGeneration(
    dependencies: ImageGenerationRunDependencies,
    generationId: string
): Promise<void> {
    const { db } = dependencies;
    const announce = async (row: ImageGenerationRow) => {
        try {
            await (dependencies.announce ?? announceUpdate)(db, row);
        } catch (cause) {
            console.error(`Image generation ${row.id} update could not be announced.`, cause);
        }
    };
    const [row] = await db
        .update(imageGenerationsTable)
        .set({ state: 'generating', updatedAt: new Date() })
        .where(
            and(
                eq(imageGenerationsTable.id, generationId),
                eq(imageGenerationsTable.state, 'pending')
            )
        )
        .returning();
    if (!row) {
        return;
    }
    const startedAt = Date.now();
    try {
        await announce(row);
        await settleReady(dependencies, row, startedAt);
    } catch (cause) {
        if (!(cause instanceof ImageProviderError)) {
            console.error(`Image generation ${row.id} failed internally.`, cause);
        }
        try {
            await settleFailed(db, row, cause, Date.now() - startedAt);
        } catch (settleCause) {
            // Boot recovery fails a row left generating.
            console.error(`Image generation ${row.id} could not be settled.`, settleCause);
        }
    } finally {
        await announce(row);
    }
}

/**
 * `pending` is the durable queue: runs every unclaimed generation. Each run
 * claims its row atomically, so overlapping sweeps and dispatches call the
 * provider at most once per generation.
 */
export async function sweepPendingImageGenerations(
    dependencies: ImageGenerationRunDependencies
): Promise<void> {
    const rows = await dependencies.db
        .select({ id: imageGenerationsTable.id })
        .from(imageGenerationsTable)
        .where(eq(imageGenerationsTable.state, 'pending'));
    const results = await Promise.allSettled(
        rows.map((row) => runImageGeneration(dependencies, row.id))
    );
    for (const result of results) {
        if (result.status === 'rejected') {
            console.error('Pending image generation could not be run.', result.reason);
        }
    }
}

/**
 * Boot recovery: a claimed generation interrupted by a restart may have reached
 * the provider and can never settle, so it fails. Unclaimed `pending` rows are
 * left for the sweep.
 */
export async function failInterruptedImageGenerations(db: HausDatabase): Promise<void> {
    await db
        .update(imageGenerationsTable)
        .set({
            errorCode: 'server-restarted',
            failureReason: 'The Server restarted before this image finished. Try again.',
            state: 'failed',
            updatedAt: new Date(),
        })
        .where(eq(imageGenerationsTable.state, 'generating'));
}

async function settleReady(
    { adapters, db, root }: ImageGenerationRunDependencies,
    row: ImageGenerationRow,
    startedAt: number
) {
    const model = findImageGenerationModel(row.model);
    if (!model) {
        throw new ImageProviderError(
            'invalid-request',
            `${row.model} is no longer a registry model.`
        );
    }
    const apiKey = await readImageGenerationKey(db, row.serverId, row.provider);
    if (!apiKey) {
        throw new ImageProviderError(
            'auth',
            'The provider key was removed. The Server Owner adds one in Settings → Image generation.'
        );
    }
    const references = await loadReferences(db, root, row);
    const result = await adapters[row.provider].generate(
        { model, prompt: row.prompt, references, request: row.request },
        apiKey
    );
    const resolution = renderedResolutionClass(model, row.request, result);
    const cost = costOfImageGeneration({
        model,
        request: row.request,
        resolution,
        usage: result.usage,
    });
    const extension = result.mediaType === 'image/jpeg' ? 'jpg' : result.mediaType.split('/')[1];
    const uploaded = await uploadAgentAttachment(
        db,
        root,
        { agentId: row.agentId, serverId: row.serverId },
        {
            dataBase64: Buffer.from(result.bytes).toString('base64'),
            filename: `${row.id}.${extension}`,
            mediaType: result.mediaType,
        }
    );
    await db
        .update(imageGenerationsTable)
        .set({
            attachmentId: uploaded.attachment.id,
            costBasis: cost.basis,
            costUsd: cost.usd,
            durationMs: Date.now() - startedAt,
            height: result.height,
            resolution,
            state: 'ready',
            updatedAt: new Date(),
            width: result.width,
        })
        .where(eq(imageGenerationsTable.id, row.id));
}

async function loadReferences(
    db: HausDatabase,
    root: AttachmentRoot,
    row: ImageGenerationRow
): Promise<ImageProviderReference[]> {
    const references: ImageProviderReference[] = [];
    for (const attachmentId of row.request.referenceAttachmentIds) {
        const attachment = await requireVisibleAgentAttachment(db, row, attachmentId);
        const bytes = await readAttachmentBytes(root, row.serverId, attachment);
        references.push({
            bytes: new Uint8Array(bytes),
            filename: attachment.filename,
            mediaType: attachment.mediaType,
        });
    }
    return references;
}

async function settleFailed(
    db: HausDatabase,
    row: ImageGenerationRow,
    cause: unknown,
    durationMs: number
) {
    const providerError = cause instanceof ImageProviderError ? cause : null;
    const reason = (providerError?.message ?? 'The Server could not finish this image.').slice(
        0,
        1000
    );
    await db
        .update(imageGenerationsTable)
        .set({
            costBasis: providerError?.cost?.basis ?? null,
            costUsd: providerError?.cost?.usd ?? null,
            durationMs,
            errorCode: providerError?.kind ?? 'server-error',
            failureReason: reason,
            state: 'failed',
            updatedAt: new Date(),
        })
        .where(eq(imageGenerationsTable.id, row.id));
}

async function announceUpdate(db: HausDatabase, row: ImageGenerationRow) {
    for (const event of await prepareImageGenerationEvents(db, {
        generationIds: [row.id],
        serverId: row.serverId,
    })) {
        publishRealtime(event);
    }
}
