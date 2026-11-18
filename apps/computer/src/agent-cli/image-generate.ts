import path from 'node:path';
import {
    type AgentImageGenerationCreateInput,
    agentImageGenerationCreateReceiptSchema,
    imageGenerationMaxReferences,
    inferAttachmentMediaType,
} from '@haus/api';
import { type AgentApiRequester, AgentApiTransportError } from './agent-api-client.ts';
import { agentAttachmentUploadResponseSchema } from './agent-api-schemas.ts';
import { AgentCliError } from './agent-error.ts';
import { renderImageGenerationCreated } from './image-render.ts';
import type { ParsedArgs } from './parse.ts';

export const IMAGE_POLL_INTERVAL_MS = 1500;
export const IMAGE_WAIT_TIMEOUT_MS = 5 * 60_000;
const MAX_REFERENCE_BYTES = 50 * 1024 * 1024;
const ATTACHMENT_ID_PATTERN = /^[a-z]{2,6}_[A-Za-z0-9_-]+$/u;

export const IMAGE_GENERATE_RECIPE = `haus image generate --model gemini-nano-banana-2.1 --aspect 16:9 --resolution 2K <<'HAUSMSG'
A watercolor lighthouse at dawn, soft pink sky.
HAUSMSG`;

export interface ImageGenerateDeps {
    client: AgentApiRequester;
    mintNonce(): string;
    mkdir(dir: string): Promise<void>;
    now(): Date;
    pollIntervalMs: number;
    readFile(filePath: string): Promise<Buffer>;
    readStdin(): Promise<string>;
    sleep(ms: number): Promise<void>;
    stat(filePath: string): Promise<{ isFile(): boolean; size: number } | null>;
    stdinIsTty: boolean;
    timeoutMs: number;
    write(text: string): void;
    writeFile(filePath: string, data: Buffer): Promise<void>;
}

export async function runImageGenerate(args: ParsedArgs, deps: ImageGenerateDeps): Promise<number> {
    const request = readGenerateFlags(args);
    const prompt = deps.stdinIsTty ? '' : await deps.readStdin();
    if (!prompt.trim()) {
        throw new AgentCliError('MISSING_CONTENT', 'The image prompt is required on stdin.', {
            nextAction: IMAGE_GENERATE_RECIPE,
        });
    }
    const referenceAttachmentIds = await resolveReferences(
        args.valueLists?.['--reference'] ?? [],
        deps
    );
    const created = await createGeneration(
        {
            ...request.input,
            nonce: deps.mintNonce(),
            prompt: prompt.trimEnd(),
            referenceAttachmentIds,
        },
        deps
    );
    deps.write(renderImageGenerationCreated(created));
    return 0;
}

/** Shape-only validation; the Server owns what each model can render. */
export function readGenerateFlags(args: ParsedArgs): {
    input: Omit<AgentImageGenerationCreateInput, 'nonce' | 'prompt' | 'referenceAttachmentIds'>;
} {
    const model = args.values['--model']?.trim();
    if (!model) {
        throw new AgentCliError('INVALID_ARG', '--model is required.', {
            nextAction: 'Pick a real model id from haus image models.',
        });
    }
    const size = args.values['--size']?.trim();
    const aspect = args.values['--aspect']?.trim();
    const resolution = args.values['--resolution']?.trim();
    if (size && (aspect || resolution)) {
        throw new AgentCliError(
            'INVALID_ARG',
            '--size is exclusive with --aspect and --resolution.',
            { nextAction: 'Give either --size WxH, or --aspect A:B with --resolution 1K|2K|4K.' }
        );
    }
    const background = args.values['--background']?.trim();
    if (background && background !== 'opaque' && background !== 'transparent') {
        throw new AgentCliError('INVALID_ARG', `Invalid --background "${background}".`, {
            nextAction: 'Use --background opaque or --background transparent.',
        });
    }
    if (resolution && !['1K', '2K', '4K'].includes(resolution)) {
        throw new AgentCliError('INVALID_ARG', `Invalid --resolution "${resolution}".`, {
            nextAction: 'Use --resolution 1K, 2K, or 4K.',
        });
    }
    return {
        input: {
            ...(aspect ? { aspect } : {}),
            ...(background ? { background: background as 'opaque' | 'transparent' } : {}),
            model,
            ...(args.values['--quality']?.trim()
                ? { quality: args.values['--quality'].trim() }
                : {}),
            ...(resolution ? { resolution: resolution as '1K' | '2K' | '4K' } : {}),
            ...(size ? { size: parseSize(size) } : {}),
        },
    };
}

function parseSize(raw: string): { height: number; width: number } {
    const match = /^(\d{1,5})x(\d{1,5})$/iu.exec(raw);
    if (!match) {
        throw new AgentCliError('INVALID_ARG', `Invalid --size "${raw}".`, {
            nextAction: 'Write the size as WIDTHxHEIGHT in pixels, for example --size 1536x1024.',
        });
    }
    return { height: Number(match[2]), width: Number(match[1]) };
}

/** An existing file is uploaded as an attachment; anything else must already be an attachment id. */
async function resolveReferences(
    references: readonly string[],
    deps: ImageGenerateDeps
): Promise<string[]> {
    if (references.length > imageGenerationMaxReferences) {
        throw new AgentCliError(
            'INVALID_ARG',
            `At most ${imageGenerationMaxReferences} --reference values are allowed.`
        );
    }
    const ids: string[] = [];
    for (const reference of references) {
        const stats = await deps.stat(reference);
        if (stats?.isFile()) {
            ids.push(await uploadReference(reference, stats.size, deps));
        } else if (ATTACHMENT_ID_PATTERN.test(reference)) {
            ids.push(reference);
        } else {
            throw new AgentCliError(
                'INVALID_ARG',
                `Reference ${reference} is not a file or an attachment id.`,
                {
                    nextAction:
                        'Pass an attachment id, or a path to an image file in your workspace.',
                }
            );
        }
    }
    return ids;
}

async function uploadReference(
    filePath: string,
    size: number,
    deps: ImageGenerateDeps
): Promise<string> {
    if (size > MAX_REFERENCE_BYTES) {
        throw new AgentCliError('INVALID_ARG', `Reference ${filePath} exceeds the 50MB limit.`);
    }
    const data = await deps.readFile(filePath).catch(() => {
        throw new AgentCliError('INVALID_ARG', `Reference ${filePath} could not be read.`);
    });
    const response = await deps.client.request(
        '/api/agent/attachments/upload',
        agentAttachmentUploadResponseSchema,
        {
            body: {
                dataBase64: data.toString('base64'),
                filename: path.basename(filePath),
                mediaType: inferAttachmentMediaType(filePath, data),
            },
            method: 'POST',
        }
    );
    return response.attachment.id;
}

/** One transport retry is safe: the nonce is stable, so the Server returns the same record. */
async function createGeneration(body: AgentImageGenerationCreateInput, deps: ImageGenerateDeps) {
    const send = () =>
        deps.client.request(
            '/api/agent/image-generation',
            agentImageGenerationCreateReceiptSchema,
            {
                body,
                method: 'POST',
                timeoutMs: 60_000,
            }
        );
    try {
        return await send();
    } catch (error) {
        if (error instanceof AgentApiTransportError) {
            return await send();
        }
        throw error;
    }
}
