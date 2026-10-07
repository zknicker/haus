import { computerVersion } from './build-identity.ts';
import { progress, readUpdateProgress, writeUpdateProgress } from './update.ts';
import type { ComputerUpdateProgress } from './update-contract.ts';

/**
 * Any process that starts after an update restart settles it, so the Server sees the outcome
 * whether the resident or an attachment daemon comes up first. The running version decides:
 * the previous process's shutdown errors do not.
 */
export async function finishRestart(root: string, runningVersion = computerVersion) {
    const current = await readUpdateProgress(root);
    if (current.phase !== 'restarting') {
        return;
    }
    if (current.targetVersion === runningVersion) {
        await writeUpdateProgress(
            root,
            progress('complete', current.targetVersion, 'Haus Computer updated successfully.')
        );
        return;
    }
    await writeUpdateProgress(
        root,
        progress(
            'failed',
            current.targetVersion,
            `Haus Computer restarted on ${runningVersion} instead of ${current.targetVersion}.`,
            { failedPhase: 'restarting' }
        )
    );
}

export async function recoverInterruptedUpdate(root: string) {
    const current = await readUpdateProgress(root);
    if (!isInterruptedUpdatePhase(current.phase)) {
        return;
    }
    await writeUpdateProgress(
        root,
        progress(
            'failed',
            current.targetVersion,
            'Update was interrupted. Retry in Settings or run haus-computer upgrade locally.',
            {
                downloadedBytes: current.downloadedBytes,
                failedPhase: current.phase,
                totalBytes: current.totalBytes,
            }
        )
    );
}

function isInterruptedUpdatePhase(
    phase: ComputerUpdateProgress['phase']
): phase is 'downloading' | 'installing' | 'requested' | 'verifying' | 'waiting-for-agents' {
    return ['requested', 'downloading', 'verifying', 'installing', 'waiting-for-agents'].includes(
        phase
    );
}
