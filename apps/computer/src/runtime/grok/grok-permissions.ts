import * as z from 'zod';
import { jsonRpcInvalidParams, jsonRpcMethodNotFound } from '../json-rpc.ts';
import { JsonRpcHandlerError, type JsonRpcRequestHandler } from '../json-rpc-connection.ts';

const permissionRequestSchema = z.looseObject({
    options: z.array(z.looseObject({ kind: z.string(), optionId: z.string().min(1) })),
    sessionId: z.string(),
});

/**
 * Answers Grok's agent → client requests. Haus Agents run with full access, as under the AI SDK
 * harness, but approval follows Raft's fail-closed rules: only with both the launch and session
 * yolo facts, only for the active session while a turn runs, and only by the offered allow-once
 * option. Every other client method (file system, terminal, questions) is not offered.
 */
export function grokRequestHandler(input: {
    autoApprove: boolean;
    isTurnRunning: () => boolean;
    sessionId: () => string | undefined;
}): JsonRpcRequestHandler {
    return (method, params) => {
        if (method !== 'session/request_permission') {
            throw new JsonRpcHandlerError({
                code: jsonRpcMethodNotFound,
                message: `Haus does not support the ACP client method ${method}.`,
            });
        }
        if (!(input.autoApprove && input.isTurnRunning())) {
            throw invalid('Grok permission request is outside an active always-approve turn');
        }
        const request = permissionRequestSchema.safeParse(params);
        if (!request.success || request.data.sessionId !== input.sessionId()) {
            throw invalid('Grok permission request session does not match the active Grok session');
        }
        const allowOnce = request.data.options.find((option) => option.kind === 'allow_once');
        if (!allowOnce) {
            throw invalid('Grok permission request does not offer an allow_once option');
        }
        return { outcome: { optionId: allowOnce.optionId, outcome: 'selected' } };
    };
}

function invalid(message: string): JsonRpcHandlerError {
    return new JsonRpcHandlerError({ code: jsonRpcInvalidParams, message });
}
