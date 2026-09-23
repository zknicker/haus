import type { TraceCarrier } from '@haus/effect';
import * as z from 'zod';
import type { AgentActivityRun } from './agent-activity-run.ts';
import {
    agentHistoryResponseSchema,
    agentMessageCheckResponseSchema,
    agentReactionResponseSchema,
    agentSearchResponseSchema,
    agentSendResponseSchema,
    resolvedAgentMessageSchema,
} from './agent-cli/agent-api-schemas.ts';
import {
    createLocalAgentSkill,
    deleteLocalAgentSkill,
    listLocalAgentSkills,
    patchLocalAgentSkill,
    viewLocalAgentSkill,
    writeLocalAgentSkillFile,
} from './agent-skills.ts';
import { handleCloudAgentStart } from './cloud-agents/proxy-route.ts';
import type { CloudAgentWorkSupervisor } from './cloud-agents/work-runner.ts';
import { classifyHausProxyBoundary } from './harness/activity-projector.ts';
import {
    type AgentInboxLocation,
    consumeServedAutomations,
    consumeVisibleMessages,
    recordRunVisibleMessages,
    type VisibleMessageIdentity,
} from './inbox-store.ts';
import { serveLocalAgentEvents } from './proxy-inbox.ts';
import { mcpRequestHeaders, mcpRequestSignal, readProxyResponse } from './proxy-mcp.ts';
import { isCommittedSend, isDefinitelyPreCommitFailure } from './proxy-send-outcome.ts';
import { attestVisibleMessages } from './visibility-receipt.ts';

const skillCreateSchema = z.object({
    content: z.string().min(1),
    description: z.string().trim().min(1),
    name: z.string().trim().min(1),
});
const skillPatchSchema = z.object({
    content: z.string().min(1),
    expectedHash: z.string().min(1),
    skillId: z.string().min(1),
});
const skillFileSchema = z.object({
    content: z.string(),
    expectedHash: z.string().min(1).nullable(),
    filePath: z.string().min(1),
    skillId: z.string().min(1),
});

export interface LoopbackProxy {
    clearRunnerToken(): void;
    close(): void;
    resetSendCount(): void;
    sendCount(): number;
    setActivityRun(activity: AgentActivityRun | undefined): void;
    setOnCommittedSend(onSend: (() => void) | undefined): void;
    setRunId(runId: string): void;
    setRunnerToken(token: string): void;
    setTraceContext(context: TraceCarrier | undefined): void;
    url: string;
}

/** Per-launch proxy that keeps scoped Server authority outside the Agent process. */
export function startLoopbackProxy(input: {
    agentId?: string;
    cloudAgents?: CloudAgentWorkSupervisor;
    dataRoot?: string;
    proxyToken: string;
    runnerToken: string;
    runId?: string;
    serverId?: string;
    serverOrigin: string;
    skillsDir?: string;
}): LoopbackProxy {
    let sends = 0;
    let runnerToken: string | null = input.runnerToken;
    let runId: string | null = input.runId ?? null;
    let activityRun: AgentActivityRun | undefined;
    let traceContext: TraceCarrier | undefined;
    let onCommittedSend: (() => void) | undefined;
    const server = Bun.serve({
        fetch: async (request) => {
            const url = new URL(request.url);
            if (!url.pathname.startsWith('/api/agent/')) {
                return new Response('Not found', { status: 404 });
            }
            if (!isAuthorized(request, input.proxyToken)) {
                return new Response('Unauthorized', { status: 401 });
            }
            const category = classifyHausProxyBoundary(request.method, url.pathname);
            const recordCommittedSend = onCommittedSend;
            const operation = async () =>
                await handleAuthorizedProxyRequest(request, url, input, {
                    getRunId: () => runId,
                    getRunnerToken: () => runnerToken,
                    traceContext,
                    onCommittedSend: recordCommittedSend,
                    incrementSendCount: () => {
                        sends += 1;
                    },
                });
            return activityRun && category
                ? await activityRun.runPromise(
                      {
                          category,
                          outcomeFromResult: (response) => (response.ok ? 'completed' : 'failed'),
                      },
                      operation
                  )
                : await operation();
        },
        hostname: '127.0.0.1',
        port: 0,
    });
    return {
        clearRunnerToken: () => {
            runnerToken = null;
            traceContext = undefined;
            onCommittedSend = undefined;
        },
        close: () => server.stop(true),
        resetSendCount: () => {
            sends = 0;
        },
        sendCount: () => sends,
        setActivityRun: (activity) => {
            activityRun = activity;
        },
        setRunId: (value) => {
            runId = value;
        },
        setRunnerToken: (token) => {
            runnerToken = token;
        },
        setTraceContext: (context) => {
            traceContext = context;
        },
        setOnCommittedSend: (onSend) => {
            onCommittedSend = onSend;
        },
        url: `http://127.0.0.1:${server.port}`,
    };
}

async function handleAuthorizedProxyRequest(
    request: Request,
    url: URL,
    input: {
        agentId?: string;
        cloudAgents?: CloudAgentWorkSupervisor;
        dataRoot?: string;
        proxyToken: string;
        runId?: string;
        serverId?: string;
        serverOrigin: string;
        skillsDir?: string;
    },
    state: {
        getRunId(): string | null;
        getRunnerToken(): string | null;
        traceContext?: TraceCarrier;
        onCommittedSend?: () => void;
        incrementSendCount(): void;
    }
): Promise<Response> {
    const skillResponse = await handleSkillRequest(request, url, input);
    if (skillResponse) {
        return skillResponse;
    }
    const runnerToken = state.getRunnerToken();
    const traceContext = state.traceContext;
    if (!runnerToken) {
        return Response.json(
            { code: 'AGENT_IDLE', message: 'The Agent has no active turn.' },
            { status: 409 }
        );
    }
    const cloudAgent = await handleCloudAgentStart(request, url, {
        dataRoot: input.dataRoot,
        supervisor: input.cloudAgents,
        runnerToken,
        serverId: input.serverId,
        serverOrigin: input.serverOrigin,
    });
    if (cloudAgent) {
        return cloudAgent;
    }
    const location = agentInboxLocation(input);
    if (request.method === 'GET' && url.pathname === '/api/agent/events' && location) {
        const local = await serveLocalAgentEvents({
            location,
            getRunId: state.getRunId,
            attest: (identities) =>
                awaitBestEffortAttestation(input.serverOrigin, runnerToken, identities),
        });
        if (local) {
            return local;
        }
    }
    const body = await request.text();
    const forwardsBody = body.length > 0 && request.method !== 'GET' && request.method !== 'HEAD';
    const upstreamUrl = new URL(url.pathname, input.serverOrigin);
    upstreamUrl.search = url.search;
    const isMessageSend = url.pathname === '/api/agent/messages/send';
    const isMessageMutation = isMessageSend || url.pathname === '/api/agent/messages/react';
    let upstream: Response;
    try {
        upstream = await fetch(upstreamUrl, {
            ...(forwardsBody ? { body } : {}),
            headers: {
                authorization: `Bearer ${runnerToken}`,
                ...mcpRequestHeaders(request),
                ...(traceContext ? { traceparent: traceContext.traceparent } : {}),
                ...(forwardsBody
                    ? {
                          'content-type': request.headers.get('content-type') ?? 'application/json',
                      }
                    : {}),
            },
            method: request.method,
            signal: mcpRequestSignal(request),
        });
    } catch (error) {
        // Count ambiguous sends so a failed turn cannot replay duplicate model output.
        if (isMessageSend && !isDefinitelyPreCommitFailure(error)) {
            state.incrementSendCount();
        }
        return Response.json(
            { code: 'UPSTREAM_UNAVAILABLE', message: 'The Server response was unavailable.' },
            { status: 502 }
        );
    }
    const responseBody = await readProxyResponse(request, upstream);
    if (upstream.ok && isMessageSend && isCommittedSend(responseBody)) {
        state.incrementSendCount();
        state.onCommittedSend?.();
    }
    const visibleMessageIds = upstream.ok
        ? extractVisibleMessageIds(url.pathname, responseBody)
        : [];
    if (location && upstream.ok && url.pathname === '/api/agent/events') {
        // The Server marked these bodiless rows served as it returned them. They
        // carry no Chat identity, so they never enter visibility attestation —
        // `resolveAgentMessage` would reject a fire or assignment key and fail
        // the whole receipt. A failed mirror write only leaves a stale busy
        // notice that the next Server snapshot corrects; failing the response
        // would lose the item.
        await consumeServedAutomations(location, extractServedAutomationIds(responseBody)).catch(
            () => undefined
        );
    }
    if (location && visibleMessageIds.length > 0) {
        try {
            const activeRunId = state.getRunId();
            if (activeRunId) {
                await recordRunVisibleMessages(location, activeRunId, visibleMessageIds);
            }
            const attested = activeRunId
                ? await attestVisibleMessages(input.serverOrigin, runnerToken, visibleMessageIds)
                : null;
            if (!((activeRunId && attested) || isMessageMutation)) {
                return Response.json(
                    {
                        code: 'VISIBILITY_RECEIPT_UNAVAILABLE',
                        message: 'The Server could not record visible messages.',
                    },
                    { status: 502 }
                );
            }
            await consumeVisibleMessages(location, attested ?? visibleMessageIds);
        } catch {
            if (isMessageMutation) {
                return new Response(responseBody, {
                    headers: { 'content-type': 'application/json' },
                    status: upstream.status,
                });
            }
            return Response.json(
                {
                    code: 'LOCAL_INBOX_UNAVAILABLE',
                    message: 'The Agent inbox could not record visible messages.',
                },
                { status: 500 }
            );
        }
    }
    return new Response(responseBody, {
        headers: { 'content-type': 'application/json' },
        status: upstream.status,
    });
}

async function awaitBestEffortAttestation(
    serverOrigin: string,
    runnerToken: string,
    messages: VisibleMessageIdentity[]
): Promise<void> {
    await Promise.race([
        attestVisibleMessages(serverOrigin, runnerToken, messages),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 250)),
    ]);
}

function agentInboxLocation(input: {
    agentId?: string;
    dataRoot?: string;
    serverId?: string;
}): AgentInboxLocation | null {
    return input.agentId && input.dataRoot && input.serverId
        ? { agentId: input.agentId, dataRoot: input.dataRoot, serverId: input.serverId }
        : null;
}

function extractServedAutomationIds(responseBody: string): string[] {
    let body: unknown;
    try {
        body = JSON.parse(responseBody);
    } catch {
        return [];
    }
    const parsed = agentMessageCheckResponseSchema.safeParse(body);
    return parsed.success ? parsed.data.automations.map((event) => event.id) : [];
}

function extractVisibleMessageIds(
    pathname: string,
    responseBody: string
): VisibleMessageIdentity[] {
    let body: unknown;
    try {
        body = JSON.parse(responseBody);
    } catch {
        return [];
    }
    if (!(body && typeof body === 'object')) {
        return [];
    }
    if (pathname === '/api/agent/events') {
        const parsed = agentMessageCheckResponseSchema.safeParse(body);
        return parsed.success ? parsed.data.messages.map((row) => identity(row.message)) : [];
    }
    if (pathname === '/api/agent/history') {
        const parsed = agentHistoryResponseSchema.safeParse(body);
        return parsed.success ? parsed.data.messages.map(identity) : [];
    }
    if (pathname === '/api/agent/messages/search') {
        const parsed = agentSearchResponseSchema.safeParse(body);
        return parsed.success ? parsed.data.messages.map(identity) : [];
    }
    if (pathname === '/api/agent/messages/react') {
        const parsed = agentReactionResponseSchema.safeParse(body);
        return parsed.success ? [identity(parsed.data.message)] : [];
    }
    if (pathname === '/api/agent/messages/send') {
        const parsed = agentSendResponseSchema.safeParse(body);
        if (!parsed.success) {
            return [];
        }
        return parsed.data.state === 'held'
            ? parsed.data.shownMessages.map(identity)
            : parsed.data.recentUnread.map((row) => identity(row.message));
    }
    if (/^\/api\/agent\/messages\/[^/]+$/u.test(pathname)) {
        const parsed = resolvedAgentMessageSchema.safeParse(body);
        return parsed.success ? [identity(parsed.data.message)] : [];
    }
    return [];
}

function identity(message: {
    chat_id: string;
    id: string;
    sequence: number;
}): VisibleMessageIdentity {
    return { chatId: message.chat_id, id: message.id, sequence: message.sequence };
}

async function handleSkillRequest(
    request: Request,
    url: URL,
    input: { agentId?: string; skillsDir?: string }
): Promise<Response | null> {
    if (!(input.agentId && input.skillsDir && url.pathname.startsWith('/api/agent/skills'))) {
        return null;
    }
    try {
        if (url.pathname === '/api/agent/skills' && request.method === 'GET') {
            return Response.json(await listLocalAgentSkills(input.skillsDir));
        }
        if (url.pathname === '/api/agent/skills/create' && request.method === 'POST') {
            return Response.json(
                await createLocalAgentSkill(
                    input.skillsDir,
                    skillCreateSchema.parse(await request.json())
                )
            );
        }
        if (url.pathname === '/api/agent/skills/patch' && request.method === 'POST') {
            return Response.json(
                await patchLocalAgentSkill(
                    input.skillsDir,
                    skillPatchSchema.parse(await request.json())
                )
            );
        }
        if (url.pathname === '/api/agent/skills/write-file' && request.method === 'POST') {
            return Response.json(
                await writeLocalAgentSkillFile(
                    input.skillsDir,
                    skillFileSchema.parse(await request.json())
                )
            );
        }
        const skillId = decodeURIComponent(url.pathname.slice('/api/agent/skills/'.length));
        if (skillId && request.method === 'GET') {
            return Response.json(await viewLocalAgentSkill(input.skillsDir, skillId));
        }
        if (skillId && request.method === 'DELETE') {
            return Response.json(
                await deleteLocalAgentSkill(input.skillsDir, input.agentId, skillId)
            );
        }
        return null;
    } catch (error) {
        return Response.json(
            {
                code: 'INVALID_ARG',
                message: error instanceof Error ? error.message : String(error),
            },
            { status: 409 }
        );
    }
}

function isAuthorized(request: Request, proxyToken: string): boolean {
    return request.headers.get('authorization') === `Bearer ${proxyToken}`;
}
