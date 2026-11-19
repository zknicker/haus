import type { AgentWorkerReceipt, AgentWorkerStartResponse, CloudAgentProvider } from '@haus/api';
import { agentWorkerStartResponseSchema, isTerminalWorkerTurnStatus } from '@haus/api';
import { launchClaimedWork } from './launch-claimed-work.ts';
import { CloudLaunchJournal } from './launch-journal.ts';
import {
    type CloudAgentProvider as WorkerExecutor,
    CloudAgentProviderUnavailableError,
    type WorkerTurnRef,
} from './provider.ts';
import { cloudAgentProvider } from './registry.ts';
import type { WorkerSupervisor } from './work-runner.ts';

export interface WorkerStartRequest {
    /** The Trigger or Reminder fire the `--say` post answers; Server validates it. */
    cause?: string;
    content: string;
    /** The provider prompt. It stays on this Computer and never reaches Server. */
    instructions: string;
    nonce: string;
    /** The place `--on` named. */
    provider: CloudAgentProvider;
    replyToMessageId?: string;
    repository: string;
    startingRef: string | null;
    target: string;
    task?: string;
    title: string;
}

export class WorkerLaunchFailedError extends Error {
    readonly receipt: AgentWorkerReceipt;

    constructor(receipt: AgentWorkerReceipt, cause: unknown) {
        super(
            `The Worker launch stopped: ${cause instanceof Error ? cause.message : String(cause)}`
        );
        this.name = 'WorkerLaunchFailedError';
        this.receipt = receipt;
    }
}

/**
 * Runs one `haus worker start` on the provider the Agent named, or this
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
export async function startWorker(input: {
    request: WorkerStartRequest;
    supervisor: Pick<WorkerSupervisor, 'report' | 'watch' | 'reconcile' | 'runLaunch'>;
    dataRoot: string;
    runnerToken: string;
    serverId: string;
    serverOrigin: string;
}): Promise<AgentWorkerStartResponse> {
    const provider = cloudAgentProvider(input.request.provider, input.dataRoot);
    const readiness = await provider.readiness();
    if (!readiness.ready) {
        throw new CloudAgentProviderUnavailableError(readiness.reason);
    }

    const { instructions, ...serverInput } = input.request;
    const response = await fetch(new URL('/api/agent/workers', input.serverOrigin), {
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
        throw new WorkerServerError(payload);
    }
    const receipt = agentWorkerStartResponseSchema.parse(payload);
    // A freshness hold created nothing, so there is no Run to launch.
    if (receipt.state === 'held' || isTerminalWorkerTurnStatus(receipt.worker.status)) {
        return receipt;
    }
    return await launchRecordedWork(input, receipt, provider);
}

async function launchRecordedWork(
    input: Parameters<typeof startWorker>[0],
    receipt: AgentWorkerReceipt,
    provider: WorkerExecutor
): Promise<AgentWorkerStartResponse> {
    const run = receipt.worker.turns.find((candidate) => candidate.turnId === receipt.turnId);
    const ref: WorkerTurnRef = {
        provider: receipt.worker.provider,
        providerAgentId: receipt.worker.providerAgentId,
        providerRunId: run?.providerRunId ?? null,
        turnId: receipt.turnId,
        workerId: receipt.worker.id,
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
        throw new WorkerLaunchFailedError(receipt, new Error(summary));
    }
    if (existing?.phase === 'launched') {
        await input.supervisor.reconcile([
            {
                ...ref,
                providerAgentId: existing.launch.providerAgentId,
                providerRunId: existing.launch.providerRunId,
                cancelRequested: receipt.worker.cancelRequestedAt !== null,
                status: receipt.worker.status,
            },
        ]);
        return receipt;
    }
    if (receipt.idempotent || existing) {
        if (ref.providerAgentId && ref.providerRunId) {
            await input.supervisor.reconcile([
                {
                    ...ref,
                    cancelRequested: receipt.worker.cancelRequestedAt !== null,
                    status: receipt.worker.status,
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
            console.error('Worker launch did not finish.', {
                cause: cause instanceof Error ? cause.message : String(cause),
                operation: 'worker.launch',
                provider: ref.provider,
                turnId: ref.turnId,
                workerId: ref.workerId,
            });
        });
    return receipt;
}

export class WorkerServerError extends Error {
    readonly code: string;

    constructor(payload: unknown) {
        const body = typeof payload === 'object' && payload !== null ? payload : {};
        super(
            'message' in body && typeof body.message === 'string'
                ? body.message
                : 'The Server refused the launch.'
        );
        this.code = 'code' in body && typeof body.code === 'string' ? body.code : 'SERVER_5XX';
        this.name = 'WorkerServerError';
    }
}
