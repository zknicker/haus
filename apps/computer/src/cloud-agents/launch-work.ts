import type {
    AgentCloudAgentReceipt,
    AgentCloudAgentStartResponse,
    CloudAgentProvider,
} from '@haus/api';
import { agentCloudAgentStartResponseSchema, isTerminalCloudAgentStatus } from '@haus/api';
import { launchCloudAgent } from './launch-attempt.ts';
import { CloudLaunchJournal } from './launch-journal.ts';
import {
    type CloudAgentProvider as CloudAgentExecutor,
    type CloudAgentLaunch,
    CloudAgentLaunchRejectedError,
    CloudAgentProviderUnavailableError,
    type CloudAgentRunRef,
    cloudAgentModelSelectionOf,
} from './provider.ts';
import { cloudAgentProvider } from './registry.ts';
import { launchRejection } from './send-delivery.ts';
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
 * Server has accepted the launch the work exists: a provider refusal is
 * reported as a failed observation against that same work rather than erased.
 * A Server freshness hold returns as-is: nothing was recorded or launched.
 */
export async function startCloudAgentWork(input: {
    request: CloudAgentStartRequest;
    supervisor: Pick<CloudAgentWorkSupervisor, 'report' | 'watch' | 'reconcile'>;
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
    let launch: CloudAgentLaunch;
    try {
        launch = await launchCloudAgent(provider, {
            idempotencyKey: receipt.runId,
            instructions: input.request.instructions,
            // Server resolved the Server's chosen model, or its Auto fallback, onto the Run.
            model: cloudAgentModelSelectionOf(run?.model),
            ref: receipt.work.startingRef,
            repository: receipt.work.repository,
            title: receipt.work.title,
            workId: receipt.work.id,
        });
    } catch (cause) {
        return await failLaunch({ input, receipt, journal, ref, cause });
    }
    // Store the address before reporting it. Reconnect can recover a lost socket report.
    if (!(await journal.record(input.serverId, ref, launch))) {
        await provider.cancel({ ...ref, ...launch }, AbortSignal.timeout(15_000));
        throw new CloudAgentLaunchFailedError(receipt, new Error('The launch was stopped.'));
    }
    input.supervisor.report(ref, {
        observedAt: new Date().toISOString(),
        providerAgentId: launch.providerAgentId,
        ...(launch.providerRunId ? { providerRunId: launch.providerRunId } : {}),
        ...(launch.providerUrl ? { providerUrl: launch.providerUrl } : {}),
        status: launch.status,
        startedAt: launch.startedAt,
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

async function failLaunch({
    input,
    receipt,
    journal,
    ref,
    cause,
}: {
    input: Parameters<typeof startCloudAgentWork>[0];
    receipt: AgentCloudAgentReceipt;
    journal: CloudLaunchJournal;
    ref: CloudAgentRunRef;
    cause: unknown;
}): Promise<never> {
    const rejection =
        cause instanceof CloudAgentLaunchRejectedError
            ? launchRejection(cause)
            : {
                  errorCode:
                      cause instanceof DOMException && cause.name === 'TimeoutError'
                          ? 'launch-timeout'
                          : 'provider-launch-failed',
                  summary:
                      cause instanceof DOMException && cause.name === 'TimeoutError'
                          ? 'The cloud agent did not start within five minutes.'
                          : 'The cloud agent launch failed before the provider confirmed it started.',
              };
    await journal.reject(input.serverId, ref, rejection);
    const stopped = await journal.read(input.serverId, ref);
    const failure =
        stopped?.phase === 'rejected'
            ? { errorCode: stopped.errorCode, summary: stopped.summary ?? rejection.summary }
            : rejection;
    input.supervisor.report(ref, {
        ...(stopped?.phase === 'cancelled'
            ? { summary: 'The cloud agent launch was stopped.' }
            : failure),
        observedAt: new Date().toISOString(),
        status: stopped?.phase === 'cancelled' ? 'cancelled' : 'failed',
    });
    throw new CloudAgentLaunchFailedError(
        receipt,
        new Error(stopped?.phase === 'cancelled' ? 'The launch was stopped.' : failure.summary)
    );
}
