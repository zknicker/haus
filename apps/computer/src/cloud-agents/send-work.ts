import { agentCloudAgentSendReceiptSchema } from '@haus/api';
import { CloudLaunchJournal } from './launch-journal.ts';
import { CloudAgentServerError } from './launch-work.ts';
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
    await journal.claim(input.serverId, ref, {
        phase: 'pending',
        workId: ref.workId,
        instructions,
        interrupt,
        model: run?.model.id ?? null,
        providerAgentId,
        predecessors: receipt.predecessors,
    });
    for (const predecessor of receipt.predecessors) {
        input.supervisor.watch(predecessor);
    }
    input.supervisor.watch(ref);
    return receipt;
}
