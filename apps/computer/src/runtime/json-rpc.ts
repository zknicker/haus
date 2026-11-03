import * as z from 'zod';

/**
 * JSON-RPC 2.0 framing over stdio, one message per line, shared by the Codex app-server and Grok
 * ACP drivers. Codex omits the `jsonrpc` member and sometimes the error `code`, so both are
 * optional here; a JSON object that is no JSON-RPC message at all is `foreign` (Codex writes
 * `{ type: 'error' }` capacity lines on the same stream).
 */
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
    | { readonly error: JsonRpcErrorBody; readonly id: JsonRpcId | null; readonly kind: 'error' }
    | { readonly kind: 'foreign'; readonly value: Readonly<Record<string, unknown>> };

export interface JsonRpcErrorBody {
    readonly code?: number;
    readonly data?: unknown;
    readonly message: string;
}

const idSchema = z.union([z.number(), z.string()]);
const errorBodySchema = z.looseObject({
    code: z.number().optional(),
    data: z.unknown().optional(),
    message: z.string().optional(),
});
const wireSchema = z.looseObject({
    error: errorBodySchema.optional(),
    id: idSchema.nullable().optional(),
    jsonrpc: z.literal('2.0').optional(),
    method: z.string().min(1).optional(),
    params: z.unknown().optional(),
    result: z.unknown().optional(),
});

/** Parses one line; `null` for a line that is not a JSON object. */
export function parseJsonRpcLine(line: string): JsonRpcMessage | null {
    let value: unknown;
    try {
        value = JSON.parse(line);
    } catch {
        return null;
    }
    return isRecord(value) ? classifyJsonRpc(value) : null;
}

function classifyJsonRpc(value: Record<string, unknown>): JsonRpcMessage {
    const parsed = wireSchema.safeParse(value);
    if (!parsed.success) {
        return { kind: 'foreign', value };
    }
    const wire = parsed.data;
    if (wire.method !== undefined) {
        return wire.id === undefined || wire.id === null
            ? { kind: 'notification', method: wire.method, params: wire.params }
            : { id: wire.id, kind: 'request', method: wire.method, params: wire.params };
    }
    if (wire.error && 'id' in value) {
        const { code, data, message } = wire.error;
        return {
            error: { code, data, message: message ?? 'JSON-RPC error' },
            id: wire.id ?? null,
            kind: 'error',
        };
    }
    if ('result' in value && wire.id !== undefined && wire.id !== null) {
        return { id: wire.id, kind: 'result', result: wire.result };
    }
    return { kind: 'foreign', value };
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

/** The peer answered a request with a JSON-RPC error. */
export class JsonRpcRequestError extends Error {
    readonly code: number | undefined;
    readonly data: unknown;
    /** The peer's own error text, without the method prefix. */
    readonly detail: string;
    readonly method: string;

    constructor(method: string, body: JsonRpcErrorBody) {
        const detail = describeError(body);
        super(`${method} failed: ${detail}`);
        this.name = 'JsonRpcRequestError';
        this.code = body.code;
        this.data = body.data;
        this.detail = detail;
        this.method = method;
    }
}

/** The connection closed (process exit, stdout end, or local close) before an answer. */
export class JsonRpcConnectionClosedError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'JsonRpcConnectionClosedError';
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
