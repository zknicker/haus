import * as z from 'zod';

/** JSON-RPC 2.0 framing for ACP over stdio: one message per line. */
export type JsonRpcId = number | string;

export type JsonRpcMessage =
    | {
          readonly id: JsonRpcId;
          readonly kind: 'request';
          readonly method: string;
          readonly params: unknown;
      }
    | { readonly kind: 'notification'; readonly method: string; readonly params: unknown }
    | { readonly id: JsonRpcId; readonly kind: 'result'; readonly result: unknown }
    | { readonly error: JsonRpcErrorBody; readonly id: JsonRpcId | null; readonly kind: 'error' };

export interface JsonRpcErrorBody {
    readonly code: number;
    readonly data?: unknown;
    readonly message: string;
}

const idSchema = z.union([z.number(), z.string()]);
const errorBodySchema = z.object({
    code: z.number(),
    data: z.unknown().optional(),
    message: z.string(),
});
const wireSchema = z.object({
    error: errorBodySchema.optional(),
    id: idSchema.nullable().optional(),
    jsonrpc: z.literal('2.0'),
    method: z.string().min(1).optional(),
    params: z.unknown().optional(),
    result: z.unknown().optional(),
});

/** Parses one line; `null` for a line that is not a JSON-RPC 2.0 message. */
export function parseJsonRpcLine(line: string): JsonRpcMessage | null {
    let value: unknown;
    try {
        value = JSON.parse(line);
    } catch {
        return null;
    }
    const parsed = wireSchema.safeParse(value);
    if (!parsed.success) {
        return null;
    }
    const wire = parsed.data;
    const hasResult = isRecord(value) && 'result' in value;
    if (wire.method !== undefined) {
        if (wire.id === undefined || wire.id === null) {
            return { kind: 'notification', method: wire.method, params: wire.params };
        }
        return { id: wire.id, kind: 'request', method: wire.method, params: wire.params };
    }
    if (wire.error) {
        return { error: wire.error, id: wire.id ?? null, kind: 'error' };
    }
    if (hasResult && wire.id !== undefined && wire.id !== null) {
        return { id: wire.id, kind: 'result', result: wire.result };
    }
    return null;
}

export function encodeRequest(id: JsonRpcId, method: string, params: unknown): string {
    return JSON.stringify({ id, jsonrpc: '2.0', method, params });
}

export function encodeNotification(method: string, params: unknown): string {
    return JSON.stringify({ jsonrpc: '2.0', method, params });
}

export function encodeResult(id: JsonRpcId, result: unknown): string {
    return JSON.stringify({ id, jsonrpc: '2.0', result });
}

export function encodeError(id: JsonRpcId, error: JsonRpcErrorBody): string {
    return JSON.stringify({ error, id, jsonrpc: '2.0' });
}

/** The agent answered a request with a JSON-RPC error. */
export class AcpRequestError extends Error {
    readonly code: number;
    readonly data: unknown;
    readonly method: string;

    constructor(method: string, body: JsonRpcErrorBody) {
        super(`${method} failed: ${describeError(body)}`);
        this.name = 'AcpRequestError';
        this.code = body.code;
        this.data = body.data;
        this.method = method;
    }
}

/** The connection closed (process exit, stdout end, or local close) before an answer. */
export class AcpConnectionClosedError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'AcpConnectionClosedError';
    }
}

export const jsonRpcMethodNotFound = -32_601;
export const jsonRpcInvalidParams = -32_602;

/** ACP agents put the detail in `data` when `message` is generic ("Internal error"). */
function describeError(body: JsonRpcErrorBody): string {
    const detail = typeof body.data === 'string' ? body.data : dataMessage(body.data);
    return detail && detail !== body.message ? `${body.message}: ${detail}` : body.message;
}

function dataMessage(data: unknown): string | undefined {
    if (!isRecord(data)) {
        return;
    }
    const detail = data.detail ?? data.message;
    return typeof detail === 'string' ? detail : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
