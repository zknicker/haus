import { agentCloudAgentSendReceiptSchema } from '@haus/api';
import { CloudLaunchJournal, type CloudLaunchRecord } from './launch-journal.ts';
import { CloudAgentServerError } from './launch-work.ts';
import { cloudAgentModelSelectionOf } from './provider.ts';
import type { CloudAgentWorkSupervisor } from './work-runner.ts';

export interface CloudAgentSendRequest {
    instructions: string;
    interrupt: boolean;
    nonce: string;
    workId: string;
}

export async function sendCloudAgentWork(input: {
    request: CloudAgentSendRequest;
    supervisor: Pick<CloudAgentWorkSupervisor, 'watch'>;
    dataRoot: string;
    runnerToken: string;
    serverId: string;
    serverOrigin: string;
}) {
    const { instructions, interrupt, ...body } = input.request;
    const response = await fetch(new URL('/api/agent/cloud-agents/send', input.serverOrigin), {
        body: JSON.stringify(body),
        headers: {
            authorization: `Bearer ${input.runnerToken}`,
            'content-type': 'application/json',
        },
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
        throw new CloudAgentServerError(payload);
    }
    const receipt = agentCloudAgentSendReceiptSchema.parse(payload);
    const providerAgentId = receipt.work.providerAgentId;
    if (!providerAgentId) {
        throw new Error('Cloud Agent identity is not confirmed yet. Inspect it before sending.');
    }
    const run = receipt.work.runs.find((candidate) => candidate.runId === receipt.runId);
    const ref = {
        providerAgentId,
        providerRunId: run?.providerRunId ?? null,
        runId: receipt.runId,
        workId: receipt.work.id,
    };
    const journal = new CloudLaunchJournal(input.dataRoot);
    const claimed = await journal.claim(input.serverId, ref, {
        phase: 'pending',
        workId: ref.workId,
        instructions,
        interrupt,
        model: cloudAgentModelSelectionOf(run?.model),
        providerAgentId,
        predecessors: receipt.predecessors,
    });
    if (!claimed) {
        // A retry of this send may arrive after the Run's monitor settled it unsent.
        const settled = await journal.read(input.serverId, ref);
        if (settled?.phase === 'rejected' || settled?.phase === 'cancelled') {
            throw new CloudAgentFollowUpSettledError(settled);
        }
    }
    for (const predecessor of receipt.predecessors) {
        input.supervisor.watch(predecessor);
    }
    input.supervisor.watch(ref);
    return receipt;
}

/** The follow-up was already settled without reaching the provider; this send cannot deliver it. */
export class CloudAgentFollowUpSettledError extends Error {
    readonly code = 'CLOUD_AGENT_FOLLOW_UP_SETTLED';

    constructor(record: Extract<CloudLaunchRecord, { phase: 'rejected' | 'cancelled' }>) {
        super(
            record.phase === 'cancelled'
                ? 'This follow-up was cancelled before it reached the provider. Send it again if it is still needed.'
                : (record.summary ??
                      'This follow-up was settled failed before it reached the provider.')
        );
        this.name = 'CloudAgentFollowUpSettledError';
    }
}
