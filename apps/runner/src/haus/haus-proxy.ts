import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
    AGENT_DISPATCH_ID_HEADER,
    AGENT_DISPATCH_OUTCOME_UNKNOWN,
    dispatchIdOf,
    type InvocationOutcome,
} from '@haus/api';
import type { RunDispatches } from '../dispatch/dispatch-id.ts';
import type { CommittedSend, RunAuthority } from '../run-context.ts';
import {
    attestVisibleMessages,
    committedSendIn,
    servedAutomationIdsIn,
    type VisibleMessage,
    visibleMessagesIn,
} from './visible-messages.ts';

export type HausProxy = ReturnType<typeof startHausProxy>;

const mutationPaths = new Set([
    '/api/agent/workers',
    '/api/agent/messages/react',
    '/api/agent/messages/send',
]);

export function startHausProxy(input: { authority: RunAuthority; dispatches: RunDispatches }) {
    const calls = new Map<string, string>();
    const visible = new Map<string, VisibleMessage>();
    const servedAutomationIds = new Set<string>();
    const sends: CommittedSend[] = [];
    let sendCount = 0;
    const state = {
        authority: input.authority,
        commitSend: (send: Omit<CommittedSend, 'atMs'>) => {
            sends.push({ ...send, atMs: performance.now() });
        },
        countSend: () => {
            sendCount += 1;
        },
        dispatches: input.dispatches,
        recordServed: (ids: readonly string[]) => {
            for (const id of ids) {
                servedAutomationIds.add(id);
            }
        },
        recordVisible: (messages: readonly VisibleMessage[]) => {
            for (const message of messages) {
                visible.set(message.id, message);
            }
        },
    };
    const server = Bun.serve({
        fetch: async (request) => {
            const url = new URL(request.url);
            if (!url.pathname.startsWith('/api/agent/')) {
                return new Response('Not found', { status: 404 });
            }
            const toolCallId = callOf(calls, request.headers.get('authorization'));
            if (!toolCallId) {
                return new Response('Unauthorized', { status: 401 });
            }
            return await forward(request, url, toolCallId, state);
        },
        hostname: '127.0.0.1',
        maxRequestBodySize: 256 * 1024 ** 2,
        port: 0,
    });
    return {
        close: () => server.stop(true),
        openCall(toolCallId: string) {
            const token = `grta_${randomBytes(32).toString('base64url')}`;
            calls.set(token, toolCallId);
            return { close: () => calls.delete(token), token };
        },
        url: `http://127.0.0.1:${server.port}`,
        visibility: () => ({
            sendCount,
            sends: [...sends],
            servedAutomationIds: [...servedAutomationIds],
            visibleMessages: [...visible.values()],
        }),
    };
}

async function forward(
    request: Request,
    url: URL,
    toolCallId: string,
    state: {
        authority: RunAuthority;
        commitSend(send: Omit<CommittedSend, 'atMs'>): void;
        countSend(): void;
        dispatches: RunDispatches;
        recordServed(ids: readonly string[]): void;
        recordVisible(messages: readonly VisibleMessage[]): void;
    }
) {
    const isSend = url.pathname === '/api/agent/messages/send';
    const mutating = !(request.method === 'GET' || request.method === 'HEAD');
    const body = mutating ? await request.text() : '';
    const key = mutating ? await state.dispatches.open(toolCallId, 'agent-api') : null;
    const finish = async (outcome: InvocationOutcome) => {
        if (key) {
            await state.dispatches.finish(key, outcome);
        }
    };
    let upstream: Response;
    let text: string;
    try {
        upstream = await fetch(new URL(`${url.pathname}${url.search}`, state.authority.serverUrl), {
            ...(body.length > 0 ? { body } : {}),
            headers: {
                authorization: `Bearer ${state.authority.runCredential}`,
                ...(body.length > 0
                    ? { 'content-type': request.headers.get('content-type') ?? 'application/json' }
                    : {}),
                ...(key ? { [AGENT_DISPATCH_ID_HEADER]: dispatchIdOf(key) } : {}),
            },
            method: request.method,
        });
        text = await upstream.text();
    } catch (error) {
        const ambiguous = !isDefinitelyPreCommitFailure(error);
        await finish(ambiguous ? 'unknown' : 'failed');
        if (isSend && ambiguous) {
            state.countSend();
        }
        return failure(502, 'UPSTREAM_UNAVAILABLE', 'The Server response was unavailable.');
    }
    const parsed = parseJson(text);
    const outcome = agentApiOutcome(upstream.status, parsed);
    await finish(outcome);
    if (outcome === 'unknown') {
        if (isSend) {
            state.countSend();
        }
        return Response.json(
            {
                code: AGENT_DISPATCH_OUTCOME_UNKNOWN,
                message: 'This request may or may not have taken effect.',
                nextAction: 'Check its effects before running it again.',
            },
            { status: upstream.status }
        );
    }
    if (upstream.ok) {
        const committed = committedSendIn(url.pathname, body, parsed);
        if (committed) {
            state.countSend();
            state.commitSend(committed);
        }
        state.recordServed(servedAutomationIdsIn(url.pathname, parsed));
        const shown = visibleMessagesIn(url.pathname, parsed);
        if (shown.length > 0) {
            state.recordVisible(shown);
            const attested = await attestVisibleMessages(state.authority, shown);
            if (!(attested || mutationPaths.has(url.pathname))) {
                return failure(
                    502,
                    'VISIBILITY_RECEIPT_UNAVAILABLE',
                    'The Server could not record visible messages.'
                );
            }
        }
    }
    return new Response(text, {
        headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
        status: upstream.status,
    });
}

function agentApiOutcome(status: number, body: unknown) {
    if (status >= 200 && status < 300) {
        return 'completed';
    }
    const code = body && typeof body === 'object' && 'code' in body ? body.code : null;
    return code === AGENT_DISPATCH_OUTCOME_UNKNOWN ? 'unknown' : 'failed';
}

function callOf(calls: ReadonlyMap<string, string>, authorization: string | null) {
    const presented = Buffer.from(authorization?.replace(/^Bearer /u, '') ?? '');
    for (const [token, toolCallId] of calls) {
        const expected = Buffer.from(token);
        if (expected.length === presented.length && timingSafeEqual(expected, presented)) {
            return toolCallId;
        }
    }
    return null;
}

const preCommitFailureCodes = new Set([
    'CERT_HAS_EXPIRED',
    'ConnectionRefused',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'EAI_AGAIN',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

function isDefinitelyPreCommitFailure(error: unknown) {
    let current = error;
    for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
        if ('code' in current && preCommitFailureCodes.has(String(current.code))) {
            return true;
        }
        current = 'cause' in current ? current.cause : null;
    }
    return false;
}

function failure(status: number, code: string, message: string) {
    return Response.json({ code, message }, { status });
}

function parseJson(text: string) {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return null;
    }
}
