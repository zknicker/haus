import type {
    AgentCloudAgentReceipt,
    AgentCloudAgentStartResponse,
    CloudAgentProvider,
} from '@haus/api';
import { agentCloudAgentStartResponseSchema, isTerminalCloudAgentStatus } from '@haus/api';
import { launchClaimedWork } from './launch-claimed-work.ts';
import { CloudLaunchJournal } from './launch-journal.ts';
import {
    type CloudAgentProvider as CloudAgentExecutor,
    CloudAgentProviderUnavailableError,
    type CloudAgentRunRef,
} from './provider.ts';
import { cloudAgentProvider } from './registry.ts';
import { readDefaultCloudAgentProvider } from './settings.ts';
import type { CloudAgentWorkSupervisor } from './work-runner.ts';

export interface CloudAgentStartRequest {
    /** The Trigger or Reminder fire the `--say` post answers; Server validates it. */
    cause?: string;
    content: string;
    /** The provider prompt. It stays on this Computer and never reaches Server. */
    instructions: string;
    nonce: string;
    /** Absent means this Computer's default provider. */
    provider?: CloudAgentProvider;
    replyToMessageId?: string;
    repository: string;
    startingRef: string | null;
    target: string;
    title: string;
}

export class CloudAgentLaunchFailedError extends Error {
    readonly receipt: AgentCloudAgentReceipt;

    constructor(receipt: AgentCloudAgentReceipt, cause: unknown) {
        super(
            `The cloud agent launch stopped: ${cause instanceof Error ? cause.message : String(cause)}`
        );
        this.name = 'CloudAgentLaunchFailedError';
        this.receipt = receipt;
    }
}

/**
 * Runs one `haus cloud-agent start` on the provider the Agent named, or this
 * Computer's default. An unready provider never falls back to the other one.
 * Readiness is checked before Server is
 * asked for anything, so an unavailable capability creates no Message. Once
 * Server has accepted the launch the work exists, and the receipt returns as
 * soon as this Computer claims its Run: the provider launch (for Claude, a
 * repository clone first) can outlast any command timeout, and a caller that
 * timed out would launch the same work again. A provider refusal is reported
 * as a failed observation against that same work rather than erased. A Server
 * freshness hold returns as-is: nothing was recorded or launched.
 */
export async function startCloudAgentWork(input: {
    request: CloudAgentStartRequest;
    supervisor: Pick<CloudAgentWorkSupervisor, 'report' | 'watch' | 'reconcile' | 'runLaunch'>;
    dataRoot: string;
    runnerToken: string;
    serverId: string;
    serverOrigin: string;
}): Promise<AgentCloudAgentStartResponse> {
    const provider = cloudAgentProvider(
        input.request.provider ?? (await readDefaultCloudAgentProvider(input.dataRoot))
    );
    const readiness = await provider.readiness();
    if (!readiness.ready) {
        throw new CloudAgentProviderUnavailableError(readiness.reason);
    }

    const { instructions, ...serverInput } = input.request;
    const response = await fetch(new URL('/api/agent/cloud-agents', input.serverOrigin), {
        body: JSON.stringify({ ...serverInput, provider: provider.provider }),
        headers: {
            authorization: `Bearer ${input.runnerToken}`,
            'content-type': 'application/json',
        },
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json();
    if (!response.ok) {
        throw new CloudAgentServerError(payload);
    }
    const receipt = agentCloudAgentStartResponseSchema.parse(payload);
    // A freshness hold created nothing, so there is no Run to launch.
    if (receipt.state === 'held' || isTerminalCloudAgentStatus(receipt.work.status)) {
        return receipt;
    }
    return await launchRecordedWork(input, receipt, provider);
}

async function launchRecordedWork(
    input: Parameters<typeof startCloudAgentWork>[0],
    receipt: AgentCloudAgentReceipt,
    provider: CloudAgentExecutor
): Promise<AgentCloudAgentStartResponse> {
    const run = receipt.work.runs.find((candidate) => candidate.runId === receipt.runId);
    const ref: CloudAgentRunRef = {
        provider: receipt.work.provider,
        providerAgentId: receipt.work.providerAgentId,
        providerRunId: run?.providerRunId ?? null,
        runId: receipt.runId,
        workId: receipt.work.id,
    };
    const journal = new CloudLaunchJournal(input.dataRoot);
    const existing = await journal.read(input.serverId, ref);
    if (existing?.phase === 'rejected') {
        const summary = existing.summary ?? 'The provider rejected the launch.';
        input.supervisor.report(ref, {
            errorCode: existing.errorCode,
            observedAt: new Date().toISOString(),
            status: 'failed',
            summary,
        });
        throw new CloudAgentLaunchFailedError(receipt, new Error(summary));
    }
    if (existing?.phase === 'launched') {
        await input.supervisor.reconcile([
            {
                ...ref,
                providerAgentId: existing.launch.providerAgentId,
                providerRunId: existing.launch.providerRunId,
                cancelRequested: receipt.work.cancelRequestedAt !== null,
                status: receipt.work.status,
            },
        ]);
        return receipt;
    }
    if (receipt.idempotent || existing) {
        if (ref.providerAgentId && ref.providerRunId) {
            await input.supervisor.reconcile([
                {
                    ...ref,
                    cancelRequested: receipt.work.cancelRequestedAt !== null,
                    status: receipt.work.status,
                },
            ]);
            return receipt;
        }
        input.supervisor.watch(ref);
        return receipt;
    }
    if (!(await journal.claim(input.serverId, ref))) {
        input.supervisor.watch(ref);
        return receipt;
    }
    input.supervisor.watch(ref);
    // The work is recorded and claimed, so the command returns while the launch scope finishes it.
    input.supervisor
        .runLaunch(() =>
            launchClaimedWork({
                instructions: input.request.instructions,
                journal,
                provider,
                receipt,
                ref,
                serverId: input.serverId,
                supervisor: input.supervisor,
            })
        )
        .catch((cause: unknown) => {
            // The claimed Run stays `launching`; its watch settles it at the launch deadline.
            console.error('Cloud Agent launch did not finish.', {
                cause: cause instanceof Error ? cause.message : String(cause),
                operation: 'cloud-agent.launch',
                provider: ref.provider,
                runId: ref.runId,
                workId: ref.workId,
            });
        });
    return receipt;
}

export class CloudAgentServerError extends Error {
    readonly code: string;

    constructor(payload: unknown) {
        const body = typeof payload === 'object' && payload !== null ? payload : {};
        super(
            'message' in body && typeof body.message === 'string'
                ? body.message
                : 'The Server refused the launch.'
        );
        this.code = 'code' in body && typeof body.code === 'string' ? body.code : 'SERVER_5XX';
        this.name = 'CloudAgentServerError';
    }
}
