import type { CloudAgentProviderObservation } from '../provider.ts';
import type { PullRequestReader } from './pull-request-reader.ts';

/** Whether an observation names a pull request worth reading GitHub for. */
export function carriesPullRequest(observation: CloudAgentProviderObservation): boolean {
    return observation.branches?.some((branch) => branch.pullRequestUrl !== null) ?? false;
}

/**
 * Adds the pull-request evidence a Run's branch report cannot carry on its own.
 * Cursor reports the pull request it opened but no diff statistics, so the
 * Computer reads GitHub once for the branch the work card shows and attaches a
 * bounded snapshot to the observation before it is reported.
 *
 * This runs before the observation is reported rather than after it, because
 * Server settles a Run on its first terminal observation and a later report
 * against a settled Run is correctly a no-op. The read is therefore bounded
 * and optional: a Run whose pull request cannot be read reports exactly what
 * it always reported. Daemon cancellation interrupts enrichment instead.
 */
export async function withPullRequestEvidence(
    observation: CloudAgentProviderObservation,
    reader: PullRequestReader,
    signal?: AbortSignal
): Promise<CloudAgentProviderObservation> {
    const branches = observation.branches;
    // The branch the card shows: the one carrying a pull request. One read per
    // observation, whatever else the Run's Git metadata reported.
    const index = branches?.findIndex((branch) => branch.pullRequestUrl !== null) ?? -1;
    const branch = index >= 0 ? branches?.[index] : undefined;
    if (!(branches && branch?.pullRequestUrl)) {
        return observation;
    }
    const pullRequest = await reader.read(branch.pullRequestUrl, signal);
    signal?.throwIfAborted();
    if (!pullRequest) {
        return observation;
    }
    return {
        ...observation,
        branches: branches.map((entry, at) => (at === index ? { ...entry, pullRequest } : entry)),
    };
}
