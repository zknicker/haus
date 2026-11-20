import { formatImageGenerationLink, type ImageGeneration } from '@haus/api';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import type { ImageGenerateDeps } from '../image-generate.ts';
import type { ParsedArgs } from '../parse.ts';

export const ID = 'img_1234567890abcdef';
export const link = formatImageGenerationLink(ID);

export function generation(result: ImageGeneration['result']): ImageGeneration {
    return {
        agentId: 'agt_orbit',
        computerId: 'cmp_studio',
        createdAt: '2026-10-13T12:00:00.000Z',
        id: ID,
        model: 'gemini-nano-banana-2.1',
        modelDisplayName: 'Nano Banana 2.1',
        prompt: 'a lighthouse',
        provider: 'gemini',
        request: {
            aspect: '16:9',
            aspectRatio: { height: 9, width: 16 },
            background: 'opaque',
            quality: null,
            referenceAttachmentIds: [],
            resolution: '2K',
            size: null,
        },
        result,
        updatedAt: '2026-10-13T12:00:00.000Z',
    };
}

export const ready = {
    attachmentId: 'att_ready1',
    cost: { basis: 'estimate', usd: 0.05 },
    durationMs: 12_300,
    height: 1152,
    resolution: '2K',
    state: 'ready',
    width: 2048,
} as const;

export function args(
    values: Record<string, string> = {},
    lists: Record<string, string[]> = {},
    omit: string[] = []
): ParsedArgs {
    const merged = {
        '--aspect': '16:9',
        '--model': 'gemini-nano-banana-2.1',
        '--resolution': '2K',
        ...values,
    };
    return {
        flags: {},
        help: false,
        positionals: [],
        valueLists: lists,
        values: Object.fromEntries(Object.entries(merged).filter(([flag]) => !omit.includes(flag))),
    };
}

export function waitArgs(values: Record<string, string> = {}): ParsedArgs {
    return { flags: {}, help: false, positionals: [ID], valueLists: {}, values };
}

export const sizeOmits = ['--aspect', '--resolution'];

export interface Harness {
    deps: ImageGenerateDeps;
    mkdirs: string[];
    out: string[];
    requests: { body?: unknown; path: string; query?: AgentApiRequest['query'] }[];
    sleeps: number[];
    writes: { data: Buffer; path: string }[];
}

export function harness(options: {
    files?: Record<string, number>;
    polls: ImageGeneration['result'][];
    timeoutMs?: number;
}): Harness {
    const requests: Harness['requests'] = [];
    const polls = [...options.polls];
    const client: AgentApiRequester = {
        request(path, schema, input) {
            requests.push({ body: input?.body, path, query: input?.query });
            let payload: unknown;
            if (path === '/api/agent/image-generation' && input?.method === 'POST') {
                payload = { generation: generation({ state: 'pending' }), idempotent: false, link };
            } else if (path === '/api/agent/image-generation') {
                payload = { generation: generation(polls.shift() ?? { state: 'generating' }) };
            } else if (path === '/api/agent/attachments/upload') {
                payload = {
                    attachment: {
                        byteSize: 3,
                        filename: 'ref.png',
                        id: 'att_uploaded',
                        mediaType: 'image/png',
                    },
                };
            } else {
                payload = {
                    attachment: {
                        byteSize: 3,
                        dataBase64: Buffer.from('png').toString('base64'),
                        filename: 'x.png',
                        id: 'att_ready1',
                        mediaType: 'image/png',
                    },
                };
            }
            return Promise.resolve(schema.parse(payload));
        },
    };
    const out: string[] = [];
    const sleeps: number[] = [];
    const writes: Harness['writes'] = [];
    const mkdirs: string[] = [];
    const files = options.files ?? {};
    return {
        deps: {
            client,
            mintNonce: () => 'nonce-1',
            mkdir: (dir) => {
                mkdirs.push(dir);
                return Promise.resolve();
            },
            now: () => new Date('2026-10-13T12:34:56.789Z'),
            pollIntervalMs: 1000,
            readFile: () => Promise.resolve(Buffer.from('png')),
            readStdin: () => Promise.resolve('A lighthouse at dawn.\n'),
            sleep: (ms) => {
                sleeps.push(ms);
                return Promise.resolve();
            },
            stat: (filePath) =>
                Promise.resolve(
                    filePath in files ? { isFile: () => true, size: files[filePath] ?? 0 } : null
                ),
            stdinIsTty: false,
            timeoutMs: options.timeoutMs ?? 10_000,
            write: (text) => out.push(text),
            writeFile: (filePath, data) => {
                writes.push({ data, path: filePath });
                return Promise.resolve();
            },
        },
        mkdirs,
        out,
        requests,
        sleeps,
        writes,
    };
}
