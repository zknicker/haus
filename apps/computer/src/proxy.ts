import type { TraceCarrier } from '@haus/effect';
import type { AgentActivityRun } from './agent-activity-run.ts';
import { createArtifactProxy } from './artifacts/proxy.ts';
import { handleCloudAgentStart } from './cloud-agents/proxy-route.ts';
import type { CloudAgentWorkSupervisor } from './cloud-agents/work-runner.ts';
import { classifyHausProxyBoundary } from './harness/haus-proxy-boundary.ts';
import {
    type AgentInboxLocation,
    consumeServedAutomations,
    type VisibleMessageIdentity,
} from './inbox-store.ts';
import { serveLocalAgentEvents } from './proxy-inbox.ts';
import { mcpRequestHeaders, mcpRequestSignal, readProxyResponse } from './proxy-mcp.ts';
import { extractServedAutomationIds, extractVisibleMessageIds } from './proxy-response-ids.ts';
import {
    type CommittedSend,
    committedSend,
    countAmbiguousSend,
    isDefinitelyPreCommitFailure,
    serverUnavailable,
} from './proxy-send-outcome.ts';
import { handleSkillRequest } from './proxy-skills.ts';
import { recordProxyVisibility } from './proxy-visibility.ts';
import { attestVisibleMessages } from './visibility-receipt.ts';

export interface LoopbackProxy {
    clearRunnerToken(): void;
    close(): void;
    resetSendCount(): void;
    sendCount(): number;
    setActivityRun(activity: AgentActivityRun | undefined): void;
    setOnCommittedSend(onSend: ((send: CommittedSend) => void) | undefined): void;
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
    const artifacts = createArtifactProxy(input);
    let sends = 0;
    let runnerToken: string | null = input.runnerToken;
    let runId: string | null = input.runId ?? null;
    let activityRun: AgentActivityRun | undefined;
    let traceContext: TraceCarrier | undefined;
    let onCommittedSend: ((send: CommittedSend) => void) | undefined;
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
                    artifacts,
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
        maxRequestBodySize: 256 * 1024 ** 2,
        port: 0,
    });
    return {
        clearRunnerToken: () => {
            runnerToken = null;
            traceContext = undefined;
            onCommittedSend = undefined;
            void artifacts.release().catch((error: unknown) => {
                process.stderr.write(`Artifact cache release failed: ${String(error)}\n`);
            });
        },
        close: () => {
            server.stop(true);
            void artifacts.release().catch((error: unknown) => {
                process.stderr.write(`Artifact cache release failed: ${String(error)}\n`);
            });
        },
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
        onCommittedSend?: (send: CommittedSend) => void;
        incrementSendCount(): void;
        artifacts: ReturnType<typeof createArtifactProxy>;
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
    const artifact = await state.artifacts.handle(request, url, {
        runnerToken,
        serverOrigin: input.serverOrigin,
    });
    if (artifact) {
        return artifact;
    }
    const cloudAgent = await handleCloudAgentStart(request, url, {
        dataRoot: input.dataRoot,
        supervisor: input.cloudAgents,
        runnerToken,
        serverId: input.serverId,
        serverOrigin: input.serverOrigin,
    });
    const location = agentInboxLocation(input);
    if (cloudAgent) {
        // A held launch showed the model newer messages, exactly as a held send does.
        const launchBody = await cloudAgent.text();
        await recordProxyVisibility({
            activeRunId: state.getRunId(),
            location,
            mutation: true,
            runnerToken,
            serverOrigin: input.serverOrigin,
            visible: cloudAgent.ok ? extractVisibleMessageIds(url.pathname, launchBody) : [],
        });
        return new Response(launchBody, {
            headers: { 'content-type': 'application/json' },
            status: cloudAgent.status,
        });
    }
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
        const ambiguous = isMessageSend && !isDefinitelyPreCommitFailure(error);
        return countAmbiguousSend(state, ambiguous, serverUnavailable());
    }
    const responseBody = await readProxyResponse(request, upstream);
    if (responseBody instanceof Response) {
        // A send the Server accepted but whose receipt was lost is as ambiguous as a lost request.
        return countAmbiguousSend(state, isMessageSend && upstream.ok, responseBody);
    }
    const committed = upstream.ok && isMessageSend ? committedSend(body, responseBody) : null;
    if (committed) {
        state.incrementSendCount();
        state.onCommittedSend?.(committed);
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
    const visibilityFailure = await recordProxyVisibility({
        activeRunId: state.getRunId(),
        location,
        mutation: isMessageMutation,
        runnerToken,
        serverOrigin: input.serverOrigin,
        visible: visibleMessageIds,
    });
    if (visibilityFailure) {
        return visibilityFailure;
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

function isAuthorized(request: Request, proxyToken: string): boolean {
    return request.headers.get('authorization') === `Bearer ${proxyToken}`;
}
