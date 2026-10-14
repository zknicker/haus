import path from 'node:path';
import { agentImageGenerationGetReceiptSchema, type ImageGeneration } from '@haus/api';
import { AgentApiTransportError } from './agent-api-client.ts';
import { agentAttachmentViewResponseSchema } from './agent-api-schemas.ts';
import { AgentCliError } from './agent-error.ts';
import type { ImageGenerateDeps } from './image-generate.ts';
import { renderImageGenerationReady } from './image-render.ts';
import type { ParsedArgs } from './parse.ts';

export const DEFAULT_IMAGE_OUT_DIR = 'generated-images';
export const IMAGE_POLL_INTERVAL_MS = 1500;
export const IMAGE_WAIT_TIMEOUT_MS = 5 * 60_000;

/** Waits for one generation, then saves its file. Re-runnable: each run writes the file again. */
export async function runImageWait(args: ParsedArgs, deps: ImageGenerateDeps): Promise<number> {
    const generationId = args.positionals[0] ?? '';
    const outDir = args.values['--out']?.trim() || DEFAULT_IMAGE_OUT_DIR;
    const timeoutMs = readTimeoutMs(args, deps.timeoutMs);
    const generation = await waitForSettled(generationId, { ...deps, timeoutMs });
    const { result } = generation;
    if (result.state === 'failed') {
        const billed = result.cost
            ? ` The provider billed ${result.cost.usd} USD (${result.cost.basis}).`
            : '';
        throw new AgentCliError(
            result.errorCode,
            `Image generation failed: ${result.reason}${billed}`,
            {
                nextAction: `Nothing was posted. The failed generation is kept as ${generation.id}; fix the request or try another model (haus image models).`,
            }
        );
    }
    if (result.state !== 'ready') {
        throw new Error('Unreachable: a settled generation is ready or failed.');
    }
    const view = await deps.client.request(
        `/api/agent/attachments/${encodeURIComponent(result.attachmentId)}`,
        agentAttachmentViewResponseSchema,
        { timeoutMs: 60_000 }
    );
    const workspacePath = path.join(
        outDir,
        `${formatStamp(deps.now())}-${generation.id}.${imageExtension(view.attachment)}`
    );
    await deps.mkdir(outDir);
    await deps.writeFile(workspacePath, Buffer.from(view.attachment.dataBase64, 'base64'));
    deps.write(renderImageGenerationReady({ generation, workspacePath }));
    return 0;
}

function readTimeoutMs(args: ParsedArgs, fallbackMs: number): number {
    const raw = args.values['--timeout']?.trim();
    if (!raw) {
        return fallbackMs;
    }
    const seconds = Number(raw);
    if (!(Number.isFinite(seconds) && seconds > 0)) {
        throw new AgentCliError('INVALID_ARG', `Invalid --timeout "${raw}".`, {
            nextAction: 'Give --timeout as a positive number of seconds.',
        });
    }
    return seconds * 1000;
}

async function fetchGeneration(
    generationId: string,
    deps: ImageGenerateDeps
): Promise<ImageGeneration> {
    const receipt = await deps.client.request(
        '/api/agent/image-generation',
        agentImageGenerationGetReceiptSchema,
        { query: { generationId } }
    );
    return receipt.generation;
}

async function waitForSettled(
    generationId: string,
    deps: ImageGenerateDeps
): Promise<ImageGeneration> {
    let generation = await fetchGeneration(generationId, deps);
    let waited = 0;
    while (generation.result.state === 'pending' || generation.result.state === 'generating') {
        if (waited >= deps.timeoutMs) {
            throw new AgentCliError(
                'IMAGE_GENERATION_TIMEOUT',
                `Image generation ${generation.id} did not finish within ${Math.round(deps.timeoutMs / 1000)} seconds.`,
                {
                    nextAction: `The generation keeps running on the Server and its Link card updates live. Run haus image wait ${generation.id} again.`,
                }
            );
        }
        await deps.sleep(deps.pollIntervalMs);
        waited += deps.pollIntervalMs;
        try {
            generation = await fetchGeneration(generation.id, deps);
        } catch (error) {
            // A dropped poll is not a failed generation; the next poll recovers or the timeout speaks.
            if (!(error instanceof AgentApiTransportError)) {
                throw error;
            }
        }
    }
    return generation;
}

/** `20261006-130501`, in UTC, so saved images sort by when they were made. */
function formatStamp(date: Date): string {
    return date.toISOString().slice(0, 19).replace(/[-:]/gu, '').replace('T', '-');
}

function imageExtension(attachment: { filename: string; mediaType: string | null }): string {
    const byType: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
    };
    const fromType = attachment.mediaType ? byType[attachment.mediaType] : undefined;
    const fromName = path.extname(attachment.filename).slice(1).toLowerCase();
    return fromType ?? (fromName || 'png');
}
