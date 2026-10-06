import { progress, readUpdateProgress, writeUpdateProgress } from './update.ts';
import type { ComputerUpdateProgress } from './update-contract.ts';

/**
 * Any process that starts after an update restart reports completion, so the Server sees
 * `complete` whether the resident or an attachment daemon comes up first.
 */
export async function finishRestart(root: string) {
    const current = await readUpdateProgress(root);
    if (current.phase !== 'restarting') {
        return;
    }
    await writeUpdateProgress(
        root,
        progress('complete', current.targetVersion, 'Haus Computer updated successfully.')
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
