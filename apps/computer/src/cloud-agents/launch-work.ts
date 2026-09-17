import type { AgentCloudAgentReceipt } from '@haus/api';
import { agentCloudAgentReceiptSchema, isTerminalCloudAgentStatus } from '@haus/api';
import { CloudLaunchJournal } from './launch-journal.ts';
import {
    type CloudAgentLaunch,
    CloudAgentLaunchRejectedError,
    CloudAgentProviderUnavailableError,
    type CloudAgentRunRef,
} from './provider.ts';
import { cloudAgentProvider } from './registry.ts';
import type { CloudAgentWorkSupervisor } from './work-runner.ts';

export interface CloudAgentStartRequest {
    content: string;
    /** The provider prompt. It stays on this Computer and never reaches Server. */
    instructions: string;
    nonce: string;
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
            `The provider refused the launch: ${cause instanceof Error ? cause.message : String(cause)}`
        );
        this.name = 'CloudAgentLaunchFailedError';
        this.receipt = receipt;
    }
}

export class CloudAgentLaunchUnconfirmedError extends Error {
    readonly code = 'CLOUD_AGENT_LAUNCH_UNCONFIRMED';

    constructor() {
        super(
            'The launch could not be confirmed. Inspect the existing work in Cursor before starting another run.'
        );
    }
}

/**
 * Runs one `haus cloud-agent start`. Readiness is checked before Server is
 * asked for anything, so an unavailable capability creates no Message. Once
 * Server has accepted the launch the work exists: a provider refusal is
 * reported as a failed observation against that same work rather than erased.
 */
export async function startCloudAgentWork(input: {
    request: CloudAgentStartRequest;
    supervisor: Pick<CloudAgentWorkSupervisor, 'report' | 'watch' | 'reconcile'>;
    dataRoot: string;
    runnerToken: string;
    serverId: string;
    serverOrigin: string;
}): Promise<AgentCloudAgentReceipt> {
    const provider = cloudAgentProvider();
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
    const receipt = agentCloudAgentReceiptSchema.parse(payload);
    if (isTerminalCloudAgentStatus(receipt.work.status)) {
        return receipt;
    }
    const ref: CloudAgentRunRef = {
        providerAgentId: receipt.work.providerAgentId,
        providerRunId:
            receipt.work.runs.find((run) => run.runId === receipt.runId)?.providerRunId ?? null,
        runId: receipt.runId,
        workId: receipt.work.id,
    };
    const journal = new CloudLaunchJournal(input.dataRoot);
    const existing = await journal.read(input.serverId, ref);
    if (existing?.phase === 'rejected') {
        input.supervisor.report(ref, {
            errorCode: 'provider-launch-rejected',
            observedAt: new Date().toISOString(),
            status: 'failed',
            summary: 'The provider rejected the launch.',
        });
        throw new CloudAgentLaunchFailedError(
            receipt,
            new Error('The provider rejected the launch.')
        );
    }
    if (existing?.phase === 'launched') {
        await input.supervisor.reconcile([
            {
                ...ref,
                providerAgentId: existing.launch.providerAgentId,
                providerRunId: existing.launch.providerRunId,
                cancelRequested: receipt.work.cancelRequestedAt !== null,
                provider: provider.provider,
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
                    provider: provider.provider,
                    status: receipt.work.status,
                },
            ]);
            return receipt;
        }
        throw new CloudAgentLaunchUnconfirmedError();
    }
    if (!(await journal.claim(input.serverId, ref))) {
        throw new CloudAgentLaunchUnconfirmedError();
    }
    let launch: CloudAgentLaunch;
    try {
        launch = await provider.start({
            idempotencyKey: receipt.runId,
            instructions,
            ref: receipt.work.startingRef,
            repository: receipt.work.repository,
            title: receipt.work.title,
        });
    } catch (cause) {
        if (cause instanceof CloudAgentLaunchRejectedError) {
            await journal.reject(input.serverId, ref);
            input.supervisor.report(ref, {
                errorCode: 'provider-launch-rejected',
                observedAt: new Date().toISOString(),
                status: 'failed',
                summary: 'The provider rejected the launch.',
            });
            throw new CloudAgentLaunchFailedError(receipt, cause);
        }
        input.supervisor.report(ref, {
            errorCode: 'launch-outcome-unknown',
            observedAt: new Date().toISOString(),
            status: 'queued',
            activity: {
                at: new Date().toISOString(),
                summary: 'Launch confirmation unavailable; inspect provider before retrying.',
            },
        });
        throw new CloudAgentLaunchUnconfirmedError();
    }
    // Store the address before reporting it. Reconnect can recover a lost socket report.
    await journal.record(input.serverId, ref, launch);
    input.supervisor.report(ref, {
        observedAt: new Date().toISOString(),
        providerAgentId: launch.providerAgentId,
        providerRunId: launch.providerRunId,
        ...(launch.providerUrl ? { providerUrl: launch.providerUrl } : {}),
        status: launch.status,
    });
    input.supervisor.watch({
        ...ref,
        providerAgentId: launch.providerAgentId,
        providerRunId: launch.providerRunId,
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
