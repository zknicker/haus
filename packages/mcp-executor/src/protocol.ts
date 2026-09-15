import * as z from 'zod';

export const limits = {
    calls: 50,
    codeBytes: 64 * 1024,
    messageBytes: 1024 * 1024,
    timeoutMs: 60_000,
} as const;

export const workerRequestSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('start'), code: z.string() }).strict(),
    z
        .object({ type: z.literal('reply'), id: z.number().int().positive(), value: z.unknown() })
        .strict(),
]);
export const workerResponseSchema = z.discriminatedUnion('type', [
    z
        .object({
            type: z.literal('invoke'),
            id: z.number().int().positive(),
            path: z.string(),
            args: z.unknown(),
        })
        .strict(),
    z.object({ type: z.literal('done'), result: z.unknown() }).strict(),
    z.object({ type: z.literal('failed'), message: z.string() }).strict(),
]);
export type WorkerRequest = z.infer<typeof workerRequestSchema>;
export type WorkerResponse = z.infer<typeof workerResponseSchema>;

export function encodeMessage(message: WorkerRequest | WorkerResponse): string {
    const line = `${JSON.stringify(message)}\n`;
    if (Buffer.byteLength(line) > limits.messageBytes) {
        throw new Error('MCP execution exceeded its message size limit.');
    }
    return line;
}

/** Bound bytes before accumulating a complete JSON line. */
export async function* readMessages(stream: AsyncIterable<Buffer | string>) {
    let pending = Buffer.alloc(0);
    for await (const chunk of stream) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        let offset = 0;
        while (offset < bytes.length) {
            const newline = bytes.indexOf(10, offset);
            const end = newline < 0 ? bytes.length : newline + 1;
            if (pending.length + end - offset > limits.messageBytes) {
                throw new Error('MCP execution exceeded its message size limit.');
            }
            pending = Buffer.concat([pending, bytes.subarray(offset, end)]);
            offset = end;
            if (newline >= 0) {
                const line = pending.toString('utf8');
                pending = Buffer.alloc(0);
                yield JSON.parse(line) as unknown;
            }
        }
    }
    if (pending.length) {
        throw new Error('MCP execution returned an incomplete message.');
    }
}
