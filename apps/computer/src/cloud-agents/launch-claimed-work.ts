import type { AgentCloudAgentReceipt } from '@haus/api';
import { launchCloudAgent } from './launch-attempt.ts';
import type { CloudLaunchJournal } from './launch-journal.ts';
import {
    type CloudAgentLaunch,
    CloudAgentLaunchRejectedError,
    type CloudAgentProvider,
    type CloudAgentRunRef,
    cloudAgentModelSelectionOf,
} from './provider.ts';
import { launchRejection } from './send-delivery.ts';
import type { CloudAgentWorkSupervisor } from './work-runner.ts';

export interface ClaimedLaunch {
    instructions: string;
    journal: CloudLaunchJournal;
    provider: CloudAgentProvider;
    receipt: AgentCloudAgentReceipt;
    ref: CloudAgentRunRef;
    serverId: string;
    supervisor: Pick<CloudAgentWorkSupervisor, 'report' | 'watch'>;
}

/**
 * The slow half of a launch, after Server recorded the work and this Computer
 * claimed its Run: the provider call, which for Claude includes cloning the
 * repository. It runs detached from `haus cloud-agent start`, so the Agent's
 * command never waits on it. Every outcome lands on the work: the provider's
 * address once it confirms, or a failed or cancelled Run the inbox reports.
 */
export async function launchClaimedWork(claimed: ClaimedLaunch): Promise<void> {
    const { journal, provider, receipt, ref, serverId, supervisor } = claimed;
    const run = receipt.work.runs.find((candidate) => candidate.runId === receipt.runId);
    let launch: CloudAgentLaunch;
    try {
        launch = await launchCloudAgent(provider, {
            idempotencyKey: receipt.runId,
            instructions: claimed.instructions,
            // Server resolved the Server's chosen model, or its Auto fallback, onto the Run.
            model: cloudAgentModelSelectionOf(run?.model),
            ref: receipt.work.startingRef,
            repository: receipt.work.repository,
            title: receipt.work.title,
            workId: receipt.work.id,
        });
    } catch (cause) {
        await failLaunch(claimed, cause);
        return;
    }
    // Store the address before reporting it. Reconnect can recover a lost socket report.
    if (!(await journal.record(serverId, ref, launch))) {
        // A cancel or deadline settled the Run while the provider launched; its watch reported that.
        await provider.cancel({ ...ref, ...launch }, AbortSignal.timeout(15_000));
        return;
    }
    supervisor.report(ref, {
        observedAt: new Date().toISOString(),
        providerAgentId: launch.providerAgentId,
        ...(launch.environmentId ? { environmentId: launch.environmentId } : {}),
        ...(launch.environmentName ? { environmentName: launch.environmentName } : {}),
        ...(launch.providerRunId ? { providerRunId: launch.providerRunId } : {}),
        ...(launch.providerUrl ? { providerUrl: launch.providerUrl } : {}),
        status: launch.status,
        startedAt: launch.startedAt,
    });
    supervisor.watch({
        ...ref,
        providerAgentId: launch.providerAgentId,
        providerRunId: launch.providerRunId,
    });
}

async function failLaunch(claimed: ClaimedLaunch, cause: unknown): Promise<void> {
    const { journal, ref, serverId } = claimed;
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
    // The summary Server sees stays generic; the provider's own words stay in this Computer's log.
    console.error('Cloud Agent launch failed.', {
        cause: cause instanceof Error ? cause.message : String(cause),
        errorCode: rejection.errorCode,
        operation: 'cloud-agent.launch',
        provider: ref.provider,
        runId: ref.runId,
        workId: ref.workId,
    });
    await journal.reject(serverId, ref, rejection);
    const stopped = await journal.read(serverId, ref);
    const failure =
        stopped?.phase === 'rejected'
            ? { errorCode: stopped.errorCode, summary: stopped.summary ?? rejection.summary }
            : rejection;
    claimed.supervisor.report(ref, {
        ...(stopped?.phase === 'cancelled'
            ? { summary: 'The cloud agent launch was stopped.' }
            : failure),
        observedAt: new Date().toISOString(),
        status: stopped?.phase === 'cancelled' ? 'cancelled' : 'failed',
    });
}
